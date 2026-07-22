import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { connectStorageEmulator, getStorage, ref, uploadBytes } from 'firebase/storage';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const projectId = 'kilani-phase1-test';
const config = { apiKey: 'test-key', authDomain: `${projectId}.firebaseapp.com`, projectId, storageBucket: `${projectId}.appspot.com` };
const apps = [];
let adminEnv;
let manager1;
let manager2;
let setter;
let otherSetter;

function op(suffix) {
  return `phase1_operation_${suffix.padEnd(16, '0')}`;
}

async function makeClient(name, email) {
  const app = initializeApp(config, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const credential = await createUserWithEmailAndPassword(auth, email, 'Phase1-Test-Password!');
  const functions = getFunctions(app, 'northamerica-northeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const storage = getStorage(app);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  return { app, auth, uid: credential.user.uid, functions, db, storage };
}

function callable(client, name, payload) {
  return httpsCallable(client.functions, name)(payload).then(result => result.data);
}

async function seed(path, value) {
  await adminEnv.withSecurityRulesDisabled(async context => {
    const { setDoc } = await import('firebase/firestore');
    await setDoc(doc(context.firestore(), path), value);
  });
}

async function read(path) {
  let value = null;
  await adminEnv.withSecurityRulesDisabled(async context => {
    const snap = await getDoc(doc(context.firestore(), path));
    value = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  });
  return value;
}

async function uploadEvidence(client, kind, operationId, project, bytes = [1, 2, 3]) {
  const path = `evidence/${kind}/${client.uid}/${operationId}/original.jpg`;
  await uploadBytes(ref(client.storage, path), new Uint8Array(bytes), {
    contentType: 'image/jpeg',
    customMetadata: { uploaderUid: client.uid, operationId, projectId: project, evidenceKind: kind },
  });
  return path;
}

before(async () => {
  adminEnv = await initializeTestEnvironment({ projectId });
  manager1 = await makeClient('phase1-manager-1', 'manager1@example.test');
  manager2 = await makeClient('phase1-manager-2', 'manager2@example.test');
  setter = await makeClient('phase1-setter', 'setter@example.test');
  otherSetter = await makeClient('phase1-other-setter', 'other@example.test');
  await Promise.all([
    seed(`users/${manager1.uid}`, { authUid: manager1.uid, name: 'Manager One', role: 'Manager', active: true }),
    seed(`users/${manager2.uid}`, { authUid: manager2.uid, name: 'Manager Two', role: 'Manager', active: true }),
    seed(`users/${setter.uid}`, { authUid: setter.uid, name: 'Setter One', role: 'Setter', active: true, legacyProfileIds: ['legacy-setter-1'] }),
    seed(`users/${otherSetter.uid}`, { authUid: otherSetter.uid, name: 'Other Setter', role: 'Setter', active: true }),
    seed('projects/project-1', { code: 'P1', activeAssignees: [setter.uid], assignments: [{ userId: setter.uid, active: true }] }),
    seed('projects/project-2', { code: 'P2', activeAssignees: [otherSetter.uid], assignments: [{ userId: otherSetter.uid, active: true }] }),
    seed('specs/spec-limited', { label: 'RD 1mm', shape: 'RD', sizeMm: 1, ctPerStone: 0.005, defaultCostPerCtUsd: 500, location: 'Melee', pcs: 5, ct: 0.025 }),
    seed('specs/spec-zero', { label: 'RD 0.8mm', shape: 'RD', sizeMm: 0.8, ctPerStone: 0.002, defaultCostPerCtUsd: 400, location: 'Melee', pcs: 0, ct: 0 }),
    seed('specs/spec-a', { label: 'RD 1.2mm', shape: 'RD', sizeMm: 1.2, ctPerStone: 0.008, defaultCostPerCtUsd: 600, location: 'Melee', pcs: 20, ct: 0.16 }),
    seed('specs/spec-b', { label: 'RD 1.4mm', shape: 'RD', sizeMm: 1.4, ctPerStone: 0.012, defaultCostPerCtUsd: 700, location: 'Melee', pcs: 20, ct: 0.24 }),
    seed('specs/spec-race', { label: 'RD Race', shape: 'RD', sizeMm: 1.5, ctPerStone: 0.01, defaultCostPerCtUsd: 800, location: 'Melee', pcs: 1, ct: 0.01 }),
  ]);
});

after(async () => {
  await adminEnv?.cleanup();
  await Promise.all(apps.map(app => deleteApp(app)));
});

test('UID security profile bootstrap preserves and links legacy records', async () => {
  const legacyEmail = 'legacy-designer@example.test';
  await seed('users/legacy-designer-record', { id: 'legacy-designer-record', email: legacyEmail, name: 'Legacy Designer', role: 'Designer', active: true });
  const legacyClient = await makeClient('phase1-legacy-designer', legacyEmail);
  const linked = await callable(legacyClient, 'ensureUidSecurityProfile', {});
  assert.equal(linked.created, true);
  const canonical = await read(`users/${legacyClient.uid}`);
  const legacy = await read('users/legacy-designer-record');
  assert.equal(canonical.role, 'Designer');
  assert.deepEqual(canonical.legacyProfileIds, ['legacy-designer-record']);
  assert.equal(legacy.authUid, legacyClient.uid);

  const newClient = await makeClient('phase1-new-setter', 'new-setter@example.test');
  await callable(newClient, 'ensureUidSecurityProfile', {});
  assert.equal((await read(`users/${newClient.uid}`)).role, 'Setter');
});

test('setter context and request responses never disclose availability or valuation', async () => {
  const context = await callable(setter, 'getMyInventoryContext', {});
  const limited = context.specs.find(item => item.id === 'spec-limited');
  assert.ok(limited);
  assert.equal('pcs' in limited, false);
  assert.equal('ct' in limited, false);
  assert.equal('defaultCostPerCtUsd' in limited, false);

  const response = await callable(setter, 'createInventoryRequest', {
    operationId: op('request-limited'), projectId: 'project-1', jobNumberSnapshot: 'P1',
    lines: [{ specId: 'spec-limited', requestedPcs: 10 }],
  });
  assert.deepEqual(Object.keys(response).sort(), ['requestId', 'status']);
  assert.equal((await read('specs/spec-limited')).pcs, 5, 'a request does not reserve or deduct stock');
  globalThis.limitedRequestId = response.requestId;
});

test('an active but unassigned production user cannot request inventory for another project', async () => {
  await assert.rejects(callable(otherSetter, 'createInventoryRequest', {
    operationId: op('unassigned-request'), projectId: 'project-1', jobNumberSnapshot: 'P1',
    lines: [{ specId: 'spec-a', requestedPcs: 1 }],
  }));
  await assert.rejects(callable(setter, 'createInventoryRequest', {
    operationId: op('wrong-project'), projectId: 'project-2', jobNumberSnapshot: 'P2',
    lines: [{ specId: 'spec-a', requestedPcs: 1 }],
  }));
});

test('Manager preview is private and a partial issue closes the remainder exactly once', async () => {
  const preview = await callable(manager1, 'getFulfillmentPreview', { requestId: globalThis.limitedRequestId });
  const limited = preview.specs.find(item => item.id === 'spec-limited');
  assert.equal(limited.availablePcs, 5);
  assert.equal(limited.maximumIssuePcs, 5);
  assert.equal(limited.recommendedIssuePcs, 5);
  assert.equal(limited.availabilityState, 'PARTIAL');

  const operationId = op('issue-limited');
  const evidencePath = await uploadEvidence(manager1, 'issues', operationId, 'project-1');
  const payload = {
    operationId, requestId: globalThis.limitedRequestId, bagNumber: 'P1-A', evidencePath, imageSource: 'Camera',
    issuedLines: [{ sourceLineIndex: 0, specId: 'spec-limited', issuedPcs: 4, explanation: 'Only four required for this issue.' }],
  };
  const first = await callable(manager1, 'confirmInventoryIssue', payload);
  const retry = await callable(manager1, 'confirmInventoryIssue', payload);
  assert.deepEqual(retry, first);
  assert.equal(first.status, 'PARTIALLY_FULFILLED_CLOSED');
  assert.equal((await read('specs/spec-limited')).pcs, 1);
  assert.equal((await read(`requests/${globalThis.limitedRequestId}`)).status, 'PARTIALLY_FULFILLED_CLOSED');
  assert.ok(await read(`movements/${first.movementId}`));
  globalThis.firstBagId = first.bagId;
});

test('zero-stock failure discloses nothing to the setter and commits no partial records', async () => {
  const created = await callable(setter, 'createInventoryRequest', {
    operationId: op('request-zero'), projectId: 'project-1', lines: [{ specId: 'spec-zero', requestedPcs: 1 }],
  });
  assert.equal('availablePcs' in created, false);
  const operationId = op('issue-zero');
  await assert.rejects(callable(manager1, 'confirmInventoryIssue', {
    operationId, requestId: created.requestId, bagNumber: 'P1-ZERO',
    issuedLines: [{ sourceLineIndex: 0, specId: 'spec-zero', issuedPcs: 1, explanation: 'Test' }],
  }), 'missing issue evidence blocks confirmation before any write');
  const evidencePath = await uploadEvidence(manager1, 'issues', operationId, 'project-1');
  await assert.rejects(callable(manager1, 'confirmInventoryIssue', {
    operationId, requestId: created.requestId, bagNumber: 'P1-ZERO', evidencePath,
    issuedLines: [{ sourceLineIndex: 0, specId: 'spec-zero', issuedPcs: 1, explanation: 'Test' }],
  }));
  assert.equal((await read('specs/spec-zero')).pcs, 0);
  assert.equal(await read(`movements/mov-${operationId}`), null);
  assert.equal((await read(`requests/${created.requestId}`)).status, 'OPEN');
});

test('changed specification and removed line preserve original and final audit records', async () => {
  const created = await callable(setter, 'createInventoryRequest', {
    operationId: op('request-change'), projectId: 'project-1',
    lines: [{ specId: 'spec-a', requestedPcs: 3 }, { specId: 'spec-b', requestedPcs: 2 }],
  });
  const operationId = op('issue-change');
  const evidencePath = await uploadEvidence(manager1, 'issues', operationId, 'project-1');
  const result = await callable(manager1, 'confirmInventoryIssue', {
    operationId, requestId: created.requestId, bagNumber: 'P1-B', evidencePath,
    issuedLines: [
      { sourceLineIndex: 0, specId: 'spec-b', issuedPcs: 3, explanation: 'Manager changed specification.' },
      { sourceLineIndex: 1, specId: 'spec-b', issuedPcs: 0, explanation: 'Line removed.' },
    ],
  });
  const audit = (await read(`requests/${created.requestId}`)).fulfillmentDetails.lines;
  assert.equal(audit[0].requestedSpecId, 'spec-a');
  assert.equal(audit[0].issuedSpecId, 'spec-b');
  assert.equal(audit[1].decision, 'REMOVED');
  globalThis.changedBagId = result.bagId;
});

test('two Managers cannot oversubscribe one remaining stone', async () => {
  const [one, two] = await Promise.all([
    callable(setter, 'createInventoryRequest', { operationId: op('race-request-1'), projectId: 'project-1', lines: [{ specId: 'spec-race', requestedPcs: 1 }] }),
    callable(setter, 'createInventoryRequest', { operationId: op('race-request-2'), projectId: 'project-1', lines: [{ specId: 'spec-race', requestedPcs: 1 }] }),
  ]);
  const op1 = op('race-issue-1');
  const op2 = op('race-issue-2');
  const [photo1, photo2] = await Promise.all([
    uploadEvidence(manager1, 'issues', op1, 'project-1'),
    uploadEvidence(manager2, 'issues', op2, 'project-1'),
  ]);
  const results = await Promise.allSettled([
    callable(manager1, 'confirmInventoryIssue', { operationId: op1, requestId: one.requestId, bagNumber: 'P1-R1', evidencePath: photo1, issuedLines: [{ sourceLineIndex: 0, specId: 'spec-race', issuedPcs: 1 }] }),
    callable(manager2, 'confirmInventoryIssue', { operationId: op2, requestId: two.requestId, bagNumber: 'P1-R2', evidencePath: photo2, issuedLines: [{ sourceLineIndex: 0, specId: 'spec-race', issuedPcs: 1 }] }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal((await read('specs/spec-race')).pcs, 0);
  const loserRequest = results[0].status === 'rejected' ? one.requestId : two.requestId;
  assert.equal((await read(`requests/${loserRequest}`)).status, 'OPEN');
  await callable(setter, 'cancelInventoryRequest', { operationId: op('cancel-race-loser'), requestId: loserRequest });
  assert.equal((await read(`requests/${loserRequest}`)).status, 'CANCELLED');
  assert.equal((await read('specs/spec-race')).pcs, 0, 'cancellation does not change stock');
});

test('pending return changes no inventory; mismatch blocks; confirmed return and breakage commit once', async () => {
  const submitOperation = op('return-submit-1');
  const evidencePath = await uploadEvidence(setter, 'returns', submitOperation, 'project-1');
  const submitted = await callable(setter, 'submitInventoryReturn', {
    operationId: submitOperation, bagId: globalThis.firstBagId, projectId: 'project-1', evidencePath,
    returnLines: [{ specId: 'spec-limited', returnedPcs: 2 }], notes: 'Two stones returned.',
  });
  assert.equal((await read('specs/spec-limited')).pcs, 1);
  assert.equal((await read('projects/project-1')).inventoryUsage.bySpec['spec-limited'].netUsedPcs, 4);

  await assert.rejects(callable(manager1, 'confirmInventoryReturn', {
    operationId: op('return-mismatch'), bagId: globalThis.firstBagId, returnId: submitted.returnId,
    returnLines: [{ specId: 'spec-limited', returnedPcs: 1 }], breakageLines: [],
  }));
  assert.equal((await read('specs/spec-limited')).pcs, 1);

  const confirmPayload = {
    operationId: op('return-confirm-1'), bagId: globalThis.firstBagId, returnId: submitted.returnId,
    returnLines: [{ specId: 'spec-limited', returnedPcs: 2 }],
    breakageLines: [{ specId: 'spec-limited', pieces: 1 }], breakageReason: 'Stone fractured during setting.',
  };
  const first = await callable(manager1, 'confirmInventoryReturn', confirmPayload);
  const retry = await callable(manager1, 'confirmInventoryReturn', confirmPayload);
  assert.deepEqual(retry, first);
  assert.equal((await read('specs/spec-limited')).pcs, 3);
  assert.equal((await read('projects/project-1')).inventoryUsage.bySpec['spec-limited'].netUsedPcs, 1);
  assert.ok(await read(first.returnMovementId ? `movements/${first.returnMovementId}` : 'missing'));
  assert.ok(await read(first.breakageMovementId ? `movements/${first.breakageMovementId}` : 'missing'));
  await assert.rejects(callable(manager2, 'confirmInventoryReturn', { ...confirmPayload, operationId: op('return-confirm-2') }));
  assert.equal((await read('specs/spec-limited')).pcs, 3);
});

test('wrong setter, project, spec, excess quantity, and invalid evidence are rejected', async () => {
  const badEvidenceOp = op('bad-evidence');
  await assert.rejects(callable(setter, 'submitInventoryReturn', {
    operationId: badEvidenceOp, bagId: globalThis.changedBagId, projectId: 'project-1',
    evidencePath: `evidence/returns/${setter.uid}/${badEvidenceOp}/missing.jpg`,
    returnLines: [{ specId: 'spec-b', returnedPcs: 1 }],
  }));
  const wrongBagOp = op('wrong-bag');
  const wrongBagPhoto = await uploadEvidence(setter, 'returns', wrongBagOp, 'project-1');
  await assert.rejects(callable(setter, 'submitInventoryReturn', {
    operationId: wrongBagOp, bagId: 'bag-that-does-not-exist', projectId: 'project-1', evidencePath: wrongBagPhoto,
    returnLines: [{ specId: 'spec-b', returnedPcs: 1 }],
  }));
  const wrongSetterOp = op('wrong-setter');
  const wrongSetterPhoto = await uploadEvidence(otherSetter, 'returns', wrongSetterOp, 'project-1');
  await assert.rejects(callable(otherSetter, 'submitInventoryReturn', {
    operationId: wrongSetterOp, bagId: globalThis.changedBagId, projectId: 'project-1', evidencePath: wrongSetterPhoto,
    returnLines: [{ specId: 'spec-b', returnedPcs: 1 }],
  }));
  const wrongProjectOp = op('wrong-project');
  const wrongProjectPhoto = await uploadEvidence(setter, 'returns', wrongProjectOp, 'project-2');
  await assert.rejects(callable(setter, 'submitInventoryReturn', {
    operationId: wrongProjectOp, bagId: globalThis.changedBagId, projectId: 'project-2', evidencePath: wrongProjectPhoto,
    returnLines: [{ specId: 'spec-b', returnedPcs: 1 }],
  }));
  const wrongSpecOp = op('wrong-spec');
  const wrongSpecPhoto = await uploadEvidence(setter, 'returns', wrongSpecOp, 'project-1');
  await assert.rejects(callable(setter, 'submitInventoryReturn', {
    operationId: wrongSpecOp, bagId: globalThis.changedBagId, projectId: 'project-1', evidencePath: wrongSpecPhoto,
    returnLines: [{ specId: 'spec-a', returnedPcs: 1 }],
  }));
  const excessOp = op('return-excess');
  const excessPhoto = await uploadEvidence(setter, 'returns', excessOp, 'project-1');
  await assert.rejects(callable(setter, 'submitInventoryReturn', {
    operationId: excessOp, bagId: globalThis.changedBagId, projectId: 'project-1', evidencePath: excessPhoto,
    returnLines: [{ specId: 'spec-b', returnedPcs: 4 }],
  }));
});

test('receipt and correction paths are trusted, idempotent, and append-only', async () => {
  const receiptOperation = op('receipt-spec-a');
  const receiptPayload = {
    operationId: receiptOperation,
    type: 'SHIPMENT_IN',
    location: 'Melee',
    notes: 'Test receipt',
    lines: [{ specId: 'spec-a', pcs: 2, ct: 0.016 }],
  };
  const receipt = await callable(manager1, 'recordInventoryMovement', receiptPayload);
  const receiptRetry = await callable(manager1, 'recordInventoryMovement', receiptPayload);
  assert.deepEqual(receiptRetry, receipt);
  assert.equal((await read('specs/spec-a')).pcs, 22);

  await callable(manager1, 'recordInventoryMovement', {
    operationId: op('weight-breakage-a'),
    type: 'BROKEN_OUT',
    location: 'Melee',
    notes: 'Weight-authoritative breakage test',
    weightAuthoritative: true,
    lines: [{ specId: 'spec-a', ct: 0.008 }],
  });
  assert.equal((await read('specs/spec-a')).pcs, 22, 'weight mode does not invent a piece count');
  assert.equal((await read('specs/spec-a')).ct, 0.168);

  const correctionOperation = op('correction-spec-a');
  const correctionPayload = {
    operationId: correctionOperation,
    specId: 'spec-a',
    reason: 'Physical audit established the corrected balance.',
    mode: 'PCS',
    previousPcs: 22,
    previousCt: 0.168,
    targetPcs: 18,
    targetCt: 0.144,
  };
  const correction = await callable(manager1, 'applyInventoryCorrection', correctionPayload);
  const correctionRetry = await callable(manager1, 'applyInventoryCorrection', correctionPayload);
  assert.deepEqual(correctionRetry, correction);
  assert.equal((await read('specs/spec-a')).pcs, 18);
  const reversal = await read(`movements/${correction.reversalMovementId}`);
  const replacement = await read(`movements/${correction.replacementMovementId}`);
  assert.equal(reversal.actionType, 'CORRECTION_REVERSAL');
  assert.equal(replacement.actionType, 'CORRECTION_REPLACEMENT');
  assert.equal(reversal.replacementMovementId, correction.replacementMovementId);
  assert.equal(replacement.reversesMovementId, correction.reversalMovementId);
});

test('Manager-only legacy evidence hardening supports dry-run and preserves the evidence record', async () => {
  const operationId = op('legacy-evidence');
  const storagePath = await uploadEvidence(manager1, 'issues', operationId, 'project-1');
  const evidenceId = 'legacy-evidence-record';
  const legacyUrl = `http://127.0.0.1:9199/v0/b/${config.storageBucket}/o/${encodeURIComponent(storagePath)}?alt=media&token=legacy-token`;
  await seed(`evidence/${evidenceId}`, {
    id: evidenceId,
    type: 'ISSUE_PHOTO',
    photoUrl: legacyUrl,
    projectId: 'project-1',
    uploadedById: manager1.uid,
  });

  const blockedAudit = await callable(manager1, 'getPhase1BootstrapAudit', {});
  assert.equal(blockedAudit.ready, false);
  assert.ok(blockedAudit.legacyEvidenceBlockers.some(item => item.evidenceId === evidenceId));

  const dryRun = await callable(manager1, 'hardenLegacyEvidenceAccess', { apply: false });
  assert.equal(dryRun.apply, false);
  assert.ok(dryRun.candidateCount >= 1);
  assert.equal((await read(`evidence/${evidenceId}`)).photoUrl, legacyUrl);

  const applied = await callable(manager1, 'hardenLegacyEvidenceAccess', { apply: true });
  assert.equal(applied.apply, true);
  assert.ok(applied.migratedCount >= 1);
  assert.deepEqual(applied.failed, []);
  const migrated = await read(`evidence/${evidenceId}`);
  assert.equal(migrated.storagePath, storagePath);
  assert.equal('photoUrl' in migrated, false);
  assert.equal(migrated.legacyEvidenceMigration.tokenRotated, true);
  assert.equal((await callable(manager1, 'getPhase1BootstrapAudit', {})).ready, true);
});

test('Manager views on different clients receive identical authoritative totals', async () => {
  const request = await callable(setter, 'createInventoryRequest', {
    operationId: op('desktop-mobile'), projectId: 'project-1', lines: [{ specId: 'spec-a', requestedPcs: 1 }],
  });
  const [desktop, mobile] = await Promise.all([
    callable(manager1, 'getFulfillmentPreview', { requestId: request.requestId }),
    callable(manager2, 'getFulfillmentPreview', { requestId: request.requestId }),
  ]);
  assert.deepEqual(desktop, mobile);
});
