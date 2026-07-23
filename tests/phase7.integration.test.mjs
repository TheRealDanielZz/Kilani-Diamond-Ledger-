import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getFirestore, setDoc } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const projectId = 'kilani-phase7-test';
const config = { apiKey: 'test-key', authDomain: `${projectId}.firebaseapp.com`, projectId };
const apps = [];
let adminEnv, manager, designer, setter;

async function client(name, email) {
  const app = initializeApp(config, name); apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const credential = await createUserWithEmailAndPassword(auth, email, 'Phase7-Test-Password!');
  const functions = getFunctions(app, 'northamerica-northeast1'); connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { uid: credential.user.uid, functions, db };
}

const call = (actor, name, payload) => httpsCallable(actor.functions, name)(payload).then(result => result.data);
const seed = (path, value) => adminEnv.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), path), value));

before(async () => {
  adminEnv = await initializeTestEnvironment({ projectId });
  manager = await client('p7-manager', 'p7-manager@example.test');
  designer = await client('p7-designer', 'p7-designer@example.test');
  setter = await client('p7-setter', 'p7-setter@example.test');
  await Promise.all([
    seed(`users/${manager.uid}`, { authUid: manager.uid, name: 'Manager', role: 'Manager', active: true, location: 'Toronto', legacyProfileIds: [] }),
    seed(`users/${designer.uid}`, { authUid: designer.uid, name: 'Designer', role: 'Designer', active: true, location: 'Both', legacyProfileIds: [] }),
    seed(`users/${setter.uid}`, { authUid: setter.uid, name: 'Setter', role: 'Setter', active: true, location: 'Toronto', legacyProfileIds: [] }),
    seed('specs/spec-toronto', { label: '1.0mm Round', location: 'Toronto' }),
    seed('specs/spec-miami', { label: '2.0mm Round', location: 'Miami' }),
    seed('projects/custom-active', {
      code: 'CUSTOM-1', clientName: 'Amiyah', pieceName: 'Necklace', status: 'Active',
      priority: 'Rush', dueDate: '2026-07-25', createdAt: '2026-07-20T10:00:00.000Z',
      last_status_change_at: '2026-07-23T10:00:00.000Z',
      currentStageName: 'Casting', currentPercentComplete: 40,
      projectPhotos: ['https://example.test/old.jpg', 'https://example.test/latest.jpg'],
      assignments: [{ userId: designer.uid, active: true }],
      salesRepId: designer.uid, services: [{ code: 'CUSTOM_MAKE', status: 'IN_PROGRESS' }],
    }),
    seed('projects/repair-active', {
      code: 'REPAIR-1', clientName: 'Alayah', pieceName: 'Ring', status: 'Active',
      priority: 'Normal', dueDate: '2026-07-24', createdAt: '2026-07-21T10:00:00.000Z',
      last_status_change_at: '2026-07-24T10:00:00.000Z', salesRepId: designer.uid,
      services: [{ code: 'REPAIR', status: 'IN_PROGRESS' }],
      repair: { type: 'Resize', status: 'Intake', financials: { noCharge: true } },
    }),
    seed('projects/repair-closed', {
      code: 'REPAIR-2', clientName: 'Amari', pieceName: 'Bracelet', status: 'Closed',
      createdAt: '2026-07-22T10:00:00.000Z', salesRepId: designer.uid,
      services: [{ code: 'REPAIR', status: 'COMPLETED' }],
      repair: { type: 'General Repair', status: 'Complete', financials: { outsourced: true } },
    }),
    seed('diamond_transactions/toronto-tx', {
      createdAt: '2026-07-22T12:00:00.000Z', movementType: 'used', referenceProjectId: 'custom-active',
      referenceBagNumber: 'B-1', specId: 'spec-toronto', color: 'White', quantity: -2, carats: -0.02,
      unitCost: 100, totalValue: -2, createdById: setter.uid, notes: 'Toronto use',
    }),
    seed('diamond_transactions/miami-tx', {
      createdAt: '2026-07-22T13:00:00.000Z', movementType: 'used', referenceProjectId: 'repair-active',
      referenceBagNumber: 'B-2', specId: 'spec-miami', color: 'White', quantity: -4, carats: -0.04,
      unitCost: 100, totalValue: -4, createdById: setter.uid, notes: 'Miami use',
    }),
    seed('movements/toronto-movement', {
      createdAt: '2026-07-22T12:00:00.000Z', type: 'BROKEN_OUT', referenceProjectId: 'repair-active',
      referenceBagNumber: 'B-1', createdById: setter.uid, location: 'Toronto', notes: 'Broken Toronto',
      lines: [{ specId: 'spec-toronto', pcs: 1, ct: 0.01 }],
    }),
    seed('movements/miami-movement', {
      createdAt: '2026-07-22T13:00:00.000Z', type: 'BROKEN_OUT', referenceProjectId: 'repair-active',
      referenceBagNumber: 'B-2', createdById: setter.uid, location: 'Miami', notes: 'Broken Miami',
      lines: [{ specId: 'spec-miami', pcs: 1, ct: 0.02 }],
    }),
    seed('system_logs/log-1', { createdAt: '2026-07-22T14:00:00.000Z', createdById: manager.uid, action: 'PROJECT_UPDATED', details: 'Updated CUSTOM-1' }),
    seed('requests/request-1', {
      requestedAt: '2026-07-22T15:00:00.000Z', requestedById: setter.uid, projectId: 'custom-active',
      status: 'OPEN', jobNumberSnapshot: 'CUSTOM-1', lines: [{ specId: 'spec-toronto', requestedPcs: 2 }],
    }),
    seed('bags/bag-1', {
      bagNumber: 'B-1', projectId: 'custom-active', issuedToId: setter.uid, status: 'Returned_Pending_Count',
      returns: [{ id: 'return-1', status: 'PENDING', submittedAt: '2026-07-22T16:00:00.000Z', notes: 'Ready', lines: [{ specId: 'spec-toronto', returnedPcs: 1 }] }],
    }),
  ]);
});

after(async () => {
  await adminEnv?.cleanup();
  await Promise.all(apps.map(deleteApp));
});

test('canonical Project History filters use OR within fields and AND across fields', async () => {
  const result = await call(manager, 'queryPhase7Report', {
    section: 'PROJECT_HISTORY',
    selections: { service: ['CUSTOM_MAKE', 'REPAIR'], status: ['Active'] },
    pageSize: 25,
  });
  assert.equal(result.total, 2);
  assert.deepEqual(result.rows.map(row => row.code).sort(), ['CUSTOM-1', 'REPAIR-1']);

  const repairOnly = await call(manager, 'queryPhase7Report', {
    section: 'PROJECT_HISTORY',
    selections: { service: ['REPAIR'], repairFlag: ['NO_CHARGE', 'OUTSOURCED'] },
  });
  assert.equal(repairOnly.total, 2);
  assert.ok(repairOnly.rows.every(row => row.serviceCode === 'REPAIR'));
});

test('search, count, pagination, and CSV export evaluate the same normalized filters', async () => {
  const filters = { section: 'PROJECT_HISTORY', search: 'Amiyha necklce', selections: { service: ['CUSTOM_MAKE'] } };
  const page = await call(manager, 'queryPhase7Report', { ...filters, pageSize: 1 });
  const exported = await call(manager, 'exportPhase7ReportCsv', filters);
  assert.equal(page.total, 1);
  assert.equal(page.rows[0].code, 'CUSTOM-1');
  assert.equal(exported.total, page.total);
  assert.match(exported.csv, /CUSTOM-1/);
  assert.equal(exported.csv.split('\r\n').length - 1, exported.total);
});

test('location scope applies before rows, counts, and exports', async () => {
  const weekly = await call(manager, 'queryPhase7Report', { section: 'WEEKLY_MOVEMENT' });
  const ledger = await call(manager, 'queryPhase7Report', { section: 'INVENTORY_LEDGER' });
  const exported = await call(manager, 'exportPhase7ReportCsv', { section: 'BROKEN_STONES' });
  assert.equal(weekly.total, 1);
  assert.equal(weekly.rows[0].specId, 'spec-toronto');
  assert.equal(ledger.total, 1);
  assert.equal(exported.total, 1);
  assert.doesNotMatch(exported.csv, /Miami/);
});

test('Designer may query reporting data; Setter is blocked from private reports and inventory export', async () => {
  const designerResult = await call(designer, 'queryPhase7Report', { section: 'SYSTEM_LOGS' });
  assert.equal(designerResult.total, 1);
  await assert.rejects(call(setter, 'queryPhase7Report', { section: 'SYSTEM_LOGS' }));
  await assert.rejects(call(setter, 'exportPhase7ReportCsv', { section: 'INVENTORY_LEDGER' }));
});

test('All Projects stays readable for authenticated staff while Requests and Returns remain Manager-only', async () => {
  const projects = await call(setter, 'queryPhase7Report', {
    section: 'ALL_PROJECTS',
    selections: { status: ['Active'] },
    pageSize: 1,
  });
  assert.equal(projects.total, 2);
  assert.equal(projects.rows.length, 1);
  assert.equal(projects.rows[0].id, 'custom-active');
  assert.equal(projects.rows[0].previewImage, 'https://example.test/latest.jpg');
  assert.equal(projects.rows[0].currentStageName, 'Casting');
  assert.equal(projects.rows[0].progress, 40);
  assert.deepEqual(projects.rows[0].assignees, [{
    id: designer.uid,
    name: 'Designer',
    color: '',
    image: '',
  }]);
  assert.equal(projects.nextCursor, 'p7:1');

  const nextProjects = await call(setter, 'queryPhase7Report', {
    section: 'ALL_PROJECTS',
    selections: { status: ['Active'] },
    pageSize: 1,
    cursor: projects.nextCursor,
  });
  assert.equal(nextProjects.rows[0].id, 'repair-active');
  assert.equal(nextProjects.nextCursor, null);
  const requests = await call(manager, 'queryPhase7Report', { section: 'REQUESTS', selections: { status: ['OPEN'] } });
  const returns = await call(manager, 'queryPhase7Report', { section: 'RETURNS', selections: { status: ['PENDING'] } });
  assert.equal(requests.total, 1);
  assert.equal(returns.total, 1);
  await assert.rejects(call(designer, 'queryPhase7Report', { section: 'REQUESTS' }));
  await assert.rejects(call(setter, 'queryPhase7Report', { section: 'RETURNS' }));
});
