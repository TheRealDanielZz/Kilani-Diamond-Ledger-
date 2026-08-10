import { createHash } from 'crypto';
import {
  FieldValue,
  Firestore,
  QueryDocumentSnapshot,
  Timestamp,
  getFirestore,
} from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireManager } from '../inventory/auth';
import { requireOperationId, requireString } from '../inventory/validation';

const CALLABLE_OPTIONS = {
  region: 'northamerica-northeast1',
  cors: true,
  timeoutSeconds: 540,
} as const;

const PROJECT_TRIGGER_OPTIONS = {
  document: 'projects/{projectId}',
  region: 'northamerica-northeast1',
  timeoutSeconds: 120,
} as const;

export const PHASE9_TRACKING_VERSION = 'phase9-setter-tracking-v1';
export const PHASE9_FEATURE_MESSAGE = 'Setter analytics will be available in a future update.';
export const PHASE9_READINESS_SCORE = 62;

export interface Phase9SetterBagContext {
  bagId: string;
  bagNumber: string;
  projectId: string;
  setterId: string;
  issueDate: string | null;
  issueTimingQuality: 'server_confirmed' | 'legacy_recorded' | 'unavailable';
  daysHeld: number | null;
  pendingReturn: boolean;
  confirmedBrokenPieces: number;
}

type TrackingEventType =
  | 'assignment_started'
  | 'assignment_ended'
  | 'project_completed'
  | 'stage_transition';

type TrackingSource = 'phase9_activation_baseline' | 'project_change' | 'user_role_change';

interface Identity {
  uid: string;
  role: string;
}

interface ActiveSetterAssignment {
  setterUid: string;
  legacyRecordedAssignedAt: string | null;
}

interface BaselineRow extends ActiveSetterAssignment {
  projectId: string;
  projectCode: string;
}

interface TrackingEvent {
  id: string;
  schemaVersion: 1;
  eventType: TrackingEventType;
  setterUid: string;
  projectId: string;
  intervalId?: string;
  occurredAt: Timestamp;
  serverRecordedAt: FieldValue;
  source: TrackingSource;
  sourceEventId: string;
  dataQuality: 'phase9_server_observed' | 'phase9_activation_baseline';
  stageName?: string;
}

function dataOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'A Phase 9 request payload is required.');
  }
  return value as Record<string, unknown>;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)])
    );
  }
  return value;
}

export function phase9StableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof value === 'object' && 'toDate' in value) {
    const candidate = (value as { toDate?: unknown }).toDate;
    if (typeof candidate === 'function') {
      const result = candidate.call(value);
      return result instanceof Date && !Number.isNaN(result.getTime()) ? result : null;
    }
  }
  if (typeof value !== 'string' || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function phase9SetterBagContext(
  bagId: string,
  bag: Record<string, unknown>,
  asOf: Date = new Date()
): Phase9SetterBagContext {
  const serverIssueDate = dateValue(bag.serverIssuedAt);
  const legacyIssueDate = dateValue(bag.issuedAt);
  const issueDate = serverIssueDate || legacyIssueDate;
  const returns = Array.isArray(bag.returns) ? bag.returns : [];
  const pendingReturn = bag.status === 'Returned_Pending_Count'
    || returns.some(value => (
      value
      && typeof value === 'object'
      && (value as Record<string, unknown>).status === 'PENDING'
    ));
  const confirmedBrokenPieces = returns.reduce((total, value) => {
    if (!value || typeof value !== 'object') return total;
    const record = value as Record<string, unknown>;
    if (record.status !== 'CONFIRMED') return total;
    const lines = Array.isArray(record.confirmedBreakageLines)
      ? record.confirmedBreakageLines
      : [];
    return total + lines.reduce((lineTotal, line) => {
      if (!line || typeof line !== 'object') return lineTotal;
      const pieces = Number((line as Record<string, unknown>).pieces || 0);
      return lineTotal + (Number.isFinite(pieces) && pieces > 0 ? Math.floor(pieces) : 0);
    }, 0);
  }, 0);
  const elapsedMs = issueDate ? Math.max(0, asOf.getTime() - issueDate.getTime()) : null;
  return {
    bagId,
    bagNumber: typeof bag.bagNumber === 'string' ? bag.bagNumber : '',
    projectId: typeof bag.projectId === 'string' ? bag.projectId : '',
    setterId: typeof bag.issuedToId === 'string' ? bag.issuedToId : '',
    issueDate: issueDate?.toISOString() || null,
    issueTimingQuality: serverIssueDate
      ? 'server_confirmed'
      : legacyIssueDate
        ? 'legacy_recorded'
        : 'unavailable',
    daysHeld: elapsedMs === null ? null : Math.floor(elapsedMs / 86_400_000),
    pendingReturn,
    confirmedBrokenPieces,
  };
}

function stableDocumentId(...parts: string[]): string {
  return phase9StableHash(parts);
}

function normalizedIdentity(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function addIdentity(map: Map<string, Identity>, value: unknown, identity: Identity): void {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return;
  map.set(raw, identity);
  map.set(normalizedIdentity(raw), identity);
}

async function setterIdentityMap(db: Firestore): Promise<Map<string, Identity>> {
  const snapshot = await db.collection('users').get();
  const identities = new Map<string, Identity>();
  snapshot.docs.forEach(document => {
    const profile = document.data();
    const uid = typeof profile.authUid === 'string' && profile.authUid.trim()
      ? profile.authUid.trim()
      : document.id;
    const identity = { uid, role: String(profile.role || '') };
    addIdentity(identities, document.id, identity);
    addIdentity(identities, profile.authUid, identity);
    addIdentity(identities, profile.name, identity);
    addIdentity(identities, profile.email, identity);
    if (typeof profile.email === 'string') addIdentity(identities, profile.email.split('@')[0], identity);
    if (Array.isArray(profile.legacyProfileIds)) {
      profile.legacyProfileIds.forEach(value => addIdentity(identities, value, identity));
    }
  });
  return identities;
}

function resolveSetter(value: unknown, identities: Map<string, Identity>): Identity | undefined {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return undefined;
  const identity = identities.get(raw) || identities.get(normalizedIdentity(raw));
  return identity?.role === 'Setter' ? identity : undefined;
}

function activeSetterAssignments(
  project: Record<string, unknown>,
  identities: Map<string, Identity>
): Map<string, ActiveSetterAssignment> {
  const setters = new Map<string, ActiveSetterAssignment>();
  const assignments = Array.isArray(project.assignments) ? project.assignments : [];

  assignments.forEach(value => {
    if (!value || typeof value !== 'object') return;
    const assignment = value as Record<string, unknown>;
    if (assignment.active === false) return;
    const identity = resolveSetter(assignment.userId, identities);
    if (!identity) return;
    const assignedAt = typeof assignment.assignedAt === 'string' && assignment.assignedAt
      ? assignment.assignedAt
      : null;
    const existing = setters.get(identity.uid);
    setters.set(identity.uid, {
      setterUid: identity.uid,
      legacyRecordedAssignedAt: existing?.legacyRecordedAssignedAt || assignedAt,
    });
  });

  const activeAssignees = Array.isArray(project.activeAssignees) ? project.activeAssignees : [];
  activeAssignees.forEach(value => {
    const identity = resolveSetter(value, identities);
    if (!identity || setters.has(identity.uid)) return;
    setters.set(identity.uid, { setterUid: identity.uid, legacyRecordedAssignedAt: null });
  });

  const legacySetter = resolveSetter(project.assignedSetterId, identities);
  if (legacySetter && !setters.has(legacySetter.uid)) {
    setters.set(legacySetter.uid, {
      setterUid: legacySetter.uid,
      legacyRecordedAssignedAt: null,
    });
  }
  return setters;
}

function completedTransition(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): boolean {
  const wasCompleted = before.status === 'Review'
    || before.status === 'Closed'
    || Boolean(before.date_completed)
    || Boolean(before.date_picked_up);
  const isCompleted = after.status === 'Review'
    || after.status === 'Closed'
    || Boolean(after.date_completed)
    || Boolean(after.date_picked_up);
  return !wasCompleted && isCompleted;
}

function changedStage(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string {
  const previous = typeof before.currentStageName === 'string' ? before.currentStageName.trim() : '';
  const current = typeof after.currentStageName === 'string' ? after.currentStageName.trim() : '';
  return current && current !== previous ? current : '';
}

function timestampForEvent(eventTime: string | undefined): Timestamp {
  if (eventTime) {
    const parsed = new Date(eventTime);
    if (!Number.isNaN(parsed.getTime())) return Timestamp.fromDate(parsed);
  }
  return Timestamp.now();
}

function trackingEvent(
  input: Omit<TrackingEvent, 'schemaVersion' | 'serverRecordedAt'>
): TrackingEvent {
  return {
    ...input,
    schemaVersion: 1,
    serverRecordedAt: FieldValue.serverTimestamp(),
  };
}

async function baselineRows(db: Firestore): Promise<BaselineRow[]> {
  const [projects, identities] = await Promise.all([
    db.collection('projects').orderBy('__name__').get(),
    setterIdentityMap(db),
  ]);
  return projects.docs
    .flatMap(document => {
      const project = document.data();
      const projectCode = typeof project.code === 'string' ? project.code : document.id;
      return [...activeSetterAssignments(project, identities).values()].map(assignment => ({
        projectId: document.id,
        projectCode,
        ...assignment,
      }));
    })
    .sort((left, right) => (
      left.projectId.localeCompare(right.projectId)
      || left.setterUid.localeCompare(right.setterUid)
    ));
}

function baselineHash(rows: BaselineRow[]): string {
  return phase9StableHash(rows.map(row => ({
    projectId: row.projectId,
    setterUid: row.setterUid,
  })));
}

function baselineDryRun(rows: BaselineRow[]) {
  const projects = new Set(rows.map(row => row.projectId));
  const setters = new Set(rows.map(row => row.setterUid));
  return {
    version: PHASE9_TRACKING_VERSION,
    dryRunHash: baselineHash(rows),
    activeBaselineIntervalCount: rows.length,
    projectCount: projects.size,
    setterCount: setters.size,
    historicalAssignmentsRewritten: 0,
    projectWrites: 0,
    inventoryWrites: 0,
    writesPerformed: 0,
  };
}

export const getPhase9SetterTrackingDryRun = onCall(CALLABLE_OPTIONS, async request => {
  await requireManager(request);
  const rows = await baselineRows(getFirestore());
  return {
    ...baselineDryRun(rows),
    generatedAt: Timestamp.now().toDate().toISOString(),
  };
});

export const activatePhase9SetterTracking = onCall(CALLABLE_OPTIONS, async request => {
  const actor = await requireManager(request);
  const input = dataOf(request.data);
  const operationId = requireOperationId(input.operationId);
  const expectedHash = requireString(input.dryRunHash, 'dryRunHash', 100);
  const db = getFirestore();
  const rows = await baselineRows(db);
  const dryRun = baselineDryRun(rows);
  if (dryRun.dryRunHash !== expectedHash) {
    throw new HttpsError(
      'failed-precondition',
      'Phase 9 assignments changed after the dry run. Run the dry run again before activation.'
    );
  }

  const markerRef = db.doc(`system_migrations/${PHASE9_TRACKING_VERSION}`);
  const result = await db.runTransaction(async transaction => {
    const marker = await transaction.get(markerRef);
    if (marker.exists && marker.data()?.state === 'ACTIVE') {
      return marker.data()?.result;
    }

    const activatedAt = Timestamp.now();
    rows.forEach(row => {
      const sourceEventId = `baseline:${PHASE9_TRACKING_VERSION}:${row.projectId}:${row.setterUid}`;
      const eventId = stableDocumentId('assignment_started', sourceEventId);
      const intervalId = stableDocumentId('interval', sourceEventId);
      transaction.create(db.doc(`setter_tracking_events/${eventId}`), trackingEvent({
        id: eventId,
        eventType: 'assignment_started',
        setterUid: row.setterUid,
        projectId: row.projectId,
        intervalId,
        occurredAt: activatedAt,
        source: 'phase9_activation_baseline',
        sourceEventId,
        dataQuality: 'phase9_activation_baseline',
      }));
      transaction.create(db.doc(`setter_assignment_intervals/${intervalId}`), {
        id: intervalId,
        schemaVersion: 1,
        setterUid: row.setterUid,
        projectId: row.projectId,
        startedAt: activatedAt,
        endedAt: null,
        active: true,
        startEventId: eventId,
        endEventId: null,
        completedAt: null,
        completionEventId: null,
        source: 'phase9_activation_baseline',
        dataQuality: 'phase9_activation_baseline',
        reliableElapsedStartsAt: activatedAt,
        historicalStartAvailable: false,
        legacyRecordedAssignedAt: row.legacyRecordedAssignedAt,
        serverCreatedAt: FieldValue.serverTimestamp(),
      });
    });
    const activationResult = {
      version: PHASE9_TRACKING_VERSION,
      state: 'ACTIVE',
      activeBaselineIntervalCount: rows.length,
      projectCount: dryRun.projectCount,
      setterCount: dryRun.setterCount,
      historicalAssignmentsRewritten: 0,
      projectWrites: 0,
      inventoryWrites: 0,
    };
    transaction.create(markerRef, {
      version: PHASE9_TRACKING_VERSION,
      state: 'ACTIVE',
      operationId,
      dryRunHash: dryRun.dryRunHash,
      activatedBy: actor.uid,
      activatedAt,
      serverActivatedAt: FieldValue.serverTimestamp(),
      result: activationResult,
    });
    return activationResult;
  });
  return result;
});

export const getPhase9SetterAnalyticsFeatureState = onCall(CALLABLE_OPTIONS, async request => {
  await requireManager(request);
  const marker = await getFirestore().doc(`system_migrations/${PHASE9_TRACKING_VERSION}`).get();
  return {
    version: PHASE9_TRACKING_VERSION,
    trackingState: marker.exists && marker.data()?.state === 'ACTIVE' ? 'ACTIVE' : 'PREPARED',
    analyticsEnabled: false,
    dashboardEnabled: false,
    csvExportEnabled: false,
    pdfExportEnabled: false,
    trackedRole: 'Setter',
    productivityScoringEnabled: false,
    message: PHASE9_FEATURE_MESSAGE,
    reliableTimingFrom: marker.data()?.activatedAt?.toDate?.()?.toISOString?.() || null,
    measurementReadiness: {
      score: PHASE9_READINESS_SCORE,
      verdict: 'Unreliable',
    },
  };
});

export const trackPhase9SetterProjectChanges = onDocumentWritten(
  PROJECT_TRIGGER_OPTIONS,
  async event => {
    const db = getFirestore();
    const marker = await db.doc(`system_migrations/${PHASE9_TRACKING_VERSION}`).get();
    if (!marker.exists || marker.data()?.state !== 'ACTIVE') return;

    const sourceEventId = String(event.id || '');
    const projectId = String(event.params.projectId || '');
    if (!sourceEventId || !projectId || !event.data) return;

    const before = event.data.before.exists
      ? event.data.before.data() as Record<string, unknown>
      : {};
    const after = event.data.after.exists
      ? event.data.after.data() as Record<string, unknown>
      : {};
    const identities = await setterIdentityMap(db);
    const beforeSetters = activeSetterAssignments(before, identities);
    const afterSetters = activeSetterAssignments(after, identities);
    const added = [...afterSetters.keys()].filter(uid => !beforeSetters.has(uid));
    const removed = [...beforeSetters.keys()].filter(uid => !afterSetters.has(uid));
    const completionOccurred = completedTransition(before, after);
    const completionSetters = completionOccurred ? [...afterSetters.keys()] : [];
    const stageName = changedStage(before, after);
    const stageSetters = stageName ? [...afterSetters.keys()] : [];

    if (!added.length && !removed.length && !completionSetters.length && !stageSetters.length) return;

    const occurredAt = timestampForEvent(event.time);
    const processingRef = db.doc(`phase9_tracking_operations/${stableDocumentId(sourceEventId)}`);
    const queryUids = new Set([
      ...removed,
      ...completionSetters.filter(uid => !added.includes(uid)),
    ]);

    await db.runTransaction(async transaction => {
      const processing = await transaction.get(processingRef);
      if (processing.exists) return;

      const openIntervals = new Map<string, QueryDocumentSnapshot[]>();
      for (const setterUid of queryUids) {
        const query = db.collection('setter_assignment_intervals')
          .where('setterUid', '==', setterUid)
          .where('projectId', '==', projectId)
          .where('active', '==', true);
        const snapshot = await transaction.get(query);
        openIntervals.set(setterUid, snapshot.docs);
      }

      const completionEventIds = new Map<string, string>();
      completionSetters.forEach(setterUid => {
        const eventId = stableDocumentId('project_completed', sourceEventId, projectId, setterUid);
        completionEventIds.set(setterUid, eventId);
        transaction.create(db.doc(`setter_tracking_events/${eventId}`), trackingEvent({
          id: eventId,
          eventType: 'project_completed',
          setterUid,
          projectId,
          occurredAt,
          source: 'project_change',
          sourceEventId,
          dataQuality: 'phase9_server_observed',
        }));
      });

      added.forEach(setterUid => {
        const intervalSourceId = `${sourceEventId}:${projectId}:${setterUid}`;
        const eventId = stableDocumentId('assignment_started', intervalSourceId);
        const intervalId = stableDocumentId('interval', intervalSourceId);
        const completionEventId = completionEventIds.get(setterUid) || null;
        transaction.create(db.doc(`setter_tracking_events/${eventId}`), trackingEvent({
          id: eventId,
          eventType: 'assignment_started',
          setterUid,
          projectId,
          intervalId,
          occurredAt,
          source: 'project_change',
          sourceEventId,
          dataQuality: 'phase9_server_observed',
        }));
        transaction.create(db.doc(`setter_assignment_intervals/${intervalId}`), {
          id: intervalId,
          schemaVersion: 1,
          setterUid,
          projectId,
          startedAt: occurredAt,
          endedAt: null,
          active: true,
          startEventId: eventId,
          endEventId: null,
          completedAt: completionEventId ? occurredAt : null,
          completionEventId,
          source: 'project_change',
          dataQuality: 'phase9_server_observed',
          reliableElapsedStartsAt: occurredAt,
          historicalStartAvailable: true,
          legacyRecordedAssignedAt: afterSetters.get(setterUid)?.legacyRecordedAssignedAt || null,
          serverCreatedAt: FieldValue.serverTimestamp(),
        });
      });

      removed.forEach(setterUid => {
        const eventId = stableDocumentId('assignment_ended', sourceEventId, projectId, setterUid);
        transaction.create(db.doc(`setter_tracking_events/${eventId}`), trackingEvent({
          id: eventId,
          eventType: 'assignment_ended',
          setterUid,
          projectId,
          occurredAt,
          source: 'project_change',
          sourceEventId,
          dataQuality: 'phase9_server_observed',
        }));
        (openIntervals.get(setterUid) || []).forEach(interval => {
          transaction.update(interval.ref, {
            active: false,
            endedAt: occurredAt,
            endEventId: eventId,
            serverUpdatedAt: FieldValue.serverTimestamp(),
          });
        });
      });

      completionSetters
        .filter(setterUid => !added.includes(setterUid))
        .forEach(setterUid => {
          const completionEventId = completionEventIds.get(setterUid)!;
          (openIntervals.get(setterUid) || []).forEach(interval => {
            transaction.update(interval.ref, {
              completedAt: occurredAt,
              completionEventId,
              serverUpdatedAt: FieldValue.serverTimestamp(),
            });
          });
        });

      stageSetters.forEach(setterUid => {
        const eventId = stableDocumentId('stage_transition', sourceEventId, projectId, setterUid);
        transaction.create(db.doc(`setter_tracking_events/${eventId}`), trackingEvent({
          id: eventId,
          eventType: 'stage_transition',
          setterUid,
          projectId,
          occurredAt,
          source: 'project_change',
          sourceEventId,
          dataQuality: 'phase9_server_observed',
          stageName,
        }));
      });

      transaction.create(processingRef, {
        id: processingRef.id,
        version: PHASE9_TRACKING_VERSION,
        sourceEventId,
        projectId,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  }
);

export const trackPhase9SetterRoleChanges = onDocumentWritten(
  {
    document: 'users/{userId}',
    region: 'northamerica-northeast1',
    timeoutSeconds: 120,
  },
  async event => {
    const db = getFirestore();
    const marker = await db.doc(`system_migrations/${PHASE9_TRACKING_VERSION}`).get();
    if (!marker.exists || marker.data()?.state !== 'ACTIVE' || !event.data) return;

    const before = event.data.before.exists
      ? event.data.before.data() as Record<string, unknown>
      : {};
    const after = event.data.after.exists
      ? event.data.after.data() as Record<string, unknown>
      : {};
    const wasSetter = before.role === 'Setter';
    const isSetter = after.role === 'Setter';
    if (wasSetter === isSetter) return;

    const sourceEventId = String(event.id || '');
    const profileId = String(event.params.userId || '');
    const setterUid = String(
      (isSetter ? after.authUid : before.authUid)
      || profileId
    );
    if (!sourceEventId || !setterUid) return;

    const occurredAt = timestampForEvent(event.time);
    const processingRef = db.doc(
      `phase9_tracking_operations/${stableDocumentId('user_role_change', sourceEventId)}`
    );

    if (wasSetter && !isSetter) {
      await db.runTransaction(async transaction => {
        const [processing, intervals] = await Promise.all([
          transaction.get(processingRef),
          transaction.get(
            db.collection('setter_assignment_intervals')
              .where('setterUid', '==', setterUid)
              .where('active', '==', true)
          ),
        ]);
        if (processing.exists) return;

        intervals.docs.forEach(interval => {
          const projectId = String(interval.data().projectId || '');
          if (!projectId) return;
          const eventId = stableDocumentId(
            'assignment_ended',
            sourceEventId,
            projectId,
            setterUid
          );
          transaction.create(db.doc(`setter_tracking_events/${eventId}`), trackingEvent({
            id: eventId,
            eventType: 'assignment_ended',
            setterUid,
            projectId,
            occurredAt,
            source: 'user_role_change',
            sourceEventId,
            dataQuality: 'phase9_server_observed',
          }));
          transaction.update(interval.ref, {
            active: false,
            endedAt: occurredAt,
            endEventId: eventId,
            endReason: 'setter_role_removed',
            serverUpdatedAt: FieldValue.serverTimestamp(),
          });
        });
        transaction.create(processingRef, {
          id: processingRef.id,
          version: PHASE9_TRACKING_VERSION,
          sourceEventId,
          setterUid,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      return;
    }

    const [projects, identities] = await Promise.all([
      db.collection('projects').orderBy('__name__').get(),
      setterIdentityMap(db),
    ]);
    const assignedProjects = projects.docs.filter(project =>
      activeSetterAssignments(project.data(), identities).has(setterUid)
    );
    await db.runTransaction(async transaction => {
      const processing = await transaction.get(processingRef);
      if (processing.exists) return;

      assignedProjects.forEach(project => {
        const intervalSourceId = `${sourceEventId}:${project.id}:${setterUid}`;
        const eventId = stableDocumentId('assignment_started', intervalSourceId);
        const intervalId = stableDocumentId('interval', intervalSourceId);
        const assignment = activeSetterAssignments(project.data(), identities).get(setterUid);
        transaction.create(db.doc(`setter_tracking_events/${eventId}`), trackingEvent({
          id: eventId,
          eventType: 'assignment_started',
          setterUid,
          projectId: project.id,
          intervalId,
          occurredAt,
          source: 'user_role_change',
          sourceEventId,
          dataQuality: 'phase9_server_observed',
        }));
        transaction.create(db.doc(`setter_assignment_intervals/${intervalId}`), {
          id: intervalId,
          schemaVersion: 1,
          setterUid,
          projectId: project.id,
          startedAt: occurredAt,
          endedAt: null,
          active: true,
          startEventId: eventId,
          endEventId: null,
          completedAt: null,
          completionEventId: null,
          source: 'user_role_change',
          dataQuality: 'phase9_server_observed',
          reliableElapsedStartsAt: occurredAt,
          historicalStartAvailable: true,
          legacyRecordedAssignedAt: assignment?.legacyRecordedAssignedAt || null,
          startReason: 'setter_role_assigned',
          serverCreatedAt: FieldValue.serverTimestamp(),
        });
      });
      transaction.create(processingRef, {
        id: processingRef.id,
        version: PHASE9_TRACKING_VERSION,
        sourceEventId,
        setterUid,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  }
);
