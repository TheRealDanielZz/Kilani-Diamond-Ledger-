import { getStorage } from 'firebase-admin/storage';
import {
  DocumentData,
  FieldValue,
  Firestore,
  Timestamp,
  Transaction,
  getFirestore,
} from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireActor, requireManager, isAssignedToProject } from './auth';
import {
  BagItem,
  InventorySpec,
  ProjectInventoryUsage,
  RequestLine,
  TORONTO_MELEE,
  isTorontoMeleeLocation,
} from './models';
import {
  caratsToMicros,
  newServerId,
  parseBreakageLines,
  parseIssuedLines,
  parseRequestLines,
  parseReturnLines,
  payloadHash,
  requireOperationId,
  requirePieceCount,
  requireString,
  roundCarats,
} from './validation';
import { auditReconciliationSpec } from './reconciliation';

const REGION = 'northamerica-northeast1';
const CALLABLE_OPTIONS = { region: REGION, cors: true } as const;

function serverIso(): string {
  return Timestamp.now().toDate().toISOString();
}

function dataOf(request: { data?: unknown }): Record<string, unknown> {
  if (!request.data || typeof request.data !== 'object' || Array.isArray(request.data)) {
    throw new HttpsError('invalid-argument', 'A request payload is required.');
  }
  return request.data as Record<string, unknown>;
}

function operationRef(db: Firestore, operationId: string) {
  return db.doc(`inventory_operations/${operationId}`);
}

async function readOperation(
  tx: Transaction,
  db: Firestore,
  operationId: string,
  kind: string,
  hash: string
): Promise<Record<string, unknown> | null> {
  const snap = await tx.get(operationRef(db, operationId));
  if (!snap.exists) return null;
  const existing = snap.data() || {};
  if (existing.kind !== kind || existing.payloadHash !== hash) {
    throw new HttpsError('already-exists', 'This operationId was already used for different data.');
  }
  return (existing.result || {}) as Record<string, unknown>;
}

function commitOperation(
  tx: Transaction,
  db: Firestore,
  operationId: string,
  kind: string,
  hash: string,
  actorUid: string,
  result: Record<string, unknown>
): void {
  tx.create(operationRef(db, operationId), {
    operationId,
    kind,
    payloadHash: hash,
    actorUid,
    status: 'COMMITTED',
    createdAt: serverIso(),
    serverCreatedAt: FieldValue.serverTimestamp(),
    result,
  });
}

function movementLine(spec: InventorySpec, specId: string, pieces: number) {
  const averageWeightSnapshot = Number(spec.ctPerStone || 0);
  return {
    specId,
    pcs: pieces,
    ct: roundCarats(pieces * averageWeightSnapshot),
    averageWeightSnapshot,
    costPerCtUsd: Number(spec.defaultCostPerCtUsd || 0),
  };
}

function requireInitializedMeleeSpec(snap: FirebaseFirestore.DocumentSnapshot): InventorySpec & { id: string } {
  if (!snap.exists) throw new HttpsError('not-found', `Specification ${snap.id} was not found.`);
  const spec = { ...snap.data(), id: snap.id } as InventorySpec & { id: string };
  if (!isTorontoMeleeLocation(spec.location)) {
    throw new HttpsError('failed-precondition', 'Large stones cannot be used for setter bag requests.');
  }
  if (!Number.isSafeInteger(spec.pcs) || typeof spec.ct !== 'number' || !Number.isFinite(spec.ct)) {
    throw new HttpsError(
      'failed-precondition',
      `Inventory balance for ${spec.label || spec.id} is not initialized. Run the Phase 1 balance bootstrap first.`
    );
  }
  if (spec.pcs! < 0 || spec.ct! < 0) {
    throw new HttpsError('failed-precondition', `Inventory balance for ${spec.label || spec.id} is invalid.`);
  }
  return spec;
}

async function verifyEvidenceObject(
  storagePath: string,
  expectedKind: 'issues' | 'returns',
  actorUid: string,
  operationId: string,
  projectId: string
): Promise<void> {
  const requiredPrefix = `evidence/${expectedKind}/${actorUid}/${operationId}/`;
  if (!storagePath.startsWith(requiredPrefix)) {
    throw new HttpsError('invalid-argument', 'Evidence path does not match this operation and user.');
  }

  try {
    const [metadata] = await getStorage().bucket().file(storagePath).getMetadata();
    const custom = metadata.metadata || {};
    if (!String(metadata.contentType || '').startsWith('image/')) {
      throw new HttpsError('failed-precondition', 'Evidence must be an image.');
    }
    if (custom.uploaderUid !== actorUid || custom.operationId !== operationId || custom.projectId !== projectId) {
      throw new HttpsError('failed-precondition', 'Evidence metadata does not match this operation.');
    }
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('failed-precondition', 'Required evidence upload is missing or invalid.');
  }
}

function storagePathFromLegacyUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = new URL(value);
    const marker = '/o/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

async function managerIds(): Promise<string[]> {
  const snap = await getFirestore().collection('users').where('role', '==', 'Manager').get();
  return snap.docs.filter((doc) => doc.data().active !== false).map((doc) => doc.id);
}

function writeNotification(
  tx: Transaction,
  db: Firestore,
  id: string,
  userId: string,
  title: string,
  message: string,
  type: string,
  link: string,
  projectId?: string
): void {
  tx.set(db.doc(`notifications/${id}`), {
    id,
    userId,
    title,
    message,
    type,
    link,
    projectId: projectId || null,
    read: false,
    createdAt: serverIso(),
    serverCreatedAt: FieldValue.serverTimestamp(),
  });
}

function sanitizedSpec(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const spec = doc.data() as InventorySpec;
  return {
    id: doc.id,
    label: spec.label || doc.id,
    shape: spec.shape || '',
    sizeMm: Number(spec.sizeMm || 0),
    ctPerStone: Number(spec.ctPerStone || 0),
    location: TORONTO_MELEE,
  };
}

function sanitizeBag(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = doc.data();
  const returns = Array.isArray(data.returns)
    ? data.returns.map((entry: Record<string, unknown>) => {
        const { photo: _photo, evidenceId: _evidenceId, evidencePath: _evidencePath, ...safe } = entry;
        return safe;
      })
    : [];
  const {
    issuedPhoto: _issuedPhoto,
    returnedPhoto: _returnedPhoto,
    evidenceId: _evidenceId,
    evidencePath: _evidencePath,
    ...safe
  } = data;
  return { ...safe, id: doc.id, returns };
}

export const ensureUidSecurityProfile = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  const authEmail = typeof request.auth?.token.email === 'string' ? request.auth.token.email.trim() : '';
  const authName = typeof request.auth?.token.name === 'string' ? request.auth.token.name.trim() : '';
  if (!uid || !authEmail) throw new HttpsError('unauthenticated', 'A verified signed-in email is required.');
  const normalizedEmail = authEmail.toLowerCase();
  const db = getFirestore();
  const directRef = db.doc(`users/${uid}`);
  const directSnap = await directRef.get();
  if (directSnap.exists) {
    const directData = directSnap.data() || {};
    if (typeof directData.authUid === 'string' && directData.authUid !== uid) {
      throw new HttpsError('failed-precondition', 'This UID security profile contains a conflicting identity link.');
    }
    const legacyProfileIds = Array.isArray(directData.legacyProfileIds) ? directData.legacyProfileIds : [];
    await directRef.set({ authUid: uid, legacyProfileIds, securityProfileVersion: 1 }, { merge: true });
    return { userId: uid, created: false, legacyProfileIds };
  }

  const exactEmails = [...new Set([authEmail, normalizedEmail])];
  const querySnaps = await Promise.all(exactEmails.map((email) => db.collection('users').where('email', '==', email).get()));
  const legacyDocs = new Map(querySnaps.flatMap((snap) => snap.docs).filter((doc) => doc.id !== uid).map((doc) => [doc.id, doc]));
  const legacyProfiles = [...legacyDocs.values()];
  const conflictingLink = legacyProfiles.find((doc) => {
    const linked = doc.data().authUid;
    return typeof linked === 'string' && linked !== uid;
  });
  if (conflictingLink) {
    throw new HttpsError('failed-precondition', 'This legacy profile is already linked to another account. Ask a Manager to resolve it.');
  }
  const roles = new Set(legacyProfiles.map((doc) => doc.data().role).filter((role) => typeof role === 'string'));
  if (roles.size > 1) {
    throw new HttpsError('failed-precondition', 'Conflicting legacy roles require Manager review before this UID can be activated.');
  }

  const ownerEmails = new Set(['kilanimedia@gmail.com', 'harout@kilani.com']);
  const legacyData = legacyProfiles[0]?.data() || {};
  const profile = {
    ...legacyData,
    id: uid,
    authUid: uid,
    legacyProfileIds: [...legacyDocs.keys()],
    email: authEmail,
    name: legacyData.name || authName || authEmail.split('@')[0],
    role: typeof legacyData.role === 'string' ? legacyData.role : ownerEmails.has(normalizedEmail) ? 'Manager' : 'Setter',
    active: legacyData.active !== false,
    securityProfileVersion: 1,
  };

  return db.runTransaction(async (tx) => {
    const current = await tx.get(directRef);
    if (current.exists) return { userId: uid, created: false, legacyProfileIds: current.data()?.legacyProfileIds || [] };
    const freshLegacy = legacyProfiles.length > 0 ? await tx.getAll(...legacyProfiles.map((doc) => doc.ref)) : [];
    const newlyConflicting = freshLegacy.find((doc) => {
      const linked = doc.data()?.authUid;
      return typeof linked === 'string' && linked !== uid;
    });
    if (newlyConflicting) throw new HttpsError('aborted', 'Legacy profile linking changed. Sign in again.');
    tx.create(directRef, profile);
    freshLegacy.forEach((doc) => tx.set(doc.ref, { authUid: uid }, { merge: true }));
    return { userId: uid, created: true, legacyProfileIds: [...legacyDocs.keys()] };
  });
});

async function canonicalUidForProfileId(profileId: string): Promise<string> {
  const db = getFirestore();
  const direct = await db.doc(`users/${profileId}`).get();
  const linkedUid = direct.exists && typeof direct.data()?.authUid === 'string' ? direct.data()?.authUid : '';
  if (linkedUid) return linkedUid;
  const canonical = await db.collection('users').where('legacyProfileIds', 'array-contains', profileId).limit(1).get();
  return canonical.empty ? profileId : canonical.docs[0].id;
}

export const getMyInventoryContext = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = await requireActor(request);
  const db = getFirestore();
  const acceptedIds = [...new Set([actor.uid, ...(actor.profile.legacyProfileIds || [])])];
  const [specsSnap, bagSnaps, requestSnaps] = await Promise.all([
    db.collection('specs').get(),
    Promise.all(acceptedIds.map((id) => db.collection('bags').where('issuedToId', '==', id).get())),
    Promise.all(acceptedIds.map((id) => db.collection('requests').where('requestedById', '==', id).get())),
  ]);
  const bags = new Map(bagSnaps.flatMap((snap) => snap.docs).map((doc) => [doc.id, doc]));
  const requests = new Map(requestSnaps.flatMap((snap) => snap.docs).map((doc) => [doc.id, doc]));

  return {
    specs: specsSnap.docs.filter((doc) => isTorontoMeleeLocation(doc.data().location)).map(sanitizedSpec),
    bags: [...bags.values()].map(sanitizeBag),
    requests: [...requests.values()].map((doc) => ({ ...doc.data(), id: doc.id })),
  };
});

export const createInventoryRequest = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = await requireActor(request);
  if (!['Manager', 'Setter', 'Jeweller'].includes(String(actor.profile.role || ''))) {
    throw new HttpsError('permission-denied', 'Only Managers, Setters, and Jewellers may request setter-bag inventory.');
  }
  const input = dataOf(request);
  const operationId = requireOperationId(input.operationId);
  const projectId = requireString(input.projectId, 'projectId', 200);
  const jobNumberSnapshot = typeof input.jobNumberSnapshot === 'string' ? input.jobNumberSnapshot.slice(0, 200) : '';
  const lines = parseRequestLines(input.lines);
  const hash = payloadHash({ projectId, jobNumberSnapshot, lines });
  const db = getFirestore();
  const managers = await managerIds();

  return db.runTransaction(async (tx) => {
    const prior = await readOperation(tx, db, operationId, 'REQUEST_CREATE', hash);
    if (prior) return prior;

    const projectRef = db.doc(`projects/${projectId}`);
    const projectSnap = await tx.get(projectRef);
    if (!projectSnap.exists) throw new HttpsError('not-found', 'Project not found.');
    const project = projectSnap.data() || {};
    if (actor.profile.role !== 'Manager' && !isAssignedToProject(project, actor)) {
      throw new HttpsError('permission-denied', 'You may request diamonds only for assigned work.');
    }

    const specRefs = lines.map((line) => db.doc(`specs/${line.specId}`));
    const specSnaps = await tx.getAll(...specRefs);
    specSnaps.forEach((snap) => {
      if (!snap.exists || !isTorontoMeleeLocation(snap.data()?.location)) {
        throw new HttpsError('failed-precondition', 'Large stones cannot be requested through setter bags.');
      }
    });

    const requestId = newServerId('req');
    const result = { requestId, status: 'OPEN' };
    tx.create(db.doc(`requests/${requestId}`), {
      id: requestId,
      projectId,
      requestedById: actor.uid,
      requestedAt: serverIso(),
      serverRequestedAt: FieldValue.serverTimestamp(),
      status: 'OPEN',
      lines,
      jobNumberSnapshot,
      operationId,
    });
    managers.forEach((managerId) => {
      writeNotification(
        tx,
        db,
        `notif-${operationId}-${managerId}`,
        managerId,
        'New Request',
        `${actor.profile.name || 'A setter'} requested diamonds for ${String(project.code || jobNumberSnapshot || 'a project')}.`,
        'REQUEST',
        '/',
        projectId
      );
    });
    commitOperation(tx, db, operationId, 'REQUEST_CREATE', hash, actor.uid, result);
    return result;
  });
});

export const cancelInventoryRequest = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = await requireActor(request);
  const input = dataOf(request);
  const operationId = requireOperationId(input.operationId);
  const requestId = requireString(input.requestId, 'requestId', 200);
  const hash = payloadHash({ requestId });
  const db = getFirestore();

  return db.runTransaction(async (tx) => {
    const prior = await readOperation(tx, db, operationId, 'REQUEST_CANCEL', hash);
    if (prior) return prior;
    const requestRef = db.doc(`requests/${requestId}`);
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) throw new HttpsError('not-found', 'Request not found.');
    const requestData = requestSnap.data() || {};
    if (requestData.status !== 'OPEN') throw new HttpsError('failed-precondition', 'Only open requests may be cancelled.');
    const acceptedIds = new Set([actor.uid, ...(actor.profile.legacyProfileIds || [])]);
    if (actor.profile.role !== 'Manager' && !acceptedIds.has(String(requestData.requestedById))) {
      throw new HttpsError('permission-denied', 'You cannot cancel this request.');
    }
    const result = { requestId, status: 'CANCELLED' };
    tx.update(requestRef, {
      status: 'CANCELLED',
      cancelledById: actor.uid,
      cancelledAt: serverIso(),
      serverCancelledAt: FieldValue.serverTimestamp(),
      cancelOperationId: operationId,
    });
    commitOperation(tx, db, operationId, 'REQUEST_CANCEL', hash, actor.uid, result);
    return result;
  });
});

export const getFulfillmentPreview = onCall(CALLABLE_OPTIONS, async (request) => {
  await requireManager(request);
  const input = dataOf(request);
  const requestId = requireString(input.requestId, 'requestId', 200);
  const db = getFirestore();
  const [requestSnap, specsSnap] = await Promise.all([
    db.doc(`requests/${requestId}`).get(),
    db.collection('specs').get(),
  ]);
  if (!requestSnap.exists) throw new HttpsError('not-found', 'Request not found.');
  const requestData = requestSnap.data() || {};
  if (requestData.status !== 'OPEN') throw new HttpsError('failed-precondition', 'Request is already closed.');
  const requested = new Map<string, number>(
    (Array.isArray(requestData.lines) ? requestData.lines : []).map((line: RequestLine) => [line.specId, line.requestedPcs])
  );
  return {
    requestId,
    specs: specsSnap.docs
      .filter((doc) => isTorontoMeleeLocation(doc.data().location))
      .map((doc) => {
        const spec = doc.data() as InventorySpec;
        const initialized = Number.isSafeInteger(spec.pcs) && typeof spec.ct === 'number';
        const availablePcs = initialized ? Math.max(0, Number(spec.pcs)) : 0;
        const requestedPcs = requested.get(doc.id) || 0;
        return {
          ...sanitizedSpec(doc),
          availablePcs,
          maximumIssuePcs: availablePcs,
          recommendedIssuePcs: Math.min(requestedPcs, availablePcs),
          availabilityState: !initialized
            ? 'UNINITIALIZED'
            : availablePcs === 0
              ? 'OUT_OF_STOCK'
              : requestedPcs > availablePcs
                ? 'PARTIAL'
                : 'AVAILABLE',
        };
      }),
  };
});

export const confirmInventoryIssue = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = await requireManager(request);
  const input = dataOf(request);
  const operationId = requireOperationId(input.operationId);
  const requestId = requireString(input.requestId, 'requestId', 200);
  const bagNumber = requireString(input.bagNumber, 'bagNumber', 120).replace(/\s+/g, ' ');
  const issuedLines = parseIssuedLines(input.issuedLines);
  const imageSource = input.imageSource === 'Device Gallery' ? 'Device Gallery' : 'Camera';
  const evidencePath = typeof input.evidencePath === 'string' ? input.evidencePath : '';
  const hash = payloadHash({ requestId, bagNumber, issuedLines, imageSource, evidencePath });
  const db = getFirestore();

  const requestOutside = await db.doc(`requests/${requestId}`).get();
  if (!requestOutside.exists) throw new HttpsError('not-found', 'Request not found.');
  const requestOutsideData = requestOutside.data() || {};
  const projectId = requireString(requestOutsideData.projectId, 'request.projectId', 200);
  const canonicalRequestedById = await canonicalUidForProfileId(requireString(requestOutsideData.requestedById, 'request.requestedById', 200));
  const positiveLines = issuedLines.filter((line) => line.issuedPcs > 0);
  if (positiveLines.length > 0) {
    if (!evidencePath) throw new HttpsError('failed-precondition', 'Issue evidence is required.');
    await verifyEvidenceObject(evidencePath, 'issues', actor.uid, operationId, projectId);
  }

  return db.runTransaction(async (tx) => {
    const prior = await readOperation(tx, db, operationId, 'ISSUE', hash);
    if (prior) return prior;

    const requestRef = db.doc(`requests/${requestId}`);
    const projectRef = db.doc(`projects/${projectId}`);
    const bagClaimId = encodeURIComponent(bagNumber.toLowerCase()).replace(/%/g, '_');
    const bagClaimRef = db.doc(`bag_number_claims/${bagClaimId}`);
    const [requestSnap, projectSnap, bagClaimSnap, existingBagSnap] = await Promise.all([
      tx.get(requestRef),
      tx.get(projectRef),
      tx.get(bagClaimRef),
      tx.get(db.collection('bags').where('bagNumber', '==', bagNumber).limit(1)),
    ]);
    if (!requestSnap.exists || !projectSnap.exists) throw new HttpsError('not-found', 'Request or project not found.');
    if ((bagClaimSnap.exists || !existingBagSnap.empty) && positiveLines.length > 0) throw new HttpsError('already-exists', 'This bag number is already in use.');
    const requestData = requestSnap.data() || {};
    if (requestData.status !== 'OPEN') throw new HttpsError('failed-precondition', 'Request has already been closed.');
    if (requestData.projectId !== projectId) throw new HttpsError('failed-precondition', 'Request project changed. Refresh and try again.');
    const originalLines = (Array.isArray(requestData.lines) ? requestData.lines : []) as RequestLine[];
    if (originalLines.length === 0) throw new HttpsError('failed-precondition', 'Request has no lines.');

    const seenSourceIndexes = new Set<number>();
    issuedLines.forEach((line) => {
      const original = originalLines[line.sourceLineIndex];
      if (!original) throw new HttpsError('invalid-argument', 'An issued line does not map to the original request.');
      if (seenSourceIndexes.has(line.sourceLineIndex)) throw new HttpsError('invalid-argument', 'A request line was submitted twice.');
      seenSourceIndexes.add(line.sourceLineIndex);
      const changed = original.specId !== line.specId || original.requestedPcs !== line.issuedPcs;
      if (changed && !line.explanation?.trim()) {
        throw new HttpsError('invalid-argument', 'Manager explanation is required for changed, partial, or removed lines.');
      }
    });
    if (seenSourceIndexes.size !== originalLines.length) {
      throw new HttpsError('invalid-argument', 'Every original request line must be fulfilled or explicitly removed with an explanation.');
    }

    const totals = new Map<string, number>();
    positiveLines.forEach((line) => totals.set(line.specId, (totals.get(line.specId) || 0) + line.issuedPcs));
    const specRefs = [...totals.keys()].map((specId) => db.doc(`specs/${specId}`));
    const specSnaps = specRefs.length > 0 ? await tx.getAll(...specRefs) : [];
    const specs = new Map<string, InventorySpec & { id: string }>();
    specSnaps.forEach((snap) => specs.set(snap.id, requireInitializedMeleeSpec(snap)));
    totals.forEach((pieces, specId) => {
      const spec = specs.get(specId)!;
      const requiredCt = roundCarats(pieces * Number(spec.ctPerStone || 0));
      if (pieces > spec.pcs! || requiredCt > spec.ct! + 0.000001) {
        throw new HttpsError('aborted', `Stock changed for ${spec.label || specId}. Refresh availability and try again.`);
      }
    });

    const bagId = positiveLines.length > 0 ? newServerId('bag') : '';
    const movementId = positiveLines.length > 0 ? `mov-${operationId}` : '';
    const evidenceId = positiveLines.length > 0 ? `evidence-${operationId}` : '';
    const requestedById = canonicalRequestedById;
    const fulfillmentLines = originalLines.map((original, index) => {
      const finalLine = issuedLines.find((line) => line.sourceLineIndex === index)!;
      return {
        sourceLineIndex: index,
        requestedSpecId: original.specId,
        requestedPcs: original.requestedPcs,
        issuedSpecId: finalLine.issuedPcs > 0 ? finalLine.specId : null,
        specId: finalLine.specId,
        issuedPcs: finalLine.issuedPcs,
        decision: finalLine.issuedPcs === 0
          ? 'REMOVED'
          : finalLine.specId === original.specId && finalLine.issuedPcs === original.requestedPcs
            ? 'FULL'
            : 'PARTIAL_OR_CHANGED',
        explanation: finalLine.explanation || '',
      };
    });
    const fullyFulfilled = fulfillmentLines.every((line) => line.decision === 'FULL');
    const targetStatus = fullyFulfilled ? 'FULFILLED' : 'PARTIALLY_FULFILLED_CLOSED';
    const nowIso = serverIso();

    const projectData = projectSnap.data() || {};
    const currentUsage = (projectData.inventoryUsage || { bySpec: {} }) as ProjectInventoryUsage;
    const bySpec = { ...(currentUsage.bySpec || {}) };
    totals.forEach((pieces, specId) => {
      const spec = specs.get(specId)!;
      const previous = bySpec[specId] || { issuedPcs: 0, returnedPcs: 0, brokenPcs: 0, netUsedPcs: 0, averageWeightSnapshot: Number(spec.ctPerStone || 0) };
      const issuedPcs = previous.issuedPcs + pieces;
      bySpec[specId] = {
        ...previous,
        issuedPcs,
        netUsedPcs: Math.max(0, issuedPcs - previous.returnedPcs - previous.brokenPcs),
        averageWeightSnapshot: Number(spec.ctPerStone || 0),
      };
    });

    if (positiveLines.length > 0) {
      const items: BagItem[] = [...totals.entries()].map(([specId, issuedPcs]) => ({
        specId,
        issuedPcs,
        averageWeightSnapshot: Number(specs.get(specId)?.ctPerStone || 0),
      }));
      tx.create(db.doc(`bags/${bagId}`), {
        id: bagId,
        bagNumber,
        projectId,
        requestId,
        issuedToId: requestedById,
        issuedById: actor.uid,
        issuedAt: nowIso,
        serverIssuedAt: FieldValue.serverTimestamp(),
        status: 'Issued',
        items,
        evidenceId,
        jobNumberSnapshot: requestData.jobNumberSnapshot || projectData.code || '',
        issueOperationId: operationId,
      });
      tx.create(bagClaimRef, { bagId, projectId, requestId, createdAt: nowIso, serverCreatedAt: FieldValue.serverTimestamp() });
      tx.create(db.doc(`evidence/${evidenceId}`), {
        id: evidenceId,
        projectId,
        transactionId: operationId,
        transactionType: 'ISSUE',
        bagId,
        bagNumber,
        uploaderId: actor.uid,
        uploadedAt: nowIso,
        serverUploadedAt: FieldValue.serverTimestamp(),
        imageSource,
        storagePath: evidencePath,
        version: 1,
        transactionStatus: 'Issued',
        replacementHistory: [],
      });
      tx.create(db.doc(`movements/${movementId}`), {
        id: movementId,
        operationId,
        actionType: 'ISSUE',
        type: 'ISSUE',
        createdAt: nowIso,
        serverCreatedAt: FieldValue.serverTimestamp(),
        createdById: actor.uid,
        location: TORONTO_MELEE,
        referenceProjectId: projectId,
        referenceBagNumber: bagNumber,
        referenceRequestId: requestId,
        sourceRecordPath: `requests/${requestId}`,
        lines: [...totals.entries()].map(([specId, pieces]) => movementLine(specs.get(specId)!, specId, pieces)),
      });
      totals.forEach((pieces, specId) => {
        const spec = specs.get(specId)!;
        const ct = roundCarats(pieces * Number(spec.ctPerStone || 0));
        tx.update(db.doc(`specs/${specId}`), {
          pcs: spec.pcs! - pieces,
          ct: roundCarats(spec.ct! - ct),
          stockVersion: FieldValue.increment(1),
          stockUpdatedAt: FieldValue.serverTimestamp(),
          lastInventoryOperationId: operationId,
        });
      });
      tx.update(projectRef, {
        inventoryUsage: { bySpec, updatedAt: nowIso, lastOperationId: operationId },
      });
    }

    tx.update(requestRef, {
      status: targetStatus,
      fulfillmentDetails: {
        fulfilledAt: nowIso,
        fulfilledById: actor.uid,
        operationId,
        bagId: bagId || null,
        lines: fulfillmentLines,
      },
      serverFulfilledAt: FieldValue.serverTimestamp(),
    });
    writeNotification(
      tx,
      db,
      `notif-${operationId}-${requestedById}`,
      requestedById,
      positiveLines.length > 0 ? 'Bag Issued' : 'Request Closed',
      positiveLines.length > 0
        ? `${[...totals.values()].reduce((sum, pieces) => sum + pieces, 0)} pieces were issued. Any unfulfilled quantity was closed; submit a new request if more stones are required.`
        : 'The request was closed without an issue. Submit a new request if stones are still required.',
      'ASSIGNMENT',
      `/project/${projectId}`,
      projectId
    );
    const result = { requestId, bagId: bagId || null, movementId: movementId || null, status: targetStatus };
    commitOperation(tx, db, operationId, 'ISSUE', hash, actor.uid, result);
    return result;
  });
});

export const submitInventoryReturn = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = await requireActor(request);
  const input = dataOf(request);
  const operationId = requireOperationId(input.operationId);
  const bagId = requireString(input.bagId, 'bagId', 200);
  const projectId = requireString(input.projectId, 'projectId', 200);
  const evidencePath = requireString(input.evidencePath, 'evidencePath', 1000);
  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 2000) : '';
  const imageSource = input.imageSource === 'Device Gallery' ? 'Device Gallery' : 'Camera';
  const returnLines = parseReturnLines(input.returnLines);
  const hash = payloadHash({ bagId, projectId, evidencePath, notes, imageSource, returnLines });
  const db = getFirestore();
  const managers = await managerIds();
  await verifyEvidenceObject(evidencePath, 'returns', actor.uid, operationId, projectId);

  return db.runTransaction(async (tx) => {
    const prior = await readOperation(tx, db, operationId, 'RETURN_SUBMIT', hash);
    if (prior) return prior;
    const bagRef = db.doc(`bags/${bagId}`);
    const bagSnap = await tx.get(bagRef);
    if (!bagSnap.exists) throw new HttpsError('not-found', 'Issued bag not found.');
    const bag = bagSnap.data() || {};
    const acceptedIds = new Set([actor.uid, ...(actor.profile.legacyProfileIds || [])]);
    if (bag.projectId !== projectId || !acceptedIds.has(String(bag.issuedToId))) {
      throw new HttpsError('permission-denied', 'This bag is not issued to you for the selected project.');
    }
    if (bag.status !== 'Issued') throw new HttpsError('failed-precondition', 'This bag cannot accept another return.');
    const items = (Array.isArray(bag.items) ? bag.items : []) as BagItem[];
    const itemMap = new Map(items.map((item) => [item.specId, item]));
    returnLines.forEach((line) => {
      const item = itemMap.get(line.specId);
      if (!item) throw new HttpsError('failed-precondition', 'A returned specification was not issued in this bag.');
      if (line.returnedPcs > item.issuedPcs) throw new HttpsError('failed-precondition', 'Return exceeds the issued quantity.');
    });

    const specSnaps = await tx.getAll(...returnLines.map((line) => db.doc(`specs/${line.specId}`)));
    const specMap = new Map(specSnaps.map((snap) => [snap.id, snap.data() as InventorySpec]));
    const returnId = `return-${operationId}`;
    const evidenceId = `evidence-${operationId}`;
    const nowIso = serverIso();
    const returnRecord = {
      id: returnId,
      projectId,
      bagId,
      bagNumber: bag.bagNumber,
      setterId: String(bag.issuedToId),
      submittedByUid: actor.uid,
      submittedAt: nowIso,
      serverSubmittedAt: Timestamp.now(),
      status: 'PENDING',
      notes,
      evidenceId,
      operationId,
      lines: returnLines.map((line) => {
        const item = itemMap.get(line.specId)!;
        const spec = specMap.get(line.specId) || {};
        return {
          specId: line.specId,
          shape: spec.shape || 'Unknown',
          size: String(spec.sizeMm || 'Unknown'),
          originalIssuedPcs: item.issuedPcs,
          previouslyConfirmedPcs: 0,
          availableBeforeReturn: item.issuedPcs,
          returnedPcs: line.returnedPcs,
        };
      }),
    };
    tx.update(bagRef, {
      status: 'Returned_Pending_Count',
      returnedAt: nowIso,
      returnedNotes: notes,
      returns: [...(Array.isArray(bag.returns) ? bag.returns : []), returnRecord],
      lastReturnOperationId: operationId,
    });
    tx.create(db.doc(`evidence/${evidenceId}`), {
      id: evidenceId,
      projectId,
      transactionId: returnId,
      transactionType: 'RETURN',
      bagId,
      bagNumber: bag.bagNumber,
      uploaderId: actor.uid,
      uploadedAt: nowIso,
      serverUploadedAt: FieldValue.serverTimestamp(),
      imageSource,
      storagePath: evidencePath,
      version: 1,
      transactionStatus: 'PENDING',
      replacementHistory: [],
    });
    managers.forEach((managerId) => {
      writeNotification(tx, db, `notif-${operationId}-${managerId}`, managerId, 'Bag Returned', `Bag #${String(bag.bagNumber)} is ready for Manager confirmation.`, 'RETURN', '/', projectId);
    });
    const result = { bagId, returnId, status: 'PENDING' };
    commitOperation(tx, db, operationId, 'RETURN_SUBMIT', hash, actor.uid, result);
    return result;
  });
});

export const confirmInventoryReturn = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = await requireManager(request);
  const input = dataOf(request);
  const operationId = requireOperationId(input.operationId);
  const bagId = requireString(input.bagId, 'bagId', 200);
  const returnId = requireString(input.returnId, 'returnId', 200);
  const returnLines = parseReturnLines(input.returnLines);
  const breakageLines = parseBreakageLines(input.breakageLines, true);
  const breakageReason = typeof input.breakageReason === 'string' ? input.breakageReason.trim().slice(0, 2000) : '';
  if (breakageLines.length > 0 && !breakageReason) throw new HttpsError('invalid-argument', 'Breakage reason is required.');
  const hash = payloadHash({ bagId, returnId, returnLines, breakageLines, breakageReason });
  const db = getFirestore();
  const bagOutside = await db.doc(`bags/${bagId}`).get();
  if (!bagOutside.exists) throw new HttpsError('not-found', 'Bag not found.');
  const notificationRecipientUid = await canonicalUidForProfileId(requireString(bagOutside.data()?.issuedToId, 'bag.issuedToId', 200));

  return db.runTransaction(async (tx) => {
    const prior = await readOperation(tx, db, operationId, 'RETURN_CONFIRM', hash);
    if (prior) return prior;
    const bagRef = db.doc(`bags/${bagId}`);
    const bagSnap = await tx.get(bagRef);
    if (!bagSnap.exists) throw new HttpsError('not-found', 'Bag not found.');
    const bag = bagSnap.data() || {};
    if (bag.status !== 'Returned_Pending_Count') throw new HttpsError('failed-precondition', 'Return is not pending confirmation.');
    const returns = Array.isArray(bag.returns) ? [...bag.returns] : [];
    const returnIndex = returns.findIndex((entry) => entry?.id === returnId);
    if (returnIndex < 0 || returns[returnIndex].status !== 'PENDING') {
      throw new HttpsError('failed-precondition', 'Return was already confirmed or does not exist.');
    }
    const pendingReturn = returns[returnIndex] as Record<string, unknown>;
    if (pendingReturn.projectId !== bag.projectId || pendingReturn.bagId !== bagId || pendingReturn.setterId !== bag.issuedToId) {
      throw new HttpsError('failed-precondition', 'Return identity does not match the issued bag.');
    }
    const pendingLines = (Array.isArray(pendingReturn.lines) ? pendingReturn.lines : []) as Array<{ specId: string; returnedPcs: number }>;
    if (payloadHash(pendingLines.map((line) => ({ specId: line.specId, returnedPcs: line.returnedPcs }))) !== payloadHash(returnLines)) {
      throw new HttpsError('failed-precondition', 'Physical return does not match the submitted return. Correct the pending return before confirmation.');
    }
    const evidenceId = requireString(pendingReturn.evidenceId, 'return.evidenceId', 200);
    const evidenceRef = db.doc(`evidence/${evidenceId}`);
    const projectRef = db.doc(`projects/${String(bag.projectId)}`);
    const [evidenceSnap, projectSnap] = await Promise.all([tx.get(evidenceRef), tx.get(projectRef)]);
    if (!evidenceSnap.exists || evidenceSnap.data()?.transactionStatus !== 'PENDING') {
      throw new HttpsError('failed-precondition', 'Required immutable return evidence is missing or already used.');
    }
    if (!projectSnap.exists) throw new HttpsError('not-found', 'Project not found.');

    const items = (Array.isArray(bag.items) ? bag.items : []) as BagItem[];
    const itemMap = new Map(items.map((item) => [item.specId, item]));
    const previousConfirmed = returns.filter((entry) => entry?.status === 'CONFIRMED');
    const returnedMap = new Map(returnLines.map((line) => [line.specId, line.returnedPcs]));
    const brokenMap = new Map(breakageLines.map((line) => [line.specId, line.pieces]));
    const affectedSpecIds = new Set([...returnedMap.keys(), ...brokenMap.keys()]);
    affectedSpecIds.forEach((specId) => {
      const item = itemMap.get(specId);
      if (!item) throw new HttpsError('failed-precondition', 'Return or breakage specification was not issued in this bag.');
      const priorReturned = previousConfirmed.reduce((sum, entry) => sum + Number(entry.lines?.find((line: { specId?: string }) => line.specId === specId)?.returnedPcs || 0), 0);
      const priorBroken = previousConfirmed.reduce((sum, entry) => sum + Number(entry.confirmedBreakageLines?.find((line: { specId?: string }) => line.specId === specId)?.pieces || 0), 0);
      const outstanding = item.issuedPcs - priorReturned - priorBroken;
      if ((returnedMap.get(specId) || 0) + (brokenMap.get(specId) || 0) > outstanding) {
        throw new HttpsError('failed-precondition', 'Confirmed return and breakage exceed the outstanding issued quantity.');
      }
    });

    const specRefs = [...affectedSpecIds].map((specId) => db.doc(`specs/${specId}`));
    const specSnaps = specRefs.length > 0 ? await tx.getAll(...specRefs) : [];
    const specs = new Map<string, InventorySpec & { id: string }>();
    specSnaps.forEach((snap) => specs.set(snap.id, requireInitializedMeleeSpec(snap)));
    const nowIso = serverIso();
    const returnMovementId = `mov-${operationId}-return`;
    const breakageMovementId = breakageLines.length > 0 ? `mov-${operationId}-breakage` : '';

    returns[returnIndex] = {
      ...pendingReturn,
      status: 'CONFIRMED',
      managerId: actor.uid,
      confirmedAt: nowIso,
      serverConfirmedAt: Timestamp.now(),
      confirmOperationId: operationId,
      confirmedBreakageLines: breakageLines,
      breakageReason,
    };
    tx.update(bagRef, { status: 'Counted_Confirmed', returns, countedAt: nowIso, countedById: actor.uid });
    tx.update(evidenceRef, { transactionStatus: 'CONFIRMED', confirmedAt: nowIso, confirmedById: actor.uid, confirmOperationId: operationId });
    tx.create(db.doc(`movements/${returnMovementId}`), {
      id: returnMovementId,
      operationId,
      actionType: 'RETURN',
      type: 'RETURN',
      createdAt: nowIso,
      serverCreatedAt: FieldValue.serverTimestamp(),
      createdById: actor.uid,
      location: TORONTO_MELEE,
      referenceProjectId: bag.projectId,
      referenceBagNumber: bag.bagNumber,
      referenceReturnId: returnId,
      sourceRecordPath: `bags/${bagId}`,
      lines: returnLines.map((line) => movementLine(specs.get(line.specId)!, line.specId, line.returnedPcs)),
    });
    if (breakageLines.length > 0) {
      tx.create(db.doc(`movements/${breakageMovementId}`), {
        id: breakageMovementId,
        operationId,
        actionType: 'BREAKAGE',
        type: 'BROKEN_OUT',
        createdAt: nowIso,
        serverCreatedAt: FieldValue.serverTimestamp(),
        createdById: actor.uid,
        location: TORONTO_MELEE,
        referenceProjectId: bag.projectId,
        referenceBagNumber: bag.bagNumber,
        referenceReturnId: returnId,
        sourceRecordPath: `bags/${bagId}`,
        reason: breakageReason,
        notes: breakageReason,
        lines: breakageLines.map((line) => movementLine(specs.get(line.specId)!, line.specId, line.pieces)),
      });
    }
    returnLines.forEach((line) => {
      const spec = specs.get(line.specId)!;
      const ct = roundCarats(line.returnedPcs * Number(spec.ctPerStone || 0));
      tx.update(db.doc(`specs/${line.specId}`), {
        pcs: spec.pcs! + line.returnedPcs,
        ct: roundCarats(spec.ct! + ct),
        stockVersion: FieldValue.increment(1),
        stockUpdatedAt: FieldValue.serverTimestamp(),
        lastInventoryOperationId: operationId,
      });
    });

    const project = projectSnap.data() || {};
    const usage = (project.inventoryUsage || { bySpec: {} }) as ProjectInventoryUsage;
    const bySpec = { ...(usage.bySpec || {}) };
    affectedSpecIds.forEach((specId) => {
      const item = itemMap.get(specId)!;
      const spec = specs.get(specId)!;
      const previous = bySpec[specId] || { issuedPcs: item.issuedPcs, returnedPcs: 0, brokenPcs: 0, netUsedPcs: item.issuedPcs, averageWeightSnapshot: Number(spec.ctPerStone || 0) };
      const returnedPcs = previous.returnedPcs + (returnedMap.get(specId) || 0);
      const brokenPcs = previous.brokenPcs + (brokenMap.get(specId) || 0);
      bySpec[specId] = {
        ...previous,
        returnedPcs,
        brokenPcs,
        netUsedPcs: Math.max(0, previous.issuedPcs - returnedPcs - brokenPcs),
      };
    });
    tx.update(projectRef, { inventoryUsage: { bySpec, updatedAt: nowIso, lastOperationId: operationId } });
    writeNotification(tx, db, `notif-${operationId}-${notificationRecipientUid}`, notificationRecipientUid, 'Return Confirmed', `Return for Bag #${String(bag.bagNumber)} was confirmed.`, 'RETURN', `/project/${String(bag.projectId)}`, String(bag.projectId));
    const result = { bagId, returnId, status: 'CONFIRMED', returnMovementId, breakageMovementId: breakageMovementId || null };
    commitOperation(tx, db, operationId, 'RETURN_CONFIRM', hash, actor.uid, result);
    return result;
  });
});

export const recordInventoryMovement = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = await requireManager(request);
  const input = dataOf(request);
  const operationId = requireOperationId(input.operationId);
  const type = requireString(input.type, 'type', 80);
  const allowed = new Set(['SHIPMENT_IN', 'BROKEN_OUT', 'DIAMOND_ADD', 'DIAMOND_UPDATE', 'DIAMOND_DELETE', 'MELEE_SPEC_DELETE']);
  if (!allowed.has(type)) throw new HttpsError('permission-denied', 'This inventory action requires its dedicated protected workflow.');
  const rawLines = Array.isArray(input.lines) ? input.lines as Array<Record<string, unknown>> : [];
  if (rawLines.length === 0 && type !== 'MELEE_SPEC_DELETE') throw new HttpsError('invalid-argument', 'At least one movement line is required.');
  const location = isTorontoMeleeLocation(input.location) ? TORONTO_MELEE : requireString(input.location, 'location', 100);
  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 2000) : '';
  const referenceProjectId = typeof input.referenceProjectId === 'string' ? input.referenceProjectId : '';
  const weightAuthoritative = input.weightAuthoritative === true;
  const lines = rawLines.map((line, index) => ({
    specId: typeof line.specId === 'string' && line.specId ? line.specId : undefined,
    pcs: line.pcs === undefined ? 0 : requirePieceCount(line.pcs, `lines[${index}].pcs`, true),
    ct: typeof line.ct === 'number' && Number.isFinite(line.ct) && line.ct >= 0 ? roundCarats(line.ct) : 0,
    costPerCtUsd: typeof line.costPerCtUsd === 'number' && Number.isFinite(line.costPerCtUsd) ? line.costPerCtUsd : undefined,
  }));
  const hash = payloadHash({ type, location, notes, referenceProjectId, weightAuthoritative, lines });
  const db = getFirestore();

  return db.runTransaction(async (tx) => {
    const prior = await readOperation(tx, db, operationId, type === 'SHIPMENT_IN' ? 'RECEIPT' : 'BREAKAGE', hash);
    if (prior) return prior;
    const specIds = [...new Set(lines.flatMap((line) => line.specId ? [line.specId] : []))];
    const specSnaps = specIds.length > 0 ? await tx.getAll(...specIds.map((id) => db.doc(`specs/${id}`))) : [];
    const specs = new Map(specSnaps.map((snap) => [snap.id, requireInitializedMeleeSpec(snap)]));
    const normalizedLines: Array<{
      specId?: string;
      pcs?: number;
      ct: number;
      averageWeightSnapshot?: number;
      costPerCtUsd?: number;
    }> = lines.map((line) => {
      if (!line.specId) return { ct: line.ct };
      const spec = specs.get(line.specId)!;
      const average = Number(spec.ctPerStone || 0);
      // Preserve the existing piece-versus-weight contract. Weight-authoritative
      // entries may intentionally change carats without inventing a piece count.
      const pieces = line.pcs || 0;
      const ct = weightAuthoritative && line.ct > 0 ? line.ct : roundCarats(pieces * average);
      return {
        specId: line.specId,
        pcs: pieces,
        ct,
        averageWeightSnapshot: average,
        ...(line.costPerCtUsd !== undefined ? { costPerCtUsd: line.costPerCtUsd } : {}),
      };
    });

    if (type === 'BROKEN_OUT' && !referenceProjectId) {
      normalizedLines.forEach((line) => {
        if (!line.specId) return;
        const spec = specs.get(line.specId)!;
        if (Number(line.pcs || 0) > spec.pcs! || Number(line.ct || 0) > spec.ct! + 0.000001) {
          throw new HttpsError('failed-precondition', `Breakage exceeds available stock for ${spec.label || spec.id}.`);
        }
      });
    }

    const movementId = `mov-${operationId}`;
    const nowIso = serverIso();
    tx.create(db.doc(`movements/${movementId}`), {
      id: movementId,
      operationId,
      actionType: type,
      type,
      createdAt: nowIso,
      serverCreatedAt: FieldValue.serverTimestamp(),
      createdById: actor.uid,
      location,
      notes,
      reason: notes,
      referenceProjectId: referenceProjectId || null,
      supplier: typeof input.supplier === 'string' ? input.supplier.slice(0, 300) : null,
      invoiceNo: typeof input.invoiceNo === 'string' ? input.invoiceNo.slice(0, 300) : null,
      weightAuthoritative,
      lines: normalizedLines,
    });
    if (type === 'SHIPMENT_IN' || (type === 'BROKEN_OUT' && !referenceProjectId)) {
      normalizedLines.forEach((line) => {
        if (!line.specId) return;
        const spec = specs.get(line.specId)!;
        const sign = type === 'SHIPMENT_IN' ? 1 : -1;
        tx.update(db.doc(`specs/${line.specId}`), {
          pcs: spec.pcs! + sign * Number(line.pcs || 0),
          ct: roundCarats(spec.ct! + sign * Number(line.ct || 0)),
          stockVersion: FieldValue.increment(1),
          stockUpdatedAt: FieldValue.serverTimestamp(),
          lastInventoryOperationId: operationId,
        });
      });
    }
    const kind = type === 'SHIPMENT_IN' ? 'RECEIPT' : 'BREAKAGE';
    const result = { movementId, type };
    commitOperation(tx, db, operationId, kind, hash, actor.uid, result);
    return result;
  });
});

export const applyInventoryCorrection = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = await requireManager(request);
  const input = dataOf(request);
  const operationId = requireOperationId(input.operationId);
  const specId = requireString(input.specId, 'specId', 200);
  const reason = requireString(input.reason, 'reason', 2000);
  const mode = input.mode === 'WEIGHT' ? 'WEIGHT' : input.mode === 'PCS' ? 'PCS' : null;
  if (!mode) throw new HttpsError('invalid-argument', 'mode must be PCS or WEIGHT.');
  const previousPcs = requirePieceCount(input.previousPcs, 'previousPcs', true);
  const previousCt = typeof input.previousCt === 'number' && Number.isFinite(input.previousCt) && input.previousCt >= 0
    ? roundCarats(input.previousCt)
    : null;
  const targetPcsInput = requirePieceCount(input.targetPcs, 'targetPcs', true);
  const targetCtInput = typeof input.targetCt === 'number' && Number.isFinite(input.targetCt) && input.targetCt >= 0
    ? roundCarats(input.targetCt)
    : null;
  if (previousCt === null || targetCtInput === null) {
    throw new HttpsError('invalid-argument', 'previousCt and targetCt must be non-negative numbers.');
  }
  const reconciliationInput = input.reconciliation && typeof input.reconciliation === 'object' && !Array.isArray(input.reconciliation)
    ? input.reconciliation as Record<string, unknown>
    : null;
  const reconciliation = reconciliationInput ? {
    auditFingerprint: requireString(reconciliationInput.auditFingerprint, 'reconciliation.auditFingerprint', 200),
    expectedPcs: requirePieceCount(reconciliationInput.expectedPcs, 'reconciliation.expectedPcs', true),
    expectedCt: typeof reconciliationInput.expectedCt === 'number' && Number.isFinite(reconciliationInput.expectedCt) && reconciliationInput.expectedCt >= 0
      ? roundCarats(reconciliationInput.expectedCt)
      : null,
    sourceEvidence: Array.isArray(reconciliationInput.sourceEvidence)
      ? reconciliationInput.sourceEvidence.filter((value): value is string => typeof value === 'string' && value.length <= 300).slice(0, 25)
      : [],
  } : null;
  if (reconciliation && reconciliation.expectedCt === null) {
    throw new HttpsError('invalid-argument', 'reconciliation.expectedCt must be a non-negative number.');
  }
  if (reconciliation && (targetPcsInput !== reconciliation.expectedPcs || Math.abs(targetCtInput - reconciliation.expectedCt!) > 0.000001)) {
    throw new HttpsError('invalid-argument', 'A reconciliation correction must use the currently calculated expected balance.');
  }
  const hash = payloadHash({ specId, reason, mode, previousPcs, previousCt, targetPcsInput, targetCtInput, reconciliation });
  const db = getFirestore();

  // Preserve idempotency even after the correction itself changes the audit.
  // The transactional check below remains the authoritative race-safe check.
  const existingOperation = await operationRef(db, operationId).get();
  if (existingOperation.exists) {
    const existing = existingOperation.data() || {};
    if (existing.kind !== 'CORRECTION' || existing.payloadHash !== hash) {
      throw new HttpsError('already-exists', 'This operationId was already used for different data.');
    }
    return (existing.result || {}) as Record<string, unknown>;
  }

  // A Phase 2 approval is always checked against a fresh, server-side audit.
  // Trusted inventory mutations update the same spec cache atomically, and the
  // transaction below rechecks that cache before any correction can commit.
  if (reconciliation) {
    const freshAudit = await auditReconciliationSpec(db, specId);
    if (
      freshAudit.auditFingerprint !== reconciliation.auditFingerprint ||
      freshAudit.expectedPcs !== reconciliation.expectedPcs ||
      Math.abs(freshAudit.expectedCt - reconciliation.expectedCt!) > 0.000001 ||
      !freshAudit.correctionAllowed
    ) {
      throw new HttpsError('aborted', 'The reconciliation changed after review. Refresh the audit before approving a correction.');
    }
  }

  return db.runTransaction(async (tx) => {
    const prior = await readOperation(tx, db, operationId, 'CORRECTION', hash);
    if (prior) return prior;
    const specRef = db.doc(`specs/${specId}`);
    const spec = requireInitializedMeleeSpec(await tx.get(specRef));
    if (spec.pcs !== previousPcs || Math.abs(spec.ct! - previousCt) > 0.000001) {
      throw new HttpsError('aborted', 'Inventory changed after the audit. Refresh the reconciliation screen and try again.');
    }
    const average = Number(spec.ctPerStone || 0);
    const targetPcs = mode === 'WEIGHT' && average > 0 ? Math.round(targetCtInput / average) : targetPcsInput;
    const targetCt = mode === 'WEIGHT' ? targetCtInput : roundCarats(targetPcs * average);
    if (!Number.isSafeInteger(targetPcs) || targetPcs < 0 || targetCt < 0) {
      throw new HttpsError('invalid-argument', 'The corrected balance is invalid.');
    }
    const pieceDelta = targetPcs - spec.pcs!;
    const caratDelta = roundCarats(targetCt - spec.ct!);
    const reconciliationMetadata = reconciliation ? {
      auditFingerprint: reconciliation.auditFingerprint,
      expectedPcs: reconciliation.expectedPcs,
      expectedCt: reconciliation.expectedCt,
      previousPcs,
      previousCt,
      approvedDeltaPcs: pieceDelta,
      approvedDeltaCt: caratDelta,
      sourceEvidence: reconciliation.sourceEvidence,
    } : null;
    const nowIso = serverIso();
    const reversalMovementId = `mov-${operationId}-reversal`;
    const replacementMovementId = `mov-${operationId}-replacement`;
    const reversalLedgerId = `tx-${operationId}-reversal`;
    const replacementLedgerId = `tx-${operationId}-replacement`;
    if (pieceDelta !== 0 || Math.abs(caratDelta) > 0.000001) {
      tx.create(db.doc(`movements/${reversalMovementId}`), {
        id: reversalMovementId,
        operationId,
        actionType: 'CORRECTION_REVERSAL',
        type: 'INVENTORY_CORRECTION',
        createdAt: nowIso,
        serverCreatedAt: FieldValue.serverTimestamp(),
        createdById: actor.uid,
        location: TORONTO_MELEE,
        reason,
        notes: `Reverse the audited balance before applying its corrected replacement. ${reason}`,
        weightAuthoritative: mode === 'WEIGHT',
        before: { pcs: spec.pcs, ct: spec.ct },
        after: { pcs: 0, ct: 0 },
        reconciliation: reconciliationMetadata,
        replacementMovementId,
        lines: [{ specId, pcs: -spec.pcs!, ct: -spec.ct!, averageWeightSnapshot: average }],
      });
      tx.create(db.doc(`movements/${replacementMovementId}`), {
        id: replacementMovementId,
        operationId,
        actionType: 'CORRECTION_REPLACEMENT',
        type: 'INVENTORY_CORRECTION',
        createdAt: nowIso,
        serverCreatedAt: FieldValue.serverTimestamp(),
        createdById: actor.uid,
        location: TORONTO_MELEE,
        reason,
        notes: `Apply the corrected balance after its immutable reversal. ${reason}`,
        weightAuthoritative: mode === 'WEIGHT',
        before: { pcs: 0, ct: 0 },
        after: { pcs: targetPcs, ct: targetCt },
        reconciliation: reconciliationMetadata,
        reversesMovementId: reversalMovementId,
        lines: [{ specId, pcs: targetPcs, ct: targetCt, averageWeightSnapshot: average }],
      });
      tx.create(db.doc(`diamond_transactions/${reversalLedgerId}`), {
        id: reversalLedgerId,
        operationId,
        createdAt: nowIso,
        serverCreatedAt: FieldValue.serverTimestamp(),
        createdById: actor.uid,
        specId,
        quantity: -spec.pcs!,
        carats: -spec.ct!,
        movementType: 'corrected',
        correctionRole: 'REVERSAL',
        averageWeightSnapshot: average,
        status: 'active',
        reason,
        replacementTransactionId: replacementLedgerId,
        sourceRecordPath: `movements/${reversalMovementId}`,
        reconciliation: reconciliationMetadata,
      });
      tx.create(db.doc(`diamond_transactions/${replacementLedgerId}`), {
        id: replacementLedgerId,
        operationId,
        createdAt: nowIso,
        serverCreatedAt: FieldValue.serverTimestamp(),
        createdById: actor.uid,
        specId,
        quantity: targetPcs,
        carats: targetCt,
        movementType: 'corrected',
        correctionRole: 'REPLACEMENT',
        averageWeightSnapshot: average,
        status: 'active',
        reason,
        reversesTransactionId: reversalLedgerId,
        sourceRecordPath: `movements/${replacementMovementId}`,
        reconciliation: reconciliationMetadata,
      });
      tx.update(specRef, {
        pcs: targetPcs,
        ct: targetCt,
        stockVersion: FieldValue.increment(1),
        stockUpdatedAt: FieldValue.serverTimestamp(),
        lastInventoryOperationId: operationId,
      });
    }
    const changed = pieceDelta !== 0 || Math.abs(caratDelta) > 0.000001;
    const result = {
      movementId: changed ? replacementMovementId : null,
      reversalMovementId: changed ? reversalMovementId : null,
      replacementMovementId: changed ? replacementMovementId : null,
      specId,
      targetPcs,
      targetCt,
      reconciliation: reconciliationMetadata,
    };
    commitOperation(tx, db, operationId, 'CORRECTION', hash, actor.uid, result);
    return result;
  });
});

export const hardenLegacyEvidenceAccess = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = await requireManager(request);
  const input = dataOf(request);
  const apply = input.apply === true;
  const db = getFirestore();
  const evidenceSnap = await db.collection('evidence').get();
  const candidates = evidenceSnap.docs.flatMap((doc) => {
    const data = doc.data();
    if (typeof data.storagePath === 'string' && data.storagePath) return [];
    const originalPath = storagePathFromLegacyUrl(data.photoUrl);
    if (!originalPath) return [];
    return [{ doc, originalPath, thumbnailPath: storagePathFromLegacyUrl(data.thumbnailUrl) }];
  });
  if (!apply) {
    return { apply: false, candidateCount: candidates.length, migratedCount: 0, failed: [] };
  }

  const failed: Array<{ evidenceId: string; reason: string }> = [];
  let migratedCount = 0;
  for (const candidate of candidates) {
    try {
      const paths = [...new Set([candidate.originalPath, candidate.thumbnailPath].filter((path): path is string => !!path))];
      for (const path of paths) {
        const file = getStorage().bucket().file(path);
        const [metadata] = await file.getMetadata();
        await file.setMetadata({
          metadata: {
            ...(metadata.metadata || {}),
            firebaseStorageDownloadTokens: newServerId('rotated'),
          },
        });
      }
      await candidate.doc.ref.update({
        storagePath: candidate.originalPath,
        photoUrl: FieldValue.delete(),
        thumbnailUrl: FieldValue.delete(),
        accessHardenedAt: FieldValue.serverTimestamp(),
        accessHardenedById: actor.uid,
        legacyEvidenceMigration: {
          originalStoragePath: candidate.originalPath,
          thumbnailStoragePath: candidate.thumbnailPath || null,
          tokenRotated: true,
        },
      });
      migratedCount++;
    } catch (error) {
      failed.push({ evidenceId: candidate.doc.id, reason: error instanceof Error ? error.message : 'Unknown migration error' });
    }
  }
  return { apply: true, candidateCount: candidates.length, migratedCount, failed };
});

export const getPhase1BootstrapAudit = onCall(CALLABLE_OPTIONS, async (request) => {
  await requireManager(request);
  const db = getFirestore();
  const [specsSnap, movementsSnap, evidenceSnap] = await Promise.all([
    db.collection('specs').get(),
    db.collection('movements').get(),
    db.collection('evidence').get(),
  ]);
  const meleeSpecs = specsSnap.docs.filter((doc) => isTorontoMeleeLocation(doc.data().location));
  const blockers = meleeSpecs.flatMap((doc) => {
    const data = doc.data();
    const problems: string[] = [];
    if (!Number.isSafeInteger(data.pcs) || typeof data.ct !== 'number') problems.push('MISSING_BALANCE');
    if (Number(data.pcs) < 0 || Number(data.ct) < 0) problems.push('NEGATIVE_BALANCE');
    return problems.map((problem) => ({ specId: doc.id, label: data.label || doc.id, problem }));
  });
  const legacyEvidenceBlockers = evidenceSnap.docs.flatMap((doc) => {
    const data = doc.data();
    return !data.storagePath && storagePathFromLegacyUrl(data.photoUrl)
      ? [{ evidenceId: doc.id, problem: 'LEGACY_DOWNLOAD_TOKEN_REQUIRES_ROTATION' }]
      : [];
  });
  return {
    canonicalLocation: TORONTO_MELEE,
    specsChecked: meleeSpecs.length,
    movementsChecked: movementsSnap.size,
    evidenceChecked: evidenceSnap.size,
    blockers,
    legacyEvidenceBlockers,
    ready: blockers.length === 0 && legacyEvidenceBlockers.length === 0,
    note: 'This Phase 1 audit does not rewrite historical movements. Activation is blocked until every Toronto Melee spec has a non-negative authoritative cache and old evidence download tokens are rotated.',
  };
});
