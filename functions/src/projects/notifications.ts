import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireActor } from '../inventory/auth';
import { requireOperationId, requireString } from '../inventory/validation';

const CALLABLE_OPTIONS = { region: 'northamerica-northeast1', cors: true } as const;
const ALLOWED_TYPES = new Set(['ASSIGNMENT', 'HANDOFF', 'MENTION', 'STATUS_UPDATE']);

function dataOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'A notification payload is required.');
  }
  return value as Record<string, unknown>;
}

function identityIds(uid: string, profile: Record<string, unknown>): Set<string> {
  const legacy = Array.isArray(profile.legacyProfileIds)
    ? profile.legacyProfileIds.filter((value): value is string => typeof value === 'string')
    : [];
  const authUid = typeof profile.authUid === 'string' ? profile.authUid : uid;
  return new Set([uid, authUid, ...legacy]);
}

function projectAssignmentIds(project: Record<string, unknown>, activeOnly: boolean): Set<string> {
  const result = new Set<string>();
  if (Array.isArray(project.activeAssignees)) {
    for (const value of project.activeAssignees) if (typeof value === 'string') result.add(value);
  }
  if (Array.isArray(project.assignments)) {
    for (const value of project.assignments) {
      if (!value || typeof value !== 'object') continue;
      const assignment = value as { userId?: unknown; active?: unknown };
      if ((!activeOnly || assignment.active !== false) && typeof assignment.userId === 'string') result.add(assignment.userId);
    }
  }
  for (const field of ['assignedSetterId', 'assignedJewellerId', 'assignedDesignerId']) {
    if (typeof project[field] === 'string') result.add(project[field] as string);
  }
  return result;
}

function overlaps(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) if (right.has(value)) return true;
  return false;
}

export const createProjectNotification = onCall(CALLABLE_OPTIONS, async request => {
  const actor = await requireActor(request);
  const input = dataOf(request.data);
  const operationId = requireOperationId(input.operationId);
  const projectId = requireString(input.projectId, 'projectId', 200);
  const targetUserId = requireString(input.targetUserId, 'targetUserId', 200);
  const type = requireString(input.type, 'type', 40);
  const title = requireString(input.title, 'title', 120);
  const message = requireString(input.message, 'message', 500);
  if (!ALLOWED_TYPES.has(type)) throw new HttpsError('permission-denied', 'This notification type requires its authoritative workflow.');

  const db = getFirestore();
  const [projectSnap, targetSnap] = await Promise.all([
    db.doc(`projects/${projectId}`).get(),
    db.doc(`users/${targetUserId}`).get(),
  ]);
  if (!projectSnap.exists) throw new HttpsError('not-found', 'Project not found.');
  if (!targetSnap.exists || targetSnap.data()?.active === false) throw new HttpsError('failed-precondition', 'Notification recipient is not active.');

  const project = projectSnap.data() || {};
  const actorIds = identityIds(actor.uid, actor.profile as unknown as Record<string, unknown>);
  const activeAssignmentIds = projectAssignmentIds(project, true);
  const historicalAssignmentIds = projectAssignmentIds(project, false);
  const actorIsManager = actor.profile.role === 'Manager';
  const actorIsCurrentlyAssigned = overlaps(actorIds, activeAssignmentIds);
  const actorWasAssigned = overlaps(actorIds, historicalAssignmentIds);
  if (!actorIsManager && !(type === 'HANDOFF' ? actorWasAssigned : actorIsCurrentlyAssigned)) {
    throw new HttpsError('permission-denied', 'Only a Manager or an assigned project member may send this notification.');
  }

  const targetProfile = targetSnap.data() || {};
  const canonicalTargetUid = typeof targetProfile.authUid === 'string' && targetProfile.authUid
    ? targetProfile.authUid
    : targetUserId;
  const targetIds = identityIds(targetUserId, targetProfile);
  if (type !== 'MENTION' && !overlaps(targetIds, activeAssignmentIds)) {
    throw new HttpsError('permission-denied', 'The recipient must be actively assigned to this project.');
  }

  const notificationId = `project-event_${operationId}_${canonicalTargetUid}`;
  const notificationRef = db.doc(`notifications/${notificationId}`);
  await db.runTransaction(async transaction => {
    const existing = await transaction.get(notificationRef);
    if (existing.exists) return;
    transaction.create(notificationRef, {
      id: notificationId,
      userId: canonicalTargetUid,
      eventType: type,
      type,
      projectId,
      relatedProjectId: projectId,
      title,
      message,
      createdById: actor.uid,
      createdAt: new Date().toISOString(),
      serverCreatedAt: FieldValue.serverTimestamp(),
      isRead: false,
      read: false,
      readAt: null,
      isArchived: false,
      archivedAt: null,
      link: `/project/${projectId}`,
      metadata: { operationId, source: 'createProjectNotification' },
    });
  });
  return { notificationId, userId: canonicalTargetUid };
});
