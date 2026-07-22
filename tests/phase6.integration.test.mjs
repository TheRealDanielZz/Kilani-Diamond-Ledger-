import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const projectId = 'kilani-phase6-test';
const config = { apiKey: 'test-key', authDomain: `${projectId}.firebaseapp.com`, projectId };
const apps = [];
let adminEnv, manager, designer;

async function client(name, email) {
  const app = initializeApp(config, name); apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const credential = await createUserWithEmailAndPassword(auth, email, 'Phase6-Test-Password!');
  const functions = getFunctions(app, 'northamerica-northeast1'); connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { uid: credential.user.uid, functions, db };
}

const call = (app, name, payload = {}) => httpsCallable(app.functions, name)(payload).then(result => result.data);
const seed = (path, value) => adminEnv.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), path), value));
async function read(path) { let value; await adminEnv.withSecurityRulesDisabled(async context => { const snap = await getDoc(doc(context.firestore(), path)); value = snap.exists() ? snap.data() : null; }); return value; }

const unchanged = {
  status: 'Active', currentStageName: 'Setting', currentPercentComplete: 70,
  cost: { total: 123 }, bags: ['bag-1'], projectPhotos: ['photo.jpg'],
  assignments: [{ userId: 'staff-1', active: true }],
};

before(async () => {
  adminEnv = await initializeTestEnvironment({ projectId });
  manager = await client('p6-manager', 'p6-manager@example.test');
  designer = await client('p6-designer', 'p6-designer@example.test');
  await Promise.all([
    seed(`users/${manager.uid}`, { authUid: manager.uid, name: 'Manager', role: 'Manager', active: true, legacyProfileIds: [] }),
    seed(`users/${designer.uid}`, { authUid: designer.uid, name: 'Designer', role: 'Designer', active: true, legacyProfileIds: [] }),
    seed('projects/a-new-setting', { code: 'A', ...unchanged, services: [{ name: 'Setting', status: 'COMPLETED' }, { name: 'Custom Make', status: 'IN_PROGRESS' }] }),
    seed('projects/b-ambiguous', { code: 'B', ...unchanged, services: [{ name: 'Setting', status: 'IN_PROGRESS' }] }),
    seed('projects/c-repair', { code: 'C', ...unchanged, services: [{ name: 'Repair', status: 'PENDING' }], repair: { type: 'General Repair', status: 'Intake', financials: {} } }),
    seed('projects/d-resize', { code: 'D', ...unchanged, services: [{ name: 'Resize', status: 'COMPLETED' }] }),
    seed('projects/e-custom', { code: 'E', ...unchanged, services: [{ name: 'Custom Make', status: 'PENDING' }] }),
  ]);
});

after(async () => { await adminEnv?.cleanup(); await Promise.all(apps.map(deleteApp)); });

test('dry run is Manager-only, classifies exact mappings, and performs no writes', async () => {
  await assert.rejects(call(designer, 'getPhase6ServiceMigrationDryRun'));
  const result = await call(manager, 'getPhase6ServiceMigrationDryRun');
  assert.equal(result.projectCount, 5);
  assert.equal(result.classificationCounts.CUSTOM_MAKE, 2);
  assert.equal(result.classificationCounts.REPAIR, 2);
  assert.equal(result.classificationCounts.MANAGER_REVIEW_REQUIRED, 1);
  assert.equal(result.writesPerformed, 0);
  assert.equal(await read('system_migrations/phase6-service-canonical-v1'), null);
  assert.equal((await read('projects/b-ambiguous')).services[0].name, 'Setting');
});

test('migration requires confirmation and resumes in idempotent batches', async () => {
  const dryRun = await call(manager, 'getPhase6ServiceMigrationDryRun');
  await assert.rejects(call(manager, 'applyPhase6ServiceMigration', { dryRunHash: dryRun.dryRunHash, batchSize: 2 }));
  const payload = { confirmation: 'EXECUTE_PHASE6_SERVICE_MIGRATION', dryRunHash: dryRun.dryRunHash, batchSize: 2 };
  const first = await call(manager, 'applyPhase6ServiceMigration', payload);
  assert.equal(first.processed, 2);
  assert.equal(first.complete, false);
  const second = await call(manager, 'applyPhase6ServiceMigration', payload);
  assert.equal(second.processed, 2);
  const third = await call(manager, 'applyPhase6ServiceMigration', payload);
  assert.equal(third.processed, 1);
  assert.equal(third.complete, true);
  const retry = await call(manager, 'applyPhase6ServiceMigration', payload);
  assert.equal(retry.processed, 0);
  assert.equal(retry.complete, true);
});

test('migration keeps unrelated project data and creates one immutable history plus backup record', async () => {
  const custom = await read('projects/a-new-setting');
  assert.deepEqual(custom.services, [{ code: 'CUSTOM_MAKE', status: 'IN_PROGRESS' }]);
  assert.equal(custom.serviceMigration.ruleId, 'NEW_MANUFACTURE_SETTING_TO_CUSTOM_MAKE');
  const ambiguous = await read('projects/b-ambiguous');
  assert.deepEqual(ambiguous.services, [{ code: 'MANAGER_REVIEW_REQUIRED', status: 'IN_PROGRESS' }]);
  assert.equal(ambiguous.serviceMigration.status, 'MANAGER_REVIEW_REQUIRED');
  for (const field of ['status', 'currentStageName', 'currentPercentComplete', 'cost', 'bags', 'projectPhotos', 'assignments']) {
    assert.deepEqual(custom[field], unchanged[field]);
  }
  const history = await read('projects/a-new-setting/revisions/service-migration-phase6-service-canonical-v1');
  assert.equal(history.kind, 'SERVICE_MIGRATION');
  assert.equal(history.before.services.length, 2);
  assert.equal((await read('system_migrations/phase6-service-canonical-v1/backups/a-new-setting')).originalServices.length, 2);
});

test('rollback restores only original service values and is resumable', async () => {
  const payload = { confirmation: 'ROLLBACK_PHASE6_SERVICE_MIGRATION', batchSize: 2 };
  await call(manager, 'rollbackPhase6ServiceMigration', payload);
  await call(manager, 'rollbackPhase6ServiceMigration', payload);
  await call(manager, 'rollbackPhase6ServiceMigration', payload);
  const restored = await read('projects/a-new-setting');
  assert.deepEqual(restored.services, [{ name: 'Setting', status: 'COMPLETED' }, { name: 'Custom Make', status: 'IN_PROGRESS' }]);
  assert.equal(restored.serviceMigration, undefined);
  assert.deepEqual(restored.cost, unchanged.cost);
  assert.equal((await read('projects/a-new-setting/revisions/service-migration-rollback-phase6-service-canonical-v1')).kind, 'SERVICE_MIGRATION_ROLLBACK');
});
