import { FieldValue, Firestore, Timestamp, Transaction, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { isAssignedToProject, requireActor, requireManager } from '../inventory/auth';
import { payloadHash, requireOperationId, requireString } from '../inventory/validation';

const CALLABLE_OPTIONS = { region: 'northamerica-northeast1', cors: true } as const;
const GOLD_API_KEY = 'goldapi-il23ismkzq9u0u-io';
const GRAMS_PER_TROY_OUNCE = 31.1034768;
const PURITY_PPM: Record<string, number> = { '10k': 417000, '14k': 585000, '18k': 750000, '21k': 875000 };
const METALS = new Set(['Yellow', 'White', 'Rose', 'Platinum']);

type Data = Record<string, unknown>;

function dataOf(value: unknown): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpsError('invalid-argument', 'A request payload is required.');
  return value as Data;
}

function serverIso(): string {
  return Timestamp.now().toDate().toISOString();
}

function requireInteger(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    throw new HttpsError('invalid-argument', `${field} must be a whole number between ${min} and ${max}.`);
  }
  return Number(value);
}

function optionalReason(value: unknown, required: boolean): string {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpsError('invalid-argument', 'A reason is required.');
    return '';
  }
  return requireString(value, 'reason', 1000);
}

function assertUnlocked(project: Data): void {
  if (project.status === 'Closed' || project.date_picked_up) throw new HttpsError('failed-precondition', 'Picked Up projects are permanently read-only.');
}

function normalizeComponents(project: Data): Data[] {
  const source = Array.isArray(project.goldComponents) ? project.goldComponents : [];
  if (source.length === 0 && (project.goldType || project.goldPurity)) {
    source.push({ id: 'legacy-component', label: 'Main Piece', type: project.goldType, purity: project.goldPurity });
  }
  return source.filter(value => value && typeof value === 'object').map((value, index) => {
    const component = { ...(value as Data) };
    const id = typeof component.id === 'string' && component.id ? component.id : `legacy-component-${index + 1}`;
    const componentId = typeof component.componentId === 'string' && component.componentId ? component.componentId : id;
    const revisionId = typeof component.revisionId === 'string' && component.revisionId ? component.revisionId : id;
    const purity = typeof component.purity === 'string' ? component.purity : '';
    return {
      ...component,
      id,
      componentId,
      revisionId,
      revisionVersion: Number.isSafeInteger(component.revisionVersion) ? Number(component.revisionVersion) : 0,
      state: component.state === 'SUPERSEDED'
        ? 'SUPERSEDED'
        : component.state === 'REMOVED'
          ? 'REMOVED'
          : 'ACTIVE',
      purityRatioPpm: Number.isSafeInteger(component.purityRatioPpm)
        ? Number(component.purityRatioPpm)
        : (typeof component.ratioSnapshot === 'number' ? Math.round(component.ratioSnapshot * 1_000_000) : (PURITY_PPM[purity] || 0)),
    };
  });
}

function activeComponentIndex(components: Data[], revisionId: string): number {
  return components.findIndex(component => component.revisionId === revisionId && component.state === 'ACTIVE');
}

function actorSummary(actor: Awaited<ReturnType<typeof requireActor>>): Data {
  return { uid: actor.uid, name: actor.profile.name || actor.profile.email || actor.uid, role: actor.profile.role || '' };
}

function canManageCasting(project: Data, actor: Awaited<ReturnType<typeof requireActor>>): boolean {
  return actor.profile.role === 'Manager'
    || (actor.profile.role === 'Designer' && isAssignedToProject(project, actor));
}

async function revisionRecipientUids(db: Firestore, project: Data, actorUid: string): Promise<string[]> {
  const assigned = new Set<string>();
  if (Array.isArray(project.activeAssignees)) project.activeAssignees.forEach(value => { if (typeof value === 'string') assigned.add(value); });
  if (Array.isArray(project.assignments)) project.assignments.forEach(value => {
    if (value && typeof value === 'object' && (value as Data).active !== false && typeof (value as Data).userId === 'string') assigned.add((value as Data).userId as string);
  });
  if (assigned.size === 0) return [];
  const users = await db.collection('users').get();
  const recipients = new Set<string>();
  users.docs.forEach(document => {
    const profile = document.data();
    if (profile.active === false) return;
    const ids = new Set([document.id, ...(typeof profile.authUid === 'string' ? [profile.authUid] : []), ...(Array.isArray(profile.legacyProfileIds) ? profile.legacyProfileIds : [])]);
    if ([...assigned].some(id => ids.has(id))) {
      const uid = typeof profile.authUid === 'string' ? profile.authUid : document.id;
      if (uid !== actorUid) recipients.add(uid);
    }
  });
  return [...recipients].sort();
}

function roundInternalCostCents(weightMg: number, rateCentsPerGram: number): number {
  return Number((BigInt(weightMg) * BigInt(rateCentsPerGram) + 500n) / 1000n);
}

function roundClientChargeCents(weightMg: number, ratioPpm: number, priceCentsPerGram: number): number {
  const denominator = 1_000_000_000n;
  return Number((BigInt(weightMg) * BigInt(ratioPpm) * BigInt(priceCentsPerGram) + denominator / 2n) / denominator);
}

async function idempotentResult(transaction: Transaction, operationRef: FirebaseFirestore.DocumentReference, hash: string): Promise<unknown | undefined> {
  const operation = await transaction.get(operationRef);
  if (!operation.exists) return undefined;
  if (operation.data()?.payloadHash !== hash) throw new HttpsError('already-exists', 'This operationId was already used for different data.');
  return operation.data()?.result;
}

function createRevision(transaction: Transaction, projectRef: FirebaseFirestore.DocumentReference, id: string, data: Data): void {
  transaction.create(projectRef.collection('revisions').doc(id), {
    id,
    operationId: data.operationId || id,
    projectId: projectRef.id,
    serverCreatedAt: FieldValue.serverTimestamp(),
    ...data,
  });
}

function validateMetalPurity(metal: string, purity: string): number {
  if (!METALS.has(metal)) throw new HttpsError('invalid-argument', 'Unsupported metal type.');
  if (metal === 'Platinum') {
    if (purity !== '950') throw new HttpsError('invalid-argument', 'Platinum purity must be 950.');
    return 0;
  }
  const ratio = PURITY_PPM[purity];
  if (!ratio) throw new HttpsError('invalid-argument', 'Unsupported gold purity.');
  return ratio;
}

export const reviseMetalComponent = onCall(CALLABLE_OPTIONS, async request => {
  const actor = await requireActor(request);
  const input = dataOf(request.data);
  const operationId = requireOperationId(input.operationId);
  const projectId = requireString(input.projectId, 'projectId', 200);
  const revisionId = requireString(input.revisionId, 'revisionId', 200);
  const reason = requireString(input.reason, 'reason', 1000);
  const expectedVersion = requireInteger(input.expectedVersion, 'expectedVersion', 0, 1_000_000);
  const label = requireString(input.label, 'label', 120);
  const metal = requireString(input.metal, 'metal', 30);
  const purity = requireString(input.purity, 'purity', 30);
  const ratioPpm = validateMetalPurity(metal, purity);
  const hash = payloadHash({ operationId, projectId, revisionId, reason, expectedVersion, label, metal, purity });
  const db = getFirestore();
  const projectRef = db.doc(`projects/${projectId}`);
  const operationRef = db.doc(`project_workflow_operations/${operationId}`);
  const initialProject = await projectRef.get();
  if (!initialProject.exists) throw new HttpsError('not-found', 'Project not found.');
  const recipients = await revisionRecipientUids(db, initialProject.data() || {}, actor.uid);

  return db.runTransaction(async transaction => {
    const prior = await idempotentResult(transaction, operationRef, hash);
    if (prior !== undefined) return prior;
    const snap = await transaction.get(projectRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Project not found.');
    const project = snap.data() || {};
    assertUnlocked(project);
    if (!canManageCasting(project, actor)) {
      throw new HttpsError('permission-denied', 'Only Managers and assigned Designers may revise metal components.');
    }
    const components = normalizeComponents(project);
    const index = activeComponentIndex(components, revisionId);
    if (index < 0) throw new HttpsError('not-found', 'Active component revision not found.');
    const current = components[index];
    if (current.revisionVersion !== expectedVersion) throw new HttpsError('aborted', 'This component changed after the screen loaded. Refresh and review it.');
    const changedMetal = current.type !== metal || current.purity !== purity;
    const createdAt = serverIso();
    let nextRevisionId = revisionId;
    let kind = 'COMPONENT_REVISED';
    if (changedMetal) {
      nextRevisionId = `component-revision-${operationId}`;
      kind = 'COMPONENT_SUPERSEDED';
      components[index] = { ...current, state: 'SUPERSEDED', supersededAt: createdAt, supersededByRevisionId: nextRevisionId };
      components.push({
        id: nextRevisionId,
        componentId: current.componentId,
        revisionId: nextRevisionId,
        revisionVersion: expectedVersion + 1,
        supersedesRevisionId: revisionId,
        state: 'ACTIVE', label, type: metal, purity, purityRatioPpm: ratioPpm,
      });
    } else {
      components[index] = { ...current, label, revisionVersion: expectedVersion + 1 };
    }
    const result = { projectId, componentId: current.componentId, revisionId: nextRevisionId, version: expectedVersion + 1 };
    const isPrimary = project.primaryGoldComponentId === current.componentId
      || (!project.primaryGoldComponentId && (index === 0 || (project.goldType === current.type && project.goldPurity === current.purity)));
    transaction.update(projectRef, {
      goldComponents: components,
      ...(isPrimary ? { goldType: metal, goldPurity: purity, primaryGoldComponentId: current.componentId } : {}),
      projectRevisionUpdatedAt: FieldValue.serverTimestamp(),
    });
    createRevision(transaction, projectRef, operationId, {
      operationId, projectCode: project.code || projectId, kind, reason, editor: actorSummary(actor),
      before: current, after: changedMetal ? components[components.length - 1] : components[index], version: expectedVersion + 1, createdAt, result,
    });
    recipients.forEach(uid => {
      const notificationId = `project-revision-${operationId}-${uid}`;
      transaction.create(db.doc(`notifications/${notificationId}`), {
        id: notificationId, userId: uid, eventType: 'PROJECT_REVISION', type: 'PROJECT_REVISION',
        projectId, relatedProjectId: projectId, title: 'Project Metal Component Updated',
        message: `${project.code || projectId}: ${current.label || 'Component'} revised by ${actor.profile.name || actor.uid}. Reason: ${reason}`,
        createdById: actor.uid, createdAt, serverCreatedAt: FieldValue.serverTimestamp(), isRead: false, read: false,
        readAt: null, isArchived: false, archivedAt: null, link: `/project/${projectId}`, metadata: { revisionId: operationId },
      });
    });
    transaction.create(operationRef, { type: 'PHASE5_COMPONENT_REVISION', projectId, actorUid: actor.uid, payloadHash: hash, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const recordCastingReceipt = onCall(CALLABLE_OPTIONS, async request => {
  const actor = await requireActor(request);
  const input = dataOf(request.data);
  const operationId = requireOperationId(input.operationId);
  const projectId = requireString(input.projectId, 'projectId', 200);
  const condition = requireString(input.condition, 'condition', 30);
  if (!['CORRECT', 'DAMAGED', 'INCORRECT'].includes(condition)) throw new HttpsError('invalid-argument', 'Invalid casting condition.');
  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 1000) : '';
  if (!Array.isArray(input.weights) || input.weights.length === 0 || input.weights.length > 50) throw new HttpsError('invalid-argument', 'Component receipt lines are required.');
  const weights = input.weights.map((value, index) => {
    const row = dataOf(value);
    return {
      revisionId: requireString(row.revisionId, `weights[${index}].revisionId`, 200),
      weightMg: requireInteger(row.weightMg, `weights[${index}].weightMg`, condition === 'CORRECT' ? 1 : 0, 100_000_000),
      supplierRateCentsPerGram: condition === 'CORRECT'
        ? requireInteger(row.supplierRateCentsPerGram, `weights[${index}].supplierRateCentsPerGram`, 1, 10_000_000)
        : undefined,
    };
  });
  if (new Set(weights.map(row => row.revisionId)).size !== weights.length) throw new HttpsError('invalid-argument', 'Component weights must be unique.');
  const removedComponents = Array.isArray(input.removedComponents)
    ? input.removedComponents.map((value, index) => {
      const row = dataOf(value);
      return {
        revisionId: requireString(row.revisionId, `removedComponents[${index}].revisionId`, 200),
        reason: requireString(row.reason, `removedComponents[${index}].reason`, 500),
      };
    })
    : [];
  if (new Set(removedComponents.map(row => row.revisionId)).size !== removedComponents.length) throw new HttpsError('invalid-argument', 'Removed components must be unique.');
  if (removedComponents.some(removed => weights.some(weight => weight.revisionId === removed.revisionId))) {
    throw new HttpsError('invalid-argument', 'A component cannot be both received and removed.');
  }
  const hash = payloadHash({ operationId, projectId, condition, notes, weights, removedComponents });
  const db = getFirestore();
  const projectRef = db.doc(`projects/${projectId}`);
  const operationRef = db.doc(`project_workflow_operations/${operationId}`);
  return db.runTransaction(async transaction => {
    const prior = await idempotentResult(transaction, operationRef, hash);
    if (prior !== undefined) return prior;
    const snap = await transaction.get(projectRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Project not found.');
    const project = snap.data() || {};
    assertUnlocked(project);
    if (!canManageCasting(project, actor)) throw new HttpsError('permission-denied', 'Only Managers and assigned Designers may receive casting.');
    const components = normalizeComponents(project);
    const events = Array.isArray(project.castingEvents) ? [...project.castingEvents] as Data[] : [];
    if (events.length === 0 || events[events.length - 1]?.receivedAt) throw new HttpsError('failed-precondition', 'No open casting dispatch was found.');
    const last = { ...events[events.length - 1] };
    const activeRevisionIds = components.filter(component => component.state === 'ACTIVE').map(component => String(component.revisionId));
    const dispatchedRevisionIds = Array.isArray(last.goldComponentIds) && last.goldComponentIds.length > 0
      ? last.goldComponentIds.map(String)
      : activeRevisionIds;
    const submittedRevisionIds = [...weights.map(row => row.revisionId), ...removedComponents.map(row => row.revisionId)].sort();
    if (submittedRevisionIds.length !== dispatchedRevisionIds.length
      || submittedRevisionIds.some((revisionId, index) => revisionId !== [...dispatchedRevisionIds].sort()[index])) {
      throw new HttpsError('invalid-argument', 'Every dispatched component must be received or removed.');
    }

    const createdAt = serverIso();
    const editor = actorSummary(actor);
    const removedHistory: Data[] = [];
    for (const removed of removedComponents) {
      const index = activeComponentIndex(components, removed.revisionId);
      if (index < 0) throw new HttpsError('not-found', `Component ${removed.revisionId} was not found.`);
      const current = components[index];
      if (current.internalCastingCost) throw new HttpsError('failed-precondition', 'A component with a locked casting cost cannot be removed. Use the correction workflow.');
      removedHistory.push({
        componentId: current.componentId,
        revisionId: current.revisionId,
        label: current.label || 'Component',
        reason: removed.reason,
      });
      components[index] = {
        ...current,
        state: 'REMOVED',
        removedAt: createdAt,
        removedBy: editor,
        removalReason: removed.reason,
        removedDuringCastingEventId: last.id,
      };
    }
    if (components.filter(component => component.state === 'ACTIVE').length === 0) {
      throw new HttpsError('failed-precondition', 'At least one active metal component must remain on the project.');
    }

    const componentCosts: Data[] = [];
    for (const row of weights) {
      const index = activeComponentIndex(components, row.revisionId);
      if (index < 0) throw new HttpsError('not-found', `Component ${row.revisionId} was not found.`);
      const current = components[index];
      if (current.internalCastingCost) throw new HttpsError('failed-precondition', 'Casting weight is locked by a confirmed internal cost. Use a correction transaction.');
      if (condition === 'CORRECT') {
        const supplierRateCentsPerGram = row.supplierRateCentsPerGram!;
        const amountCents = roundInternalCostCents(row.weightMg, supplierRateCentsPerGram);
        const draft = {
          status: 'DRAFT',
          castingEventId: String(last.id),
          castingWeightMg: row.weightMg,
          supplierRateCentsPerGram,
          amountCents,
          enteredAt: createdAt,
          enteredBy: editor,
          costingMode: 'REPLACEMENT_LATEST_ONLY',
        };
        componentCosts.push({
          componentId: current.componentId,
          revisionId: current.revisionId,
          label: current.label || 'Component',
          castingWeightMg: row.weightMg,
          supplierRateCentsPerGram,
          amountCents,
        });
        components[index] = { ...current, castingWeightMg: row.weightMg, weightG: row.weightMg / 1000, pendingInternalCastingCost: draft };
      } else {
        const { pendingInternalCastingCost: _discardedDraft, ...withoutDraft } = current;
        components[index] = { ...withoutDraft, castingWeightMg: row.weightMg, weightG: row.weightMg / 1000 };
      }
    }

    const componentWeightsMg = Object.fromEntries(weights.map(row => [row.revisionId, row.weightMg]));
    const overallCastingCostCents = componentCosts.reduce((sum, row) => sum + Number(row.amountCents || 0), 0);
    events[events.length - 1] = {
      ...last,
      receivedAt: createdAt,
      condition,
      notes,
      componentWeightsMg,
      receivedWeightG: weights.reduce((sum, row) => sum + row.weightMg, 0) / 1000,
      receivedById: actor.uid,
      ...(condition === 'CORRECT' ? {
        componentCosts,
        overallCastingCostCents,
        costingMode: 'REPLACEMENT_LATEST_ONLY',
      } : {}),
      ...(removedHistory.length > 0 ? { removedComponents: removedHistory } : {}),
    };
    const result = { projectId, castingEventId: last.id, componentWeightsMg, overallCastingCostCents };
    const activeComponents = components.filter(component => component.state === 'ACTIVE');
    const primaryStillActive = activeComponents.some(component => component.componentId === project.primaryGoldComponentId);
    const replacementPrimary = primaryStillActive ? undefined : activeComponents[0];
    transaction.update(projectRef, {
      goldComponents: components,
      castingEvents: events,
      designStage: condition === 'CORRECT' ? 'Ready for Production' : 'Casting Received (Issue)',
      ...(replacementPrimary ? {
        primaryGoldComponentId: replacementPrimary.componentId,
        goldType: replacementPrimary.type,
        goldPurity: replacementPrimary.purity,
      } : {}),
    });
    createRevision(transaction, projectRef, operationId, {
      operationId,
      projectCode: project.code || projectId,
      kind: 'CASTING_RECEIVED',
      reason: notes || condition,
      editor,
      before: {},
      after: {
        condition,
        componentWeightsMg,
        componentCosts,
        overallCastingCostCents,
        costingMode: condition === 'CORRECT' ? 'REPLACEMENT_LATEST_ONLY' : undefined,
        removedComponents: removedHistory,
      },
      version: 1,
      createdAt,
      result,
    });
    transaction.create(operationRef, { type: 'PHASE5_CASTING_RECEIPT', projectId, actorUid: actor.uid, payloadHash: hash, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const dispatchCastingPhase5 = onCall(CALLABLE_OPTIONS, async request => {
  const actor = await requireActor(request);
  const input = dataOf(request.data);
  const operationId = requireOperationId(input.operationId);
  const projectId = requireString(input.projectId, 'projectId', 200);
  const requestedIds = Array.isArray(input.revisionIds) ? input.revisionIds.map((value, index) => requireString(value, `revisionIds[${index}]`, 200)) : [];
  const hash = payloadHash({ operationId, projectId, revisionIds: requestedIds });
  const db = getFirestore();
  const projectRef = db.doc(`projects/${projectId}`);
  const operationRef = db.doc(`project_workflow_operations/${operationId}`);
  return db.runTransaction(async transaction => {
    const prior = await idempotentResult(transaction, operationRef, hash);
    if (prior !== undefined) return prior;
    const snap = await transaction.get(projectRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Project not found.');
    const project = snap.data() || {};
    assertUnlocked(project);
    if (!canManageCasting(project, actor)) throw new HttpsError('permission-denied', 'Only Managers and assigned Designers may dispatch casting.');
    const active = normalizeComponents(project).filter(component => component.state === 'ACTIVE');
    const revisionIds = requestedIds.length ? requestedIds : active.map(component => String(component.revisionId));
    if (revisionIds.length === 0 || revisionIds.some(id => activeComponentIndex(active, id) < 0)) throw new HttpsError('invalid-argument', 'Choose only active component revisions.');
    const events = Array.isArray(project.castingEvents) ? [...project.castingEvents] : [];
    if (events.length && !(events[events.length - 1] as Data)?.receivedAt) throw new HttpsError('failed-precondition', 'The current casting dispatch must be received before another is sent.');
    const recast = project.designStage === 'Casting Received (Issue)';
    const sentAt = serverIso();
    const event = { id: `casting-${operationId}`, projectId, cycleNumber: events.length + 1, sentAt, sentById: actor.uid, goldComponentIds: revisionIds };
    const result = { projectId, castingEventId: event.id, designStage: recast ? 'Recasting Sent' : 'Casting Sent' };
    transaction.update(projectRef, { castingEvents: [...events, event], designStage: result.designStage });
    transaction.create(operationRef, { type: 'PHASE5_CASTING_DISPATCH', projectId, actorUid: actor.uid, payloadHash: hash, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const revertProjectToActivePhase5 = onCall(CALLABLE_OPTIONS, async request => {
  const actor = await requireManager(request);
  const input = dataOf(request.data);
  const operationId = requireOperationId(input.operationId);
  const projectId = requireString(input.projectId, 'projectId', 200);
  const hash = payloadHash({ operationId, projectId });
  const db = getFirestore();
  const projectRef = db.doc(`projects/${projectId}`);
  const operationRef = db.doc(`project_workflow_operations/${operationId}`);
  return db.runTransaction(async transaction => {
    const prior = await idempotentResult(transaction, operationRef, hash);
    if (prior !== undefined) return prior;
    const snap = await transaction.get(projectRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Project not found.');
    const project = snap.data() || {};
    assertUnlocked(project);
    if (project.status !== 'Review') throw new HttpsError('failed-precondition', 'Only a project in Review can return to Active production.');
    const createdAt = serverIso();
    const progress = [...(Array.isArray(project.progress) ? project.progress : []), { id: `revert-${operationId}`, projectId, createdById: actor.uid, createdAt, stageName: 'Returned to Active', percentComplete: 90, weightG: 0 }];
    const result = { projectId, status: 'Active' };
    transaction.update(projectRef, {
      status: 'Active', currentStageName: 'QC/Polish', currentPercentComplete: 90, date_completed: null,
      date_picked_up: FieldValue.delete(), projectEndGoldPriceSnapshot: FieldValue.delete(), projectEndGoldPriceCapturedAt: FieldValue.delete(),
      finalGoldCostCalculated: FieldValue.delete(), progress, last_status_change_at: createdAt, last_status_change_by: actor.uid,
    });
    transaction.create(operationRef, { type: 'PHASE5_REVERT_TO_ACTIVE', projectId, actorUid: actor.uid, payloadHash: hash, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const confirmInternalCastingCost = onCall(CALLABLE_OPTIONS, async request => {
  const actor = await requireManager(request);
  const input = dataOf(request.data);
  const operationId = requireOperationId(input.operationId);
  const projectId = requireString(input.projectId, 'projectId', 200);
  const revisionId = requireString(input.revisionId, 'revisionId', 200);
  const rate = requireInteger(input.supplierRateCentsPerGram, 'supplierRateCentsPerGram', 1, 10_000_000);
  const hash = payloadHash({ operationId, projectId, revisionId, supplierRateCentsPerGram: rate });
  const db = getFirestore();
  const projectRef = db.doc(`projects/${projectId}`);
  const operationRef = db.doc(`project_workflow_operations/${operationId}`);
  return db.runTransaction(async transaction => {
    const prior = await idempotentResult(transaction, operationRef, hash);
    if (prior !== undefined) return prior;
    const snap = await transaction.get(projectRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Project not found.');
    const project = snap.data() || {};
    assertUnlocked(project);
    const components = normalizeComponents(project);
    const index = activeComponentIndex(components, revisionId);
    if (index < 0) throw new HttpsError('not-found', 'Active component revision not found.');
    const component = components[index];
    if (component.internalCastingCost) throw new HttpsError('failed-precondition', 'Internal casting cost is already locked. Use a correction transaction.');
    const weightMg = requireInteger(component.castingWeightMg, 'confirmed casting weight', 1, 100_000_000);
    const amountCents = roundInternalCostCents(weightMg, rate);
    const createdAt = serverIso();
    const recordId = `internal-cost-${operationId}`;
    const record = { recordId, status: 'LOCKED', castingWeightMg: weightMg, supplierRateCentsPerGram: rate, amountCents, enteredAt: createdAt, enteredBy: { uid: actor.uid, name: actor.profile.name || actor.uid } };
    const { pendingInternalCastingCost: _draft, ...componentWithoutDraft } = component;
    components[index] = { ...componentWithoutDraft, internalCostRecordId: recordId, internalCastingCost: record };
    const result = { projectId, revisionId, recordId, amountCents };
    transaction.update(projectRef, { goldComponents: components });
    createRevision(transaction, projectRef, recordId, { operationId, projectCode: project.code || projectId, kind: 'INTERNAL_COST_CONFIRMED', reason: 'Manager confirmed casting weight and supplier rate.', editor: actorSummary(actor), before: {}, after: { componentId: component.componentId, revisionId, ...record }, version: 1, createdAt, result });
    transaction.create(operationRef, { type: 'PHASE5_INTERNAL_COST_CONFIRM', projectId, actorUid: actor.uid, payloadHash: hash, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const correctInternalCastingCost = onCall(CALLABLE_OPTIONS, async request => {
  const actor = await requireManager(request);
  const input = dataOf(request.data);
  const operationId = requireOperationId(input.operationId);
  const projectId = requireString(input.projectId, 'projectId', 200);
  const revisionId = requireString(input.revisionId, 'revisionId', 200);
  const reason = requireString(input.reason, 'reason', 1000);
  const weightMg = requireInteger(input.castingWeightMg, 'castingWeightMg', 1, 100_000_000);
  const rate = requireInteger(input.supplierRateCentsPerGram, 'supplierRateCentsPerGram', 1, 10_000_000);
  const hash = payloadHash({ operationId, projectId, revisionId, reason, castingWeightMg: weightMg, supplierRateCentsPerGram: rate });
  const db = getFirestore();
  const projectRef = db.doc(`projects/${projectId}`);
  const operationRef = db.doc(`project_workflow_operations/${operationId}`);
  return db.runTransaction(async transaction => {
    const prior = await idempotentResult(transaction, operationRef, hash);
    if (prior !== undefined) return prior;
    const snap = await transaction.get(projectRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Project not found.');
    const project = snap.data() || {};
    assertUnlocked(project);
    const components = normalizeComponents(project);
    const index = activeComponentIndex(components, revisionId);
    if (index < 0) throw new HttpsError('not-found', 'Active component revision not found.');
    const component = components[index];
    const original = component.internalCastingCost as Data | undefined;
    if (!original) throw new HttpsError('failed-precondition', 'No locked internal cost exists to correct.');
    const createdAt = serverIso();
    const reversalId = `internal-cost-reversal-${operationId}`;
    const replacementId = `internal-cost-replacement-${operationId}`;
    const replacementAmount = roundInternalCostCents(weightMg, rate);
    const replacement = { recordId: replacementId, status: 'LOCKED', castingWeightMg: weightMg, supplierRateCentsPerGram: rate, amountCents: replacementAmount, enteredAt: createdAt, enteredBy: { uid: actor.uid, name: actor.profile.name || actor.uid }, correctionOfRecordId: original.recordId };
    const { pendingInternalCastingCost: _draft, ...componentWithoutDraft } = component;
    components[index] = { ...componentWithoutDraft, castingWeightMg: weightMg, weightG: weightMg / 1000, internalCostRecordId: replacementId, internalCastingCost: replacement };
    const result = { projectId, revisionId, reversalId, replacementId, amountCents: replacementAmount };
    transaction.update(projectRef, { goldComponents: components });
    createRevision(transaction, projectRef, reversalId, { operationId, projectCode: project.code || projectId, kind: 'INTERNAL_COST_REVERSAL', reason, editor: actorSummary(actor), before: original, after: { reversedRecordId: original.recordId, amountCents: -Number(original.amountCents || 0) }, version: 1, createdAt, result });
    createRevision(transaction, projectRef, replacementId, { operationId, projectCode: project.code || projectId, kind: 'INTERNAL_COST_REPLACEMENT', reason, editor: actorSummary(actor), before: original, after: { componentId: component.componentId, revisionId, ...replacement }, version: 1, createdAt, result });
    transaction.create(operationRef, { type: 'PHASE5_INTERNAL_COST_CORRECTION', projectId, actorUid: actor.uid, payloadHash: hash, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const recordFinalComponentWeights = onCall(CALLABLE_OPTIONS, async request => {
  const actor = await requireActor(request);
  const input = dataOf(request.data);
  const operationId = requireOperationId(input.operationId);
  const projectId = requireString(input.projectId, 'projectId', 200);
  if (!Array.isArray(input.weights) || input.weights.length === 0 || input.weights.length > 50) throw new HttpsError('invalid-argument', 'Final component weights are required.');
  const weights = input.weights.map((value, index) => { const row = dataOf(value); return { revisionId: requireString(row.revisionId, `weights[${index}].revisionId`, 200), weightMg: requireInteger(row.weightMg, `weights[${index}].weightMg`, 1, 100_000_000) }; });
  const hash = payloadHash({ operationId, projectId, weights });
  const db = getFirestore();
  const projectRef = db.doc(`projects/${projectId}`);
  const operationRef = db.doc(`project_workflow_operations/${operationId}`);
  return db.runTransaction(async transaction => {
    const prior = await idempotentResult(transaction, operationRef, hash);
    if (prior !== undefined) return prior;
    const snap = await transaction.get(projectRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Project not found.');
    const project = snap.data() || {};
    assertUnlocked(project);
    if (!canManageCasting(project, actor)) {
      throw new HttpsError('permission-denied', 'Only Managers and assigned Designers may record final component weights.');
    }
    const components = normalizeComponents(project);
    const after: Data[] = [];
    for (const row of weights) {
      const index = activeComponentIndex(components, row.revisionId);
      if (index < 0) throw new HttpsError('not-found', `Component ${row.revisionId} was not found.`);
      const castingWeight = requireInteger(components[index].castingWeightMg, 'confirmed casting weight', 1, 100_000_000);
      if (row.weightMg > castingWeight) throw new HttpsError('invalid-argument', 'Final weight cannot exceed confirmed casting weight.');
      components[index] = { ...components[index], finalWeightMg: row.weightMg };
      after.push({ revisionId: row.revisionId, finalWeightMg: row.weightMg, productionVarianceMg: castingWeight - row.weightMg });
    }
    const createdAt = serverIso();
    const result = { projectId, weights: after };
    transaction.update(projectRef, { goldComponents: components });
    createRevision(transaction, projectRef, operationId, { operationId, projectCode: project.code || projectId, kind: 'FINAL_WEIGHT_RECORDED', reason: 'Final finished component weights recorded.', editor: actorSummary(actor), before: {}, after: { weights: after }, version: 1, createdAt, result });
    transaction.create(operationRef, { type: 'PHASE5_FINAL_WEIGHTS', projectId, actorUid: actor.uid, payloadHash: hash, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

function torontoDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function historicalGoldPriceCents(actualDate: string, emulatorPrice: unknown, emulatorFailure: unknown): Promise<{ priceCentsPerGram: number; source: string }> {
  if (process.env.FUNCTIONS_EMULATOR === 'true' && emulatorFailure === true) {
    throw new HttpsError('unavailable', 'Historical gold pricing is unavailable. Pickup was not recorded.');
  }
  if (process.env.FUNCTIONS_EMULATOR === 'true' && Number.isSafeInteger(emulatorPrice) && Number(emulatorPrice) > 0) {
    return { priceCentsPerGram: Number(emulatorPrice), source: 'PHASE5_EMULATOR_FIXTURE' };
  }
  const compactDate = actualDate.replace(/-/g, '');
  const response = await fetch(`https://www.goldapi.io/api/XAU/CAD/${compactDate}`, { headers: { 'x-access-token': GOLD_API_KEY, 'Content-Type': 'application/json' } });
  if (!response.ok) throw new HttpsError('unavailable', 'Historical gold pricing is unavailable. Pickup was not recorded.');
  const body = await response.json() as { price?: unknown };
  if (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price <= 0) throw new HttpsError('unavailable', 'Historical gold pricing returned no valid CAD rate. Pickup was not recorded.');
  return { priceCentsPerGram: Math.round((body.price / GRAMS_PER_TROY_OUNCE) * 100), source: 'GoldAPI.io XAU/CAD historical daily rate' };
}

export const confirmProjectPickupPhase5 = onCall(CALLABLE_OPTIONS, async request => {
  const actor = await requireManager(request);
  const input = dataOf(request.data);
  const operationId = requireOperationId(input.operationId);
  const projectId = requireString(input.projectId, 'projectId', 200);
  const actualPickupDate = requireString(input.actualPickupDate, 'actualPickupDate', 10);
  const parsedPickupDate = new Date(`${actualPickupDate}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(actualPickupDate) || Number.isNaN(parsedPickupDate.getTime()) || parsedPickupDate.toISOString().slice(0, 10) !== actualPickupDate) throw new HttpsError('invalid-argument', 'actualPickupDate must be a valid YYYY-MM-DD date.');
  const today = torontoDate();
  if (actualPickupDate > today) throw new HttpsError('invalid-argument', 'Pickup date cannot be in the future.');
  const reason = optionalReason(input.lateEntryReason, actualPickupDate < today);
  const normalizedInput = { operationId, projectId, actualPickupDate, lateEntryReason: reason };
  const hash = payloadHash(normalizedInput);
  const db = getFirestore();
  const operationRef = db.doc(`project_workflow_operations/${operationId}`);
  const priorOperation = await operationRef.get();
  if (priorOperation.exists) {
    if (priorOperation.data()?.payloadHash !== hash) throw new HttpsError('already-exists', 'This operationId was already used for different pickup data.');
    return priorOperation.data()?.result;
  }
  const rate = await historicalGoldPriceCents(actualPickupDate, input.testPriceCentsPerGram, input.testSimulatePriceFailure);
  const projectRef = db.doc(`projects/${projectId}`);
  return db.runTransaction(async transaction => {
    const prior = await idempotentResult(transaction, operationRef, hash);
    if (prior !== undefined) return prior;
    const snap = await transaction.get(projectRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Project not found.');
    const project = snap.data() || {};
    assertUnlocked(project);
    if (project.status !== 'Review') throw new HttpsError('failed-precondition', 'Only a project in Review can be marked Picked Up.');
    const components = normalizeComponents(project).filter(component => component.state === 'ACTIVE');
    if (components.length === 0) throw new HttpsError('failed-precondition', 'At least one active metal component is required.');
    const pricedComponents = components.map(component => {
      const finalWeightMg = requireInteger(component.finalWeightMg, `${component.label || 'Component'} final weight`, 1, 100_000_000);
      const metal = String(component.type || '');
      const purity = String(component.purity || '');
      const base = { componentId: component.componentId, revisionId: component.revisionId, label: component.label, metal, purity, finalWeightMg, purityRatioPpm: Number(component.purityRatioPpm || 0), priceCentsPerGram: rate.priceCentsPerGram };
      if (metal === 'Platinum') return { ...base, purityRatioPpm: 0, pricingStatus: 'PLATINUM_PRICING_PENDING' };
      const ratioPpm = requireInteger(component.purityRatioPpm || PURITY_PPM[purity], `${component.label || 'Component'} purity ratio`, 1, 1_000_000);
      return { ...base, purityRatioPpm: ratioPpm, amountCents: roundClientChargeCents(finalWeightMg, ratioPpm, rate.priceCentsPerGram), pricingStatus: 'PRICED' };
    });
    const totalClientGoldChargeCents = pricedComponents.reduce((sum, component) => sum + ('amountCents' in component ? Number(component.amountCents) : 0), 0);
    const capturedAt = serverIso();
    const snapshot = { operationId, actualPickupDate, ...(reason ? { lateEntryReason: reason } : {}), source: rate.source, currency: 'CAD', priceCentsPerGram: rate.priceCentsPerGram, capturedAt, capturedBy: { uid: actor.uid, name: actor.profile.name || actor.uid }, components: pricedComponents, totalClientGoldChargeCents, formulaVersion: 'NO_MARKUP_V1', locked: true };
    const progress = [...(Array.isArray(project.progress) ? project.progress : []), { id: `pickup-${operationId}`, projectId, createdById: actor.uid, createdAt: capturedAt, stageName: 'Picked Up', percentComplete: 100, weightG: 0 }];
    const result = { projectId, actualPickupDate, totalClientGoldChargeCents, priceCentsPerGram: rate.priceCentsPerGram };
    transaction.update(projectRef, { status: 'Closed', date_picked_up: `${actualPickupDate}T12:00:00.000Z`, pickupPricingSnapshot: snapshot, progress, last_status_change_at: capturedAt, last_status_change_by: actor.uid });
    createRevision(transaction, projectRef, operationId, { operationId, projectCode: project.code || projectId, kind: 'PICKUP_PRICING_LOCKED', reason: reason || 'Pickup recorded on actual date.', editor: actorSummary(actor), before: {}, after: snapshot, version: 1, createdAt: capturedAt, result });
    transaction.create(operationRef, { type: 'PHASE5_PICKUP_PRICING', projectId, actorUid: actor.uid, payloadHash: hash, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});

export const phase5Math = { roundInternalCostCents, roundClientChargeCents };
