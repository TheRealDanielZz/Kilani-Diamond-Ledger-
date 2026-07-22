import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc, updateDoc } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const projectId = 'kilani-phase4-test';
const config = { apiKey: 'test-key', authDomain: `${projectId}.firebaseapp.com`, projectId };
const apps = [];
let adminEnv;
let manager;
let assignedDesigner;
let unassignedDesigner;
let setter;
let jeweller;

function operation(suffix) {
  return `phase4_operation_${suffix.padEnd(16, '0')}`;
}

async function client(name, email) {
  const app = initializeApp(config, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const credential = await createUserWithEmailAndPassword(auth, email, 'Phase4-Test-Password!');
  const functions = getFunctions(app, 'northamerica-northeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { uid: credential.user.uid, functions, db };
}

function call(app, payload) {
  return httpsCallable(app.functions, 'reviseProjectDetails')(payload).then(result => result.data);
}

function callFunction(app, name, payload) {
  return httpsCallable(app.functions, name)(payload).then(result => result.data);
}

async function seed(path, value) {
  await adminEnv.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), path), value));
}

async function read(path) {
  let value = null;
  await adminEnv.withSecurityRulesDisabled(async context => {
    const snapshot = await getDoc(doc(context.firestore(), path));
    value = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  });
  return value;
}

async function list(path) {
  let values = [];
  await adminEnv.withSecurityRulesDisabled(async context => {
    const snapshot = await getDocs(collection(context.firestore(), path));
    values = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  });
  return values;
}

before(async () => {
  adminEnv = await initializeTestEnvironment({ projectId });
  manager = await client('phase4-manager', 'phase4-manager@example.test');
  assignedDesigner = await client('phase4-assigned-designer', 'phase4-assigned@example.test');
  unassignedDesigner = await client('phase4-unassigned-designer', 'phase4-unassigned@example.test');
  setter = await client('phase4-setter', 'phase4-setter@example.test');
  jeweller = await client('phase4-jeweller', 'phase4-jeweller@example.test');
  await Promise.all([
    seed(`users/${manager.uid}`, { authUid: manager.uid, name: 'Manager', role: 'Manager', active: true, legacyProfileIds: [] }),
    seed(`users/${assignedDesigner.uid}`, { authUid: assignedDesigner.uid, name: 'Assigned Designer', role: 'Designer', active: true, legacyProfileIds: ['legacy-designer'] }),
    seed(`users/${unassignedDesigner.uid}`, { authUid: unassignedDesigner.uid, name: 'Other Designer', role: 'Designer', active: true, legacyProfileIds: [] }),
    seed(`users/${setter.uid}`, { authUid: setter.uid, name: 'Setter', role: 'Setter', active: true, legacyProfileIds: [] }),
    seed(`users/${jeweller.uid}`, { authUid: jeweller.uid, name: 'Jeweller', role: 'Jeweller', active: true, legacyProfileIds: [] }),
    seed('projects/active-project', {
      code: 'P4-ACTIVE', status: 'Active', workDetails: 'Original instructions',
      goldType: 'Yellow', goldPurity: '10k',
      goldComponents: [
        { id: 'main', label: 'Main ring', type: 'Yellow', purity: '10k', weightG: 12.5, ratioSnapshot: 0.417 },
        { id: 'accent', label: 'Accent', type: 'White', purity: '14k', weightG: 1.2 },
      ],
      instructionRevisionVersion: 0, metalRevisionVersion: 0,
      activeAssignees: ['legacy-designer', setter.uid],
      assignments: [{ userId: 'legacy-designer', active: true }, { userId: setter.uid, active: true }],
    }),
    seed('projects/picked-up-project', {
      code: 'P4-CLOSED', status: 'Closed', date_picked_up: '2026-07-20T12:00:00.000Z',
      workDetails: 'Locked instructions', goldType: 'White', goldPurity: '14k',
      goldComponents: [{ id: 'main', label: 'Main', type: 'White', purity: '14k', weightG: 10 }],
      activeAssignees: [assignedDesigner.uid], assignments: [{ userId: assignedDesigner.uid, active: true }],
    }),
  ]);
});

after(async () => {
  await adminEnv?.cleanup();
  await Promise.all(apps.map(app => deleteApp(app)));
});

test('Manager revision is atomic, immutable, idempotent, and notifies each assigned recipient once', async () => {
  const payload = {
    operationId: operation('manager-instructions'), projectId: 'active-project', kind: 'INSTRUCTIONS',
    reason: 'Client clarified the setting style.', expectedVersion: 0,
    expectedInstructions: 'Original instructions', instructions: 'Updated instructions',
  };
  const first = await call(manager, payload);
  const retry = await call(manager, payload);
  assert.deepEqual(retry, first);
  assert.equal((await read('projects/active-project')).workDetails, 'Updated instructions');
  const revision = await read(`projects/active-project/revisions/${payload.operationId}`);
  assert.equal(revision.before.instructions, 'Original instructions');
  assert.equal(revision.after.instructions, 'Updated instructions');
  assert.equal(revision.reason, payload.reason);
  assert.equal(revision.editor.uid, manager.uid);
  assert.ok(revision.serverCreatedAt);
  const notifications = (await list('notifications')).filter(item => item.metadata?.revisionId === payload.operationId);
  assert.equal(notifications.length, 2);
  assert.deepEqual(notifications.map(item => item.userId).sort(), [assignedDesigner.uid, setter.uid].sort());
  assert.ok(notifications.every(item => item.type === 'PROJECT_REVISION' && item.link === '/project/active-project'));
  assert.equal(await read(`emails/${payload.operationId}`), null, 'Phase 4 does not create email work');
});

test('assigned Designer can edit, while unassigned Designer, Setter, Jeweller, and missing reason are blocked', async () => {
  const allowed = {
    operationId: operation('designer-instructions'), projectId: 'active-project', kind: 'INSTRUCTIONS',
    reason: 'Design review correction.', expectedVersion: 1,
    expectedInstructions: 'Updated instructions', instructions: 'Designer replacement instructions',
  };
  await call(assignedDesigner, allowed);
  assert.equal((await read('projects/active-project')).workDetails, allowed.instructions);

  const blocked = { ...allowed, operationId: operation('blocked-user'), expectedVersion: 2, expectedInstructions: allowed.instructions, instructions: 'Unauthorized overwrite' };
  await assert.rejects(call(unassignedDesigner, blocked));
  await assert.rejects(call(setter, { ...blocked, operationId: operation('setter-blocked') }));
  await assert.rejects(call(jeweller, { ...blocked, operationId: operation('jeweller-blocked') }));
  await assert.rejects(call(manager, { ...blocked, operationId: operation('reason-blocked'), reason: '' }));
  assert.equal((await read('projects/active-project')).workDetails, allowed.instructions);
});

test('stale instruction edit is rejected without replacing the newer revision', async () => {
  await assert.rejects(call(manager, {
    operationId: operation('stale-instructions'), projectId: 'active-project', kind: 'INSTRUCTIONS',
    reason: 'This screen is stale.', expectedVersion: 1,
    expectedInstructions: 'Updated instructions', instructions: 'Stale replacement',
  }));
  assert.equal((await read('projects/active-project')).workDetails, 'Designer replacement instructions');
  assert.equal(await read(`projects/active-project/revisions/${operation('stale-instructions')}`), null);
});

test('10K to 14K metal revision preserves component production data and original history', async () => {
  const payload = {
    operationId: operation('metal-10k-14k'), projectId: 'active-project', kind: 'METAL',
    reason: 'Client approved 14K.', expectedVersion: 0,
    expectedMetal: 'Yellow', expectedPurity: '10k', metal: 'Yellow', purity: '14k',
  };
  await call(manager, payload);
  const project = await read('projects/active-project');
  assert.equal(project.goldType, 'Yellow');
  assert.equal(project.goldPurity, '14k');
  assert.deepEqual(project.goldComponents[0], { id: 'main', label: 'Main ring', type: 'Yellow', purity: '14k', weightG: 12.5, ratioSnapshot: 0.417 });
  assert.deepEqual(project.goldComponents[1], { id: 'accent', label: 'Accent', type: 'White', purity: '14k', weightG: 1.2 });
  const revision = await read(`projects/active-project/revisions/${payload.operationId}`);
  assert.deepEqual(revision.before, { metal: 'Yellow', purity: '10k' });
  assert.deepEqual(revision.after, { metal: 'Yellow', purity: '14k' });
});

test('direct API cannot bypass revision history or forge/delete a Phase 4 notification', async () => {
  await assert.rejects(updateDoc(doc(manager.db, 'projects/active-project'), { workDetails: 'Direct bypass' }));
  await assert.rejects(updateDoc(doc(assignedDesigner.db, 'projects/active-project'), { goldType: 'Rose', goldPurity: '18k' }));
  const current = await read('projects/active-project');
  await assert.rejects(updateDoc(doc(assignedDesigner.db, 'projects/active-project'), {
    goldComponents: current.goldComponents.map((component, index) => index === 0 ? { ...component, type: 'Rose' } : component),
  }));
  await assert.rejects(setDoc(doc(manager.db, 'notifications/forged-phase4'), {
    userId: setter.uid, createdById: manager.uid, type: 'PROJECT_REVISION', title: 'Forged', message: 'Forged',
  }));
  const existing = (await list('notifications')).find(item => item.type === 'PROJECT_REVISION');
  await assert.rejects(deleteDoc(doc(manager.db, `notifications/${existing.id}`)));
});

test('Picked Up is a hard lock through callable and direct API while historical projects stay readable', async () => {
  await assert.rejects(call(manager, {
    operationId: operation('closed-callable'), projectId: 'picked-up-project', kind: 'INSTRUCTIONS',
    reason: 'Must remain locked.', expectedVersion: 0,
    expectedInstructions: 'Locked instructions', instructions: 'Illegal replacement',
  }));
  await assert.rejects(updateDoc(doc(manager.db, 'projects/picked-up-project'), { workDetails: 'Direct replacement' }));
  await assert.rejects(updateDoc(doc(manager.db, 'projects/picked-up-project'), { status: 'Active', date_picked_up: null }));
  await assert.rejects(deleteDoc(doc(manager.db, 'projects/picked-up-project')));
  assert.equal((await getDoc(doc(manager.db, 'projects/picked-up-project'))).exists(), true);
  assert.equal((await getDoc(doc(setter.db, 'projects/picked-up-project'))).exists(), true);
});

test('assigned staff notifications use a trusted, idempotent path while unassigned users are blocked', async () => {
  const payload = {
    operationId: operation('setter-status-event'),
    projectId: 'active-project',
    targetUserId: assignedDesigner.uid,
    type: 'STATUS_UPDATE',
    title: 'Service Updated',
    message: 'Setting status changed in P4-ACTIVE',
  };
  const first = await callFunction(setter, 'createProjectNotification', payload);
  const retry = await callFunction(setter, 'createProjectNotification', payload);
  assert.deepEqual(retry, first);
  const notification = await read(`notifications/${first.notificationId}`);
  assert.equal(notification.userId, assignedDesigner.uid);
  assert.equal(notification.createdById, setter.uid);
  assert.equal(notification.link, '/project/active-project');
  await assert.rejects(callFunction(unassignedDesigner, 'createProjectNotification', {
    ...payload,
    operationId: operation('unassigned-event'),
  }));
});

test('production handoff is atomic, removes the former assignee, updates legacy assignment, and notifies once', async () => {
  const payload = {
    operationId: operation('setter-handoff'),
    projectId: 'active-project',
    targetUserId: jeweller.uid,
    note: 'Ready for the next production step.',
    weightG: 4.25,
  };
  const first = await callFunction(setter, 'handoffProject', payload);
  const retry = await callFunction(setter, 'handoffProject', payload);
  assert.deepEqual(retry, first);
  const project = await read('projects/active-project');
  assert.equal(project.activeAssignees.includes(setter.uid), false);
  assert.equal(project.activeAssignees.includes(jeweller.uid), true);
  assert.equal(project.assignedSetterId, jeweller.uid);
  assert.equal(project.progress.filter(item => item.id === `handoff_${payload.operationId}`).length, 1);
  const notification = await read(`notifications/${first.notificationId}`);
  assert.equal(notification.userId, jeweller.uid);
  assert.equal(notification.type, 'HANDOFF');
});
