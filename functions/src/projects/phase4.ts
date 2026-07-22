import { FieldValue, Firestore, Timestamp, Transaction, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { isAssignedToProject, requireActor } from '../inventory/auth';
import { payloadHash, requireOperationId, requireString } from '../inventory/validation';

const CALLABLE_OPTIONS = { region: 'northamerica-northeast1', cors: true } as const;
const METAL_TYPES = new Set(['Yellow', 'White', 'Rose', 'Platinum']);
const GOLD_PURITIES = new Set(['10k', '14k', '18k', '21k']);

type RevisionKind = 'INSTRUCTIONS' | 'METAL';

interface RevisionInput {
  operationId: string;
  projectId: string;
  kind: RevisionKind;
  reason: string;
  expectedVersion: number;
  expectedInstructions?: string;
  instructions?: string;
  expectedMetal?: string;
  expectedPurity?: string;
  metal?: string;
  purity?: string;
}

function serverIso(): string {
  return Timestamp.now().toDate().toISOString();
}

function dataOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'A request payload is required.');
  }
  return value as Record<string, unknown>;
}

function requireVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new HttpsError('invalid-argument', 'expectedVersion must be a non-negative integer.');
  }
  return Number(value);
}

function optionalString(value: unknown, maxLength: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new HttpsError('invalid-argument', `Value must be at most ${maxLength} characters.`);
  }
  return value;
}

export function parseRevisionInput(value: unknown): RevisionInput {
  const data = dataOf(value);
  const kind = requireString(data.kind, 'kind', 30) as RevisionKind;
  if (kind !== 'INSTRUCTIONS' && kind !== 'METAL') {
    throw new HttpsError('invalid-argument', 'kind must be INSTRUCTIONS or METAL.');
  }
  const common = {
    operationId: requireOperationId(data.operationId),
    projectId: requireString(data.projectId, 'projectId', 200),
    kind,
    reason: requireString(data.reason, 'reason', 1000),
    expectedVersion: requireVersion(data.expectedVersion),
  };
  if (kind === 'INSTRUCTIONS') {
    return {
      ...common,
      expectedInstructions: optionalString(data.expectedInstructions, 5000),
      instructions: requireString(data.instructions, 'instructions', 5000),
    };
  }
  const metal = requireString(data.metal, 'metal', 30);
  const purity = requireString(data.purity, 'purity', 30);
  if (!METAL_TYPES.has(metal)) throw new HttpsError('invalid-argument', 'Unsupported metal type.');
  if (metal === 'Platinum' ? purity !== '950' : !GOLD_PURITIES.has(purity)) {
    throw new HttpsError('invalid-argument', 'Purity is not valid for the selected metal.');
  }
  return {
    ...common,
    expectedMetal: optionalString(data.expectedMetal, 30),
    expectedPurity: optionalString(data.expectedPurity, 30),
    metal,
    purity,
  };
}

export function canReviseProject(project: Record<string, unknown>, role: unknown, assigned: boolean): boolean {
  return role === 'Manager' || (role === 'Designer' && assigned);
}

export function replacePrimaryMetal(
  project: Record<string, unknown>,
  metal: string,
  purity: string
): Array<Record<string, unknown>> {
  const existing = Array.isArray(project.goldComponents)
    ? project.goldComponents.filter((component) => component && typeof component === 'object') as Array<Record<string, unknown>>
    : [];
  if (existing.length === 0) {
    return [{ id: 'legacy-component', label: 'Main Piece', type: metal, purity }];
  }
  return existing.map((component, index) => index === 0 ? { ...component, type: metal, purity } : { ...component });
}

async function recipientUids(db: Firestore, project: Record<string, unknown>, actorUid: string, actorLegacyIds: string[]): Promise<string[]> {
  const assignedIds = new Set<string>();
  if (Array.isArray(project.activeAssignees)) {
    project.activeAssignees.forEach((id) => { if (typeof id === 'string') assignedIds.add(id); });
  }
  if (Array.isArray(project.assignments)) {
    project.assignments.forEach((entry) => {
      if (entry && typeof entry === 'object') {
        const assignment = entry as { userId?: unknown; active?: unknown };
        if (assignment.active !== false && typeof assignment.userId === 'string') assignedIds.add(assignment.userId);
      }
    });
  }
  if (assignedIds.size === 0) return [];

  const actorIds = new Set([actorUid, ...actorLegacyIds]);
  const users = await db.collection('users').get();
  const recipients = new Set<string>();
  users.docs.forEach((doc) => {
    const profile = doc.data();
    if (profile.active === false) return;
    const identities = new Set<string>([
      doc.id,
      ...(typeof profile.authUid === 'string' ? [profile.authUid] : []),
      ...(Array.isArray(profile.legacyProfileIds) ? profile.legacyProfileIds.filter((id): id is string => typeof id === 'string') : []),
    ]);
    if ([...assignedIds].some((id) => identities.has(id))) {
      const canonicalUid = typeof profile.authUid === 'string' ? profile.authUid : doc.id;
      if (!actorIds.has(canonicalUid) && ![...actorIds].some((id) => identities.has(id))) recipients.add(canonicalUid);
    }
  });
  return [...recipients].sort();
}

function writeNotification(
  tx: Transaction,
  db: Firestore,
  id: string,
  recipientUid: string,
  actorUid: string,
  projectId: string,
  title: string,
  message: string,
  revisionId: string
): void {
  tx.create(db.doc(`notifications/${id}`), {
    id,
    userId: recipientUid,
    eventType: 'PROJECT_REVISION',
    projectId,
    title,
    message,
    createdById: actorUid,
    createdAt: serverIso(),
    serverCreatedAt: FieldValue.serverTimestamp(),
    isRead: false,
    read: false,
    readAt: null,
    isArchived: false,
    archivedAt: null,
    type: 'PROJECT_REVISION',
    link: `/project/${projectId}`,
    relatedProjectId: projectId,
    metadata: { revisionId },
  });
}

export const reviseProjectDetails = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = await requireActor(request);
  const input = parseRevisionInput(request.data);
  const db = getFirestore();
  const projectRef = db.doc(`projects/${input.projectId}`);
  const revisionRef = projectRef.collection('revisions').doc(input.operationId);
  const initialProject = await projectRef.get();
  if (!initialProject.exists) throw new HttpsError('not-found', 'Project was not found.');
  const recipients = await recipientUids(db, initialProject.data() || {}, actor.uid, actor.profile.legacyProfileIds || []);
  const hash = payloadHash(input);

  return db.runTransaction(async (tx) => {
    const existingRevision = await tx.get(revisionRef);
    if (existingRevision.exists) {
      const existing = existingRevision.data() || {};
      if (existing.payloadHash !== hash) {
        throw new HttpsError('already-exists', 'This operationId was already used for different revision data.');
      }
      return existing.result || { projectId: input.projectId, revisionId: input.operationId };
    }

    const projectSnap = await tx.get(projectRef);
    if (!projectSnap.exists) throw new HttpsError('not-found', 'Project was not found.');
    const project = projectSnap.data() || {};
    if (!canReviseProject(project, actor.profile.role, isAssignedToProject(project, actor))) {
      throw new HttpsError('permission-denied', 'Only Managers and assigned Designers may revise this project.');
    }
    if (project.status === 'Closed' || project.date_picked_up) {
      throw new HttpsError('failed-precondition', 'Picked Up projects are permanently read-only.');
    }

    const editor = { uid: actor.uid, name: actor.profile.name || actor.profile.email || actor.uid, role: actor.profile.role || '' };
    const createdAt = serverIso();
    let before: Record<string, unknown>;
    let after: Record<string, unknown>;
    let versionField: 'instructionRevisionVersion' | 'metalRevisionVersion';
    let update: Record<string, unknown>;
    let message: string;

    if (input.kind === 'INSTRUCTIONS') {
      versionField = 'instructionRevisionVersion';
      const current = typeof project.workDetails === 'string' ? project.workDetails : '';
      const version = Number.isSafeInteger(project[versionField]) ? Number(project[versionField]) : 0;
      if (version !== input.expectedVersion || current !== input.expectedInstructions) {
        throw new HttpsError('aborted', 'Instructions changed after this screen loaded. Refresh and review the newer revision.');
      }
      if (current === input.instructions) throw new HttpsError('invalid-argument', 'Replacement instructions must be different.');
      before = { instructions: current };
      after = { instructions: input.instructions! };
      update = { workDetails: input.instructions, [versionField]: version + 1, projectRevisionUpdatedAt: FieldValue.serverTimestamp() };
      message = `${project.code || input.projectId}: ${editor.name} updated instructions. Reason: ${input.reason}`;
    } else {
      versionField = 'metalRevisionVersion';
      const currentMetal = typeof project.goldType === 'string'
        ? project.goldType
        : (Array.isArray(project.goldComponents) && project.goldComponents[0]?.type) || '';
      const currentPurity = typeof project.goldPurity === 'string'
        ? project.goldPurity
        : (Array.isArray(project.goldComponents) && project.goldComponents[0]?.purity) || '';
      const version = Number.isSafeInteger(project[versionField]) ? Number(project[versionField]) : 0;
      if (version !== input.expectedVersion || currentMetal !== input.expectedMetal || currentPurity !== input.expectedPurity) {
        throw new HttpsError('aborted', 'Metal information changed after this screen loaded. Refresh and review the newer revision.');
      }
      if (currentMetal === input.metal && currentPurity === input.purity) {
        throw new HttpsError('invalid-argument', 'New metal and purity must be different.');
      }
      before = { metal: currentMetal, purity: currentPurity };
      after = { metal: input.metal!, purity: input.purity! };
      update = {
        goldType: input.metal,
        goldPurity: input.purity,
        goldComponents: replacePrimaryMetal(project, input.metal!, input.purity!),
        [versionField]: version + 1,
        projectRevisionUpdatedAt: FieldValue.serverTimestamp(),
      };
      message = `${project.code || input.projectId}: ${currentMetal} ${currentPurity} changed to ${input.metal} ${input.purity} by ${editor.name}. Reason: ${input.reason}`;
    }

    const result = { projectId: input.projectId, revisionId: input.operationId, kind: input.kind, version: input.expectedVersion + 1 };
    tx.update(projectRef, update);
    tx.create(revisionRef, {
      id: input.operationId,
      operationId: input.operationId,
      payloadHash: hash,
      projectId: input.projectId,
      projectCode: project.code || input.projectId,
      kind: input.kind,
      reason: input.reason,
      editor,
      before,
      after,
      version: input.expectedVersion + 1,
      createdAt,
      serverCreatedAt: FieldValue.serverTimestamp(),
      recipients,
      result,
    });
    recipients.forEach((uid) => {
      writeNotification(
        tx,
        db,
        `project-revision-${input.operationId}-${uid}`,
        uid,
        actor.uid,
        input.projectId,
        input.kind === 'INSTRUCTIONS' ? 'Project Instructions Updated' : 'Project Metal Updated',
        message,
        input.operationId
      );
    });
    return result;
  });
});
