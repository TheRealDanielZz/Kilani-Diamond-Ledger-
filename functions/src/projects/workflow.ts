import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { isAssignedToProject, requireActor } from '../inventory/auth';
import { requireOperationId, requireString } from '../inventory/validation';

const CALLABLE_OPTIONS = { region: 'northamerica-northeast1', cors: true } as const;

function dataOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpsError('invalid-argument', 'A handoff payload is required.');
  return value as Record<string, unknown>;
}

function optionalString(value: unknown, maxLength: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > maxLength) throw new HttpsError('invalid-argument', `Value must be at most ${maxLength} characters.`);
  return value.trim();
}

export const handoffProject = onCall(CALLABLE_OPTIONS, async request => {
  const actor = await requireActor(request);
  if (!['Manager', 'Designer', 'Setter', 'Jeweller'].includes(String(actor.profile.role || ''))) {
    throw new HttpsError('permission-denied', 'Only active team members may hand off production work.');
  }
  const input = dataOf(request.data);
  const operationId = requireOperationId(input.operationId);
  const projectId = requireString(input.projectId, 'projectId', 200);
  const targetUserId = requireString(input.targetUserId, 'targetUserId', 200);
  const note = optionalString(input.note, 1000);
  const weight = typeof input.weightG === 'number' ? input.weightG : Number.NaN;
  if (!Number.isFinite(weight) || weight < 0 || weight > 100000) throw new HttpsError('invalid-argument', 'A valid handoff weight is required.');

  const db = getFirestore();
  const projectRef = db.doc(`projects/${projectId}`);
  const targetRef = db.doc(`users/${targetUserId}`);
  const operationRef = db.doc(`project_workflow_operations/${operationId}`);
  return db.runTransaction(async transaction => {
    const [operationSnap, projectSnap, targetSnap] = await Promise.all([
      transaction.get(operationRef), transaction.get(projectRef), transaction.get(targetRef),
    ]);
    if (operationSnap.exists) return operationSnap.data()?.result;
    if (!projectSnap.exists) throw new HttpsError('not-found', 'Project not found.');
    if (!targetSnap.exists || targetSnap.data()?.active === false) throw new HttpsError('failed-precondition', 'Handoff recipient is not active.');
    const project = projectSnap.data() || {};
    if (project.status === 'Closed' || project.date_picked_up) throw new HttpsError('failed-precondition', 'Picked Up projects are locked.');
    if (!isAssignedToProject(project, actor)) throw new HttpsError('permission-denied', 'You may hand off only your assigned project.');

    const target = targetSnap.data() || {};
    if (!['Designer', 'Setter', 'Jeweller'].includes(String(target.role || ''))) {
      throw new HttpsError('permission-denied', 'Projects may be handed off only to active Designers, Setters, or Jewellers.');
    }
    const canonicalTargetUid = typeof target.authUid === 'string' && target.authUid ? target.authUid : targetUserId;
    if (canonicalTargetUid === actor.uid) throw new HttpsError('invalid-argument', 'Choose a different team member.');
    const actorIds = new Set([actor.uid, ...(actor.profile.legacyProfileIds || [])]);
    const targetIds = new Set([targetUserId, canonicalTargetUid, ...(Array.isArray(target.legacyProfileIds) ? target.legacyProfileIds : [])]);
    const existingAssignments = Array.isArray(project.assignments) ? project.assignments : [];
    let targetFound = false;
    const assignments = existingAssignments.map(value => {
      if (!value || typeof value !== 'object') return value;
      const assignment = value as Record<string, unknown>;
      const userId = typeof assignment.userId === 'string' ? assignment.userId : '';
      if (actorIds.has(userId)) return { ...assignment, active: false, unassignedAt: Timestamp.now().toDate().toISOString() };
      if (targetIds.has(userId)) {
        targetFound = true;
        return { ...assignment, userId: canonicalTargetUid, active: true, assignedAt: assignment.assignedAt || Timestamp.now().toDate().toISOString() };
      }
      return assignment;
    });
    if (!targetFound) assignments.push({ userId: canonicalTargetUid, assignedAt: Timestamp.now().toDate().toISOString(), active: true });
    const activeAssignees = assignments
      .filter(value => value && typeof value === 'object' && (value as Record<string, unknown>).active !== false)
      .map(value => (value as Record<string, unknown>).userId)
      .filter((value): value is string => typeof value === 'string');
    const progressEntry = {
      id: `handoff_${operationId}`,
      projectId,
      createdById: actor.uid,
      createdAt: Timestamp.now().toDate().toISOString(),
      stageName: 'Handoff',
      percentComplete: 0,
      weightG: weight,
      handoffToUserId: canonicalTargetUid,
      note,
    };
    const progress = [...(Array.isArray(project.progress) ? project.progress : []), progressEntry];
    const productionTarget = target.role === 'Setter' || target.role === 'Jeweller';
    const nextProduction = assignments.find(value => {
      if (!value || typeof value !== 'object' || (value as Record<string, unknown>).active === false) return false;
      const userId = (value as Record<string, unknown>).userId;
      return productionTarget && userId === canonicalTargetUid;
    });
    transaction.update(projectRef, {
      assignments,
      activeAssignees,
      progress,
      assignedSetterId: nextProduction ? canonicalTargetUid : FieldValue.delete(),
    });
    const notificationId = `handoff_${operationId}_${canonicalTargetUid}`;
    transaction.create(db.doc(`notifications/${notificationId}`), {
      id: notificationId, userId: canonicalTargetUid, eventType: 'HANDOFF', type: 'HANDOFF',
      projectId, relatedProjectId: projectId, title: 'Project Handoff',
      message: `${actor.profile.name || 'A team member'} handed off ${project.code || projectId} to you.`,
      createdById: actor.uid, createdAt: Timestamp.now().toDate().toISOString(), serverCreatedAt: FieldValue.serverTimestamp(),
      isRead: false, read: false, readAt: null, isArchived: false, archivedAt: null,
      link: `/project/${projectId}`, metadata: { operationId, source: 'handoffProject' },
    });
    const result = { projectId, targetUserId: canonicalTargetUid, notificationId };
    transaction.create(operationRef, { type: 'PROJECT_HANDOFF', projectId, actorUid: actor.uid, targetUserId: canonicalTargetUid, result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
});
