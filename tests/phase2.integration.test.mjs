import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const projectId = 'kilani-phase2-test';
const config = { apiKey: 'test-key', authDomain: `${projectId}.firebaseapp.com`, projectId };
const apps = [];
let adminEnv;
let manager;
let setter;

function op(suffix) { return `phase2_operation_${suffix.padEnd(16, '0')}`; }
function movement(id, specId, type, pcs, ct, extra = {}) {
  return { id, type, actionType: type, location: 'TORONTO_MELEE', lines: [{ specId, pcs, ct, averageWeightSnapshot: 0.1 }], ...extra };
}
async function client(name, email) {
  const app = initializeApp(config, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const credential = await createUserWithEmailAndPassword(auth, email, 'Phase2-Test-Password!');
  const functions = getFunctions(app, 'northamerica-northeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { auth, uid: credential.user.uid, functions, db };
}
function call(app, name, payload) { return httpsCallable(app.functions, name)(payload).then((result) => result.data); }
async function seed(path, value) {
  await adminEnv.withSecurityRulesDisabled(async (context) => {
    const { setDoc } = await import('firebase/firestore');
    await setDoc(doc(context.firestore(), path), value);
  });
}
async function read(path) {
  let value = null;
  await adminEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await getDoc(doc(context.firestore(), path));
    value = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  });
  return value;
}

before(async () => {
  adminEnv = await initializeTestEnvironment({ projectId });
  manager = await client('phase2-manager', 'phase2-manager@example.test');
  setter = await client('phase2-setter', 'phase2-setter@example.test');
  await Promise.all([
    seed(`users/${manager.uid}`, { authUid: manager.uid, role: 'Manager', active: true }),
    seed(`users/${setter.uid}`, { authUid: setter.uid, role: 'Setter', active: true }),
    seed('projects/project-good', { code: 'P2', inventoryUsage: { bySpec: {} } }),
    seed('specs/spec-clean', { label: 'Clean', location: 'Melee', ctPerStone: 0.1, pcs: 5, ct: 0.5, stockVersion: 1 }),
    seed('specs/spec-mismatch', { label: 'Mismatch', location: 'Melee', ctPerStone: 0.1, pcs: 8, ct: 0.8, stockVersion: 1 }),
    seed('specs/spec-negative', { label: 'Negative', location: 'Melee', ctPerStone: 0.1, pcs: -1, ct: -0.1, stockVersion: 1 }),
    seed('specs/spec-bag', { label: 'Bag check', location: 'Melee', ctPerStone: 0.1, pcs: 0, ct: 0, stockVersion: 1 }),
    seed('specs/spec-orphan', { label: 'Orphan', location: 'Melee', ctPerStone: 0.1, pcs: 1, ct: 0.1, stockVersion: 1 }),
    seed(`inventory_operations/${op('clean')}`, { operationId: op('clean'), kind: 'RECEIPT', payloadHash: 'clean', status: 'COMMITTED', result: {} }),
    seed(`inventory_operations/${op('mismatch')}`, { operationId: op('mismatch'), kind: 'RECEIPT', payloadHash: 'mismatch', status: 'COMMITTED', result: {} }),
    seed(`movements/mov-clean`, movement('mov-clean', 'spec-clean', 'SHIPMENT_IN', 5, 0.5, { operationId: op('clean') })),
    seed(`movements/mov-mismatch`, movement('mov-mismatch', 'spec-mismatch', 'SHIPMENT_IN', 10, 1, { operationId: op('mismatch') })),
    seed(`movements/mov-negative`, movement('mov-negative', 'spec-negative', 'ISSUE', 2, 0.2)),
    seed(`movements/mov-issue-one`, movement('mov-issue-one', 'spec-bag', 'ISSUE', 2, 0.2, { referenceBagNumber: 'B-1', referenceProjectId: 'project-good' })),
    seed(`movements/mov-issue-two`, movement('mov-issue-two', 'spec-bag', 'ISSUE', 2, 0.2, { referenceBagNumber: 'B-1', referenceProjectId: 'project-good' })),
    seed(`movements/mov-orphan`, movement('mov-orphan', 'spec-orphan', 'SHIPMENT_IN', 1, 0.1, { referenceProjectId: 'missing-project' })),
    seed(`movements/mov-unknown`, movement('mov-unknown', 'removed-spec', 'SHIPMENT_IN', 1, 0.1)),
    seed('bags/bag-one', { bagNumber: 'B-1', projectId: 'project-good', items: [{ specId: 'spec-bag', issuedPcs: 2 }], returns: [{ status: 'CONFIRMED', lines: [{ specId: 'spec-bag', returnedPcs: 3 }] }] }),
    seed('diamond_transactions/legacy-unmatched', { specId: 'spec-clean', status: 'active', quantity: 5, carats: 0.5 }),
  ]);
  await Promise.all(Array.from({ length: 30 }, (_, index) => seed(`specs/spec-page-${String(index).padStart(2, '0')}`, {
    label: `Page ${index}`, location: 'Melee', ctPerStone: 0.01, pcs: 0, ct: 0, stockVersion: 0,
  })));
});

after(async () => {
  await adminEnv?.cleanup();
  await Promise.all(apps.map((app) => deleteApp(app)));
});

test('manager audit is dry-run, paginated, and detects reconciliation evidence', async () => {
  const beforeMismatch = await read('specs/spec-mismatch');
  const audit = await call(manager, 'runInventoryReconciliationAudit', { location: 'TORONTO_MELEE', dryRun: true, pageSize: 25 });
  assert.equal(audit.dryRun, true);
  assert.equal(audit.scannedSpecs <= 25, true, 'the browser receives a bounded spec page');
  assert.ok(audit.nextCursor, 'a large spec set returns a continuation cursor');
  assert.deepEqual(await read('specs/spec-mismatch'), beforeMismatch, 'audit makes no writes');
  const find = (id) => audit.lines.find((line) => line.specId === id);
  assert.equal(find('spec-mismatch').type, 'DISPLAYED_VS_EXPECTED_MISMATCH');
  assert.equal(find('spec-mismatch').correctionAllowed, true);
  assert.ok(find('spec-negative').detail.includes('negative'));
  assert.ok(find('spec-bag').detail.includes('multiple issue') || audit.lines.some((line) => line.specId === 'spec-bag' && line.type === 'DUPLICATE_ISSUE_DEDUCTION'));
  assert.ok(audit.lines.some((line) => line.specId === 'removed-spec' && line.type === 'UNKNOWN_SPECIFICATION'));
});

test('non-manager cannot run the reconciliation callable', async () => {
  await assert.rejects(call(setter, 'runInventoryReconciliationAudit', { dryRun: true }));
});

test('approved reconciliation correction is immutable, stale-safe, and idempotent', async () => {
  const audit = await call(manager, 'runInventoryReconciliationAudit', { dryRun: true, pageSize: 25 });
  const line = audit.lines.find((item) => item.specId === 'spec-mismatch');
  const payload = {
    operationId: op('approved-correction'), specId: 'spec-mismatch', reason: 'Manager-approved reconciliation test.',
    mode: 'PCS', previousPcs: line.currentPcs, previousCt: line.currentCt,
    targetPcs: line.expectedPcs, targetCt: line.expectedCt,
    reconciliation: { auditFingerprint: line.auditFingerprint, expectedPcs: line.expectedPcs, expectedCt: line.expectedCt, sourceEvidence: line.sourceEvidence },
  };
  const first = await call(manager, 'applyInventoryCorrection', payload);
  const retry = await call(manager, 'applyInventoryCorrection', payload);
  assert.deepEqual(retry, first, 'retry does not create a second reconciliation operation');
  assert.equal((await read('specs/spec-mismatch')).pcs, 10);
  assert.ok(await read(`inventory_operations/${payload.operationId}`));
  assert.ok(await read(`movements/${first.reversalMovementId}`));
  assert.ok(await read(`movements/${first.replacementMovementId}`));

  const stale = await call(manager, 'runInventoryReconciliationAudit', { dryRun: true, pageSize: 25 });
  const clean = stale.lines.find((item) => item.specId === 'spec-clean');
  await seed('specs/spec-clean', { label: 'Clean', location: 'Melee', ctPerStone: 0.1, pcs: 4, ct: 0.4, stockVersion: 2 });
  await assert.rejects(call(manager, 'applyInventoryCorrection', {
    operationId: op('stale-correction'), specId: 'spec-clean', reason: 'Must be blocked after audit changes.',
    mode: 'PCS', previousPcs: clean.currentPcs, previousCt: clean.currentCt, targetPcs: clean.expectedPcs, targetCt: clean.expectedCt,
    reconciliation: { auditFingerprint: clean.auditFingerprint, expectedPcs: clean.expectedPcs, expectedCt: clean.expectedCt, sourceEvidence: clean.sourceEvidence },
  }));
});
