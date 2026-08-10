import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from 'firebase/functions';
import {
  assertFails,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';

const projectId = 'kilani-phase9-test';
const config = { apiKey: 'test-key', authDomain: `${projectId}.firebaseapp.com`, projectId };
const apps = [];
let adminEnv;
let manager;
let setterA;
let setterB;
let designer;
let activation;

async function client(name, email) {
  const app = initializeApp(config, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const credential = await createUserWithEmailAndPassword(auth, email, 'Phase9-Test-Password!');
  const functions = getFunctions(app, 'northamerica-northeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { uid: credential.user.uid, functions, db };
}

const call = (actor, name, payload = {}) =>
  httpsCallable(actor.functions, name)(payload).then(result => result.data);

const seed = (path, value) =>
  adminEnv.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), path), value));

async function adminRead(path) {
  let snapshot;
  await adminEnv.withSecurityRulesDisabled(async context => {
    snapshot = await getDoc(doc(context.firestore(), path));
  });
  return snapshot;
}

async function adminQuery(collectionName, constraints = []) {
  let snapshot;
  await adminEnv.withSecurityRulesDisabled(async context => {
    snapshot = await getDocs(query(collection(context.firestore(), collectionName), ...constraints));
  });
  return snapshot;
}

async function waitFor(check, label, timeoutMs = 15000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await check();
    if (last) return last;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(last)}`);
}

async function intervalsFor(setterUid, project = undefined) {
  const constraints = [where('setterUid', '==', setterUid)];
  if (project) constraints.push(where('projectId', '==', project));
  const snapshot = await adminQuery('setter_assignment_intervals', constraints);
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
}

async function eventsFor(setterUid, eventType = undefined, project = undefined) {
  const constraints = [where('setterUid', '==', setterUid)];
  if (eventType) constraints.push(where('eventType', '==', eventType));
  if (project) constraints.push(where('projectId', '==', project));
  const snapshot = await adminQuery('setter_tracking_events', constraints);
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
}

before(async () => {
  adminEnv = await initializeTestEnvironment({ projectId });
  manager = await client('p9-manager', 'p9-manager@example.test');
  setterA = await client('p9-setter-a', 'p9-setter-a@example.test');
  setterB = await client('p9-setter-b', 'p9-setter-b@example.test');
  designer = await client('p9-designer', 'p9-designer@example.test');

  await Promise.all([
    seed(`users/${manager.uid}`, {
      authUid: manager.uid, name: 'Manager', role: 'Manager', active: true, legacyProfileIds: [],
    }),
    seed(`users/${setterA.uid}`, {
      authUid: setterA.uid, name: 'Setter A', role: 'Setter', active: true, legacyProfileIds: ['legacy-a'],
    }),
    seed(`users/${setterB.uid}`, {
      authUid: setterB.uid, name: 'Setter B', role: 'Setter', active: true, legacyProfileIds: [],
    }),
    seed(`users/${designer.uid}`, {
      authUid: designer.uid, name: 'Designer', role: 'Designer', active: true, legacyProfileIds: [],
    }),
    seed('projects/baseline-project', {
      code: 'BASELINE-1',
      status: 'Active',
      currentStageName: 'Setting',
      assignments: [{
        userId: 'legacy-a',
        active: true,
        assignedAt: '2024-01-01T00:00:00.000Z',
      }],
      activeAssignees: ['legacy-a'],
      services: [{ code: 'CUSTOM_MAKE', status: 'IN_PROGRESS' }],
    }),
    seed('projects/baseline-missing-time', {
      code: 'BASELINE-2',
      status: 'Active',
      currentStageName: 'Setting',
      assignments: [{ userId: setterB.uid, active: true }],
      activeAssignees: [setterB.uid],
      services: [{ code: 'CUSTOM_MAKE', status: 'IN_PROGRESS' }],
    }),
  ]);

  const dryRun = await call(manager, 'getPhase9SetterTrackingDryRun');
  assert.equal(dryRun.writesPerformed, 0);
  assert.equal(dryRun.activeBaselineIntervalCount, 2);
  activation = await call(manager, 'activatePhase9SetterTracking', {
    operationId: 'phase9_activation_test_0001',
    dryRunHash: dryRun.dryRunHash,
  });
});

after(async () => {
  await adminEnv?.cleanup();
  await Promise.all(apps.map(deleteApp));
});

test('activation creates a current-only baseline and does not backdate legacy elapsed time', async () => {
  assert.equal(activation.state, 'ACTIVE');
  assert.equal(activation.activeBaselineIntervalCount, 2);
  assert.equal(activation.projectWrites, 0);
  assert.equal(activation.inventoryWrites, 0);

  const intervals = await intervalsFor(setterA.uid, 'baseline-project');
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].active, true);
  assert.equal(intervals[0].historicalStartAvailable, false);
  assert.equal(intervals[0].legacyRecordedAssignedAt, '2024-01-01T00:00:00.000Z');
  assert.notEqual(
    intervals[0].startedAt.toDate().toISOString(),
    intervals[0].legacyRecordedAssignedAt
  );

  const project = await adminRead('projects/baseline-project');
  assert.equal(project.data().assignments[0].assignedAt, '2024-01-01T00:00:00.000Z');

  const missingTime = await intervalsFor(setterB.uid, 'baseline-missing-time');
  assert.equal(missingTime.length, 1);
  assert.equal(missingTime[0].legacyRecordedAssignedAt, null);
  assert.equal(missingTime[0].historicalStartAvailable, false);
});

test('initial Setter assignment starts one interval and an unrelated retry creates no duplicate', async () => {
  await seed('projects/live-project', {
    code: 'LIVE-1',
    pieceName: 'Ring',
    status: 'Active',
    currentStageName: 'Intake',
    currentPercentComplete: 10,
    assignments: [{ userId: designer.uid, active: true }],
    activeAssignees: [designer.uid],
    services: [{ code: 'CUSTOM_MAKE', status: 'IN_PROGRESS' }],
  });
  await adminEnv.withSecurityRulesDisabled(context => updateDoc(
    doc(context.firestore(), 'projects/live-project'),
    {
      assignments: [
        { userId: designer.uid, active: true },
        { userId: setterA.uid, active: true, assignedAt: '1999-01-01T00:00:00.000Z' },
      ],
      activeAssignees: [designer.uid, setterA.uid],
    }
  ));

  await waitFor(async () => {
    const intervals = await intervalsFor(setterA.uid, 'live-project');
    return intervals.length === 1 && intervals[0].active ? intervals : null;
  }, 'initial Phase 9 interval');

  await adminEnv.withSecurityRulesDisabled(context => updateDoc(
    doc(context.firestore(), 'projects/live-project'),
    { pieceName: 'Ring Updated' }
  ));
  await new Promise(resolve => setTimeout(resolve, 600));
  const intervals = await intervalsFor(setterA.uid, 'live-project');
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].dataQuality, 'phase9_server_observed');
  assert.equal(intervals[0].historicalStartAvailable, true);
});

test('reassignment closes Setter A and starts Setter B without losing participation', async () => {
  await adminEnv.withSecurityRulesDisabled(context => updateDoc(
    doc(context.firestore(), 'projects/live-project'),
    {
      assignments: [
        { userId: designer.uid, active: true },
        { userId: setterA.uid, active: false },
        { userId: setterB.uid, active: true },
      ],
      activeAssignees: [designer.uid, setterB.uid],
      assignedSetterId: setterB.uid,
    }
  ));

  await waitFor(async () => {
    const [a, b] = await Promise.all([
      intervalsFor(setterA.uid, 'live-project'),
      intervalsFor(setterB.uid, 'live-project'),
    ]);
    return a.some(interval => interval.active === false && interval.endedAt)
      && b.some(interval => interval.active === true)
      ? { a, b }
      : null;
  }, 'reassignment interval transition');

  assert.equal((await eventsFor(setterA.uid, 'assignment_ended', 'live-project')).length, 1);
  assert.equal((await eventsFor(setterB.uid, 'assignment_started', 'live-project')).length, 1);
});

test('completion is attributed only to the Setter assigned when completion occurs', async () => {
  await adminEnv.withSecurityRulesDisabled(context => updateDoc(
    doc(context.firestore(), 'projects/live-project'),
    {
      status: 'Review',
      date_completed: '1998-01-01T00:00:00.000Z',
      currentStageName: 'Complete',
      currentPercentComplete: 100,
    }
  ));

  const completedB = await waitFor(async () => {
    const events = await eventsFor(setterB.uid, 'project_completed');
    return events.length === 1 ? events : null;
  }, 'completion attribution');

  assert.equal(completedB.length, 1);
  assert.equal((await eventsFor(setterA.uid, 'project_completed')).length, 0);
  assert.equal((await eventsFor(setterB.uid, 'stage_transition')).length, 1);
  const bIntervals = await intervalsFor(setterB.uid, 'live-project');
  assert.ok(bIntervals[0].completedAt);
  assert.notEqual(
    bIntervals[0].completedAt.toDate().toISOString(),
    '1998-01-01T00:00:00.000Z'
  );
});

test('inactivity and legacy blocked status do not create inferred blocked-time events', async () => {
  const before = (await eventsFor(setterB.uid)).length;
  await adminEnv.withSecurityRulesDisabled(context => updateDoc(
    doc(context.firestore(), 'projects/live-project'),
    { status: 'Awaiting_Manager', last_status_change_at: '2000-01-01T00:00:00.000Z' }
  ));
  await new Promise(resolve => setTimeout(resolve, 600));
  const events = await eventsFor(setterB.uid);
  assert.equal(events.filter(event => /blocked/i.test(event.eventType)).length, 0);
  assert.equal(events.length, before);
});

test('bag and return records remain authoritative and are not copied into tracking events', async () => {
  const before = (await eventsFor(setterB.uid)).length;
  await seed('bags/p9-bag', {
    bagNumber: 'P9-BAG',
    projectId: 'live-project',
    issuedToId: setterB.uid,
    issuedAt: '2026-07-23T12:00:00.000Z',
    status: 'Returned_Pending_Count',
    returns: [{ id: 'p9-return', status: 'PENDING' }],
  });
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal((await eventsFor(setterB.uid)).length, before);
  assert.equal((await adminRead('bags/p9-bag')).data().status, 'Returned_Pending_Count');
});

test('changing a Setter to another role closes open intervals without deleting participation', async () => {
  await adminEnv.withSecurityRulesDisabled(context => updateDoc(
    doc(context.firestore(), `users/${setterB.uid}`),
    { role: 'Jeweller' }
  ));
  const intervals = await waitFor(async () => {
    const rows = await intervalsFor(setterB.uid, 'live-project');
    return rows.some(interval => interval.active === false && interval.endReason === 'setter_role_removed')
      ? rows
      : null;
  }, 'Setter role-change interval closure');
  assert.ok(intervals.some(interval => interval.endReason === 'setter_role_removed'));
  assert.ok((await eventsFor(setterB.uid, 'assignment_ended')).length >= 1);
});

test('feature state is Manager-only and keeps dashboard, exports, and scoring disabled', async () => {
  const state = await call(manager, 'getPhase9SetterAnalyticsFeatureState');
  assert.equal(state.analyticsEnabled, false);
  assert.equal(state.dashboardEnabled, false);
  assert.equal(state.csvExportEnabled, false);
  assert.equal(state.pdfExportEnabled, false);
  assert.equal(state.productivityScoringEnabled, false);
  assert.equal(state.trackedRole, 'Setter');
  assert.equal(state.message, 'Setter analytics will be available in a future update.');

  await assert.rejects(call(setterA, 'getPhase9SetterAnalyticsFeatureState'));
  await assert.rejects(call(designer, 'getPhase9SetterTrackingDryRun'));
  await assert.rejects(call(setterB, 'activatePhase9SetterTracking', {
    operationId: 'phase9_forbidden_activation',
    dryRunHash: 'forbidden',
  }));
});

test('all Phase 9 tracking documents reject direct client reads and writes', async () => {
  const intervals = await intervalsFor(setterA.uid, 'baseline-project');
  const events = await eventsFor(setterA.uid, 'assignment_started');
  assert.ok(intervals.length > 0);
  assert.ok(events.length > 0);

  await assertFails(getDoc(doc(manager.db, `setter_assignment_intervals/${intervals[0].id}`)));
  await assertFails(getDoc(doc(setterA.db, `setter_tracking_events/${events[0].id}`)));
  await assertFails(setDoc(doc(manager.db, 'setter_tracking_events/forged'), {
    setterUid: setterA.uid,
    eventType: 'project_completed',
  }));
});
