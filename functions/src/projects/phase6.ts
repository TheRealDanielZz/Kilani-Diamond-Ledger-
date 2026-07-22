import { createHash } from 'crypto';
import { FieldValue, Firestore, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireManager } from '../inventory/auth';

const CALLABLE_OPTIONS = { region: 'northamerica-northeast1', cors: true, timeoutSeconds: 540 } as const;
export const PHASE6_SERVICE_MIGRATION_VERSION = 'phase6-service-canonical-v1';

export type CanonicalServiceCode =
  | 'CUSTOM_MAKE'
  | 'ENGAGEMENT'
  | 'REPAIR'
  | 'OTHER'
  | 'MANAGER_REVIEW_REQUIRED';

interface Classification {
  code: CanonicalServiceCode;
  ruleId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  originalServices: unknown[];
  originalServicesHash: string;
}

interface DryRunRow extends Classification {
  projectId: string;
  projectCode: string;
  alreadyMigrated: boolean;
}

const SERVICE_CODES = new Set<CanonicalServiceCode>([
  'CUSTOM_MAKE', 'ENGAGEMENT', 'REPAIR', 'OTHER', 'MANAGER_REVIEW_REQUIRED',
]);

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

export function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function serviceStatus(value: unknown): Classification['status'] {
  if (value && typeof value === 'object') {
    const status = (value as Record<string, unknown>).status;
    if (status === 'IN_PROGRESS' || status === 'COMPLETED') return status;
  }
  return 'PENDING';
}

function serviceName(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const name = (value as Record<string, unknown>).name;
    return typeof name === 'string' ? name.trim() : '';
  }
  return '';
}

function serviceCode(value: unknown): CanonicalServiceCode | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const code = (value as Record<string, unknown>).code;
  return typeof code === 'string' && SERVICE_CODES.has(code as CanonicalServiceCode)
    ? code as CanonicalServiceCode
    : undefined;
}

function sourceWithName(services: unknown[], name: string): unknown {
  return services.find(value => serviceName(value).toLowerCase() === name);
}

export function classifyLegacyProjectServices(project: Record<string, unknown>): Classification {
  const originalServices = Array.isArray(project.services) ? project.services : [];
  const originalServicesHash = stableHash(originalServices);
  const canonicalEntries = originalServices
    .map(value => ({ value, code: serviceCode(value) }))
    .filter((entry): entry is { value: unknown; code: CanonicalServiceCode } => !!entry.code);
  if (originalServices.length === 1 && canonicalEntries.length === 1) {
    return {
      code: canonicalEntries[0].code,
      ruleId: 'ALREADY_CANONICAL',
      status: serviceStatus(canonicalEntries[0].value),
      originalServices,
      originalServicesHash,
    };
  }

  const names = new Set(originalServices.map(serviceName).filter(Boolean).map(value => value.toLowerCase()));
  const repairEvidence = !!project.repair || !!project.repairDetails || !!project.isQuickRepair || names.has('repair');
  if (names.has('resize')) {
    return { code: 'REPAIR', ruleId: 'LEGACY_RESIZE_TO_REPAIR', status: serviceStatus(sourceWithName(originalServices, 'resize')), originalServices, originalServicesHash };
  }
  if (names.has('setting') && repairEvidence) {
    return { code: 'REPAIR', ruleId: 'EXISTING_PIECE_SETTING_TO_REPAIR', status: serviceStatus(sourceWithName(originalServices, 'repair') || sourceWithName(originalServices, 'setting')), originalServices, originalServicesHash };
  }
  if (names.has('setting') && names.has('custom make')) {
    return { code: 'CUSTOM_MAKE', ruleId: 'NEW_MANUFACTURE_SETTING_TO_CUSTOM_MAKE', status: serviceStatus(sourceWithName(originalServices, 'custom make')), originalServices, originalServicesHash };
  }
  if (names.size === 1 && names.has('custom make')) {
    return { code: 'CUSTOM_MAKE', ruleId: 'LEGACY_CUSTOM_MAKE', status: serviceStatus(originalServices[0]), originalServices, originalServicesHash };
  }
  if (names.size === 1 && names.has('repair')) {
    return { code: 'REPAIR', ruleId: 'LEGACY_REPAIR', status: serviceStatus(originalServices[0]), originalServices, originalServicesHash };
  }
  if (names.size === 1 && names.has('engagement')) {
    return { code: 'ENGAGEMENT', ruleId: 'LEGACY_ENGAGEMENT', status: serviceStatus(originalServices[0]), originalServices, originalServicesHash };
  }
  if (names.size === 1 && names.has('other')) {
    return { code: 'OTHER', ruleId: 'LEGACY_OTHER', status: serviceStatus(originalServices[0]), originalServices, originalServicesHash };
  }
  return {
    code: 'MANAGER_REVIEW_REQUIRED',
    ruleId: names.size === 1 && names.has('setting') ? 'AMBIGUOUS_SETTING' : 'UNSUPPORTED_OR_CONFLICTING_LEGACY_VALUE',
    status: serviceStatus(originalServices[0]),
    originalServices,
    originalServicesHash,
  };
}

async function buildDryRun(db: Firestore): Promise<{ rows: DryRunRow[]; dryRunHash: string }> {
  const [snapshot, backupsSnapshot] = await Promise.all([
    db.collection('projects').orderBy('__name__').get(),
    db.collection(`system_migrations/${PHASE6_SERVICE_MIGRATION_VERSION}/backups`).get(),
  ]);
  const backups = new Map(backupsSnapshot.docs.map(document => [document.id, document.data()]));
  const rows = snapshot.docs.map(document => {
    const project = document.data();
    const migration = project.serviceMigration as Record<string, unknown> | undefined;
    const backup = backups.get(document.id);
    const currentClassification = classifyLegacyProjectServices(project);
    const classification: Classification = migration?.version === PHASE6_SERVICE_MIGRATION_VERSION && backup
      ? {
          code: backup.classification as CanonicalServiceCode,
          ruleId: String(backup.ruleId || 'UNKNOWN'),
          status: currentClassification.status,
          originalServices: Array.isArray(backup.originalServices) ? backup.originalServices : [],
          originalServicesHash: String(backup.originalServicesHash || ''),
        }
      : currentClassification;
    return {
      projectId: document.id,
      projectCode: typeof project.code === 'string' ? project.code : document.id,
      ...classification,
      alreadyMigrated: migration?.version === PHASE6_SERVICE_MIGRATION_VERSION,
    };
  });
  const hashInput = rows.map(row => ({
    projectId: row.projectId,
    originalServicesHash: row.originalServicesHash,
    code: row.code,
    ruleId: row.ruleId,
  }));
  return { rows, dryRunHash: stableHash(hashInput) };
}

function summarize(rows: DryRunRow[]) {
  const classificationCounts: Record<CanonicalServiceCode, number> = {
    CUSTOM_MAKE: 0,
    ENGAGEMENT: 0,
    REPAIR: 0,
    OTHER: 0,
    MANAGER_REVIEW_REQUIRED: 0,
  };
  const ruleCounts: Record<string, number> = {};
  rows.forEach(row => {
    classificationCounts[row.code] += 1;
    ruleCounts[row.ruleId] = (ruleCounts[row.ruleId] || 0) + 1;
  });
  return {
    projectCount: rows.length,
    classificationCounts,
    ruleCounts,
    ambiguousCount: classificationCounts.MANAGER_REVIEW_REQUIRED,
    alreadyMigratedCount: rows.filter(row => row.alreadyMigrated).length,
  };
}

function dryRunResult(rows: DryRunRow[], dryRunHash: string) {
  return {
    version: PHASE6_SERVICE_MIGRATION_VERSION,
    generatedAt: Timestamp.now().toDate().toISOString(),
    dryRunHash,
    ...summarize(rows),
    backupRows: rows.map(row => ({
      projectId: row.projectId,
      projectCode: row.projectCode,
      originalServices: row.originalServices,
      originalServicesHash: row.originalServicesHash,
      classification: row.code,
      ruleId: row.ruleId,
      alreadyMigrated: row.alreadyMigrated,
    })),
    writesPerformed: 0,
  };
}

function dataOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function requireExecutionGate(): void {
  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    throw new HttpsError('failed-precondition', 'Production Phase 6 migration execution is disabled pending final dry-run approval.');
  }
}

export const getPhase6ServiceMigrationDryRun = onCall(CALLABLE_OPTIONS, async request => {
  await requireManager(request);
  const result = await buildDryRun(getFirestore());
  return dryRunResult(result.rows, result.dryRunHash);
});

export const applyPhase6ServiceMigration = onCall(CALLABLE_OPTIONS, async request => {
  const actor = await requireManager(request);
  requireExecutionGate();
  const input = dataOf(request.data);
  if (input.confirmation !== 'EXECUTE_PHASE6_SERVICE_MIGRATION') {
    throw new HttpsError('failed-precondition', 'Explicit migration confirmation is required.');
  }
  const suppliedHash = typeof input.dryRunHash === 'string' ? input.dryRunHash : '';
  const requestedBatchSize = Number(input.batchSize || 20);
  if (!Number.isInteger(requestedBatchSize) || requestedBatchSize < 1 || requestedBatchSize > 50) {
    throw new HttpsError('invalid-argument', 'batchSize must be from 1 to 50.');
  }

  const db = getFirestore();
  const dryRun = await buildDryRun(db);
  if (!suppliedHash || suppliedHash !== dryRun.dryRunHash) {
    throw new HttpsError('aborted', 'Production service data changed after the approved dry run. Run and approve a new dry run.');
  }
  const pending = dryRun.rows.filter(row => !row.alreadyMigrated).slice(0, requestedBatchSize);
  let processed = 0;
  let skipped = 0;
  for (const row of pending) {
    const projectRef = db.doc(`projects/${row.projectId}`);
    const backupRef = db.doc(`system_migrations/${PHASE6_SERVICE_MIGRATION_VERSION}/backups/${row.projectId}`);
    const revisionRef = db.doc(`projects/${row.projectId}/revisions/service-migration-${PHASE6_SERVICE_MIGRATION_VERSION}`);
    const result = await db.runTransaction(async tx => {
      const [projectSnap, backupSnap, revisionSnap] = await Promise.all([
        tx.get(projectRef), tx.get(backupRef), tx.get(revisionRef),
      ]);
      if (!projectSnap.exists) return 'skipped';
      const project = projectSnap.data() || {};
      const existingMigration = project.serviceMigration as Record<string, unknown> | undefined;
      if (existingMigration?.version === PHASE6_SERVICE_MIGRATION_VERSION) return 'skipped';
      const current = classifyLegacyProjectServices(project);
      if (current.originalServicesHash !== row.originalServicesHash || current.code !== row.code || current.ruleId !== row.ruleId) {
        throw new HttpsError('aborted', `Project ${row.projectId} changed after the approved dry run.`);
      }
      const now = Timestamp.now().toDate().toISOString();
      if (!backupSnap.exists) {
        tx.create(backupRef, {
          projectId: row.projectId,
          projectCode: row.projectCode,
          version: PHASE6_SERVICE_MIGRATION_VERSION,
          originalServices: current.originalServices,
          originalServicesHash: current.originalServicesHash,
          classification: current.code,
          ruleId: current.ruleId,
          backedUpAt: FieldValue.serverTimestamp(),
          backedUpBy: actor.uid,
        });
      }
      if (!revisionSnap.exists) {
        tx.create(revisionRef, {
          id: revisionRef.id,
          operationId: revisionRef.id,
          projectId: row.projectId,
          projectCode: row.projectCode,
          kind: 'SERVICE_MIGRATION',
          reason: current.ruleId,
          editor: { uid: actor.uid, name: actor.profile.name || actor.profile.email || actor.uid, role: 'Manager' },
          before: { services: current.originalServices },
          after: { services: [{ code: current.code, status: current.status }], classification: current.code },
          version: 1,
          migrationVersion: PHASE6_SERVICE_MIGRATION_VERSION,
          ruleId: current.ruleId,
          createdAt: now,
          serverCreatedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.update(projectRef, {
        services: [{ code: current.code, status: current.status }],
        serviceMigration: {
          version: PHASE6_SERVICE_MIGRATION_VERSION,
          classification: current.code,
          ruleId: current.ruleId,
          originalServicesHash: current.originalServicesHash,
          migratedAt: now,
          migratedBy: actor.uid,
          status: current.code === 'MANAGER_REVIEW_REQUIRED' ? 'MANAGER_REVIEW_REQUIRED' : 'MIGRATED',
        },
      });
      return 'processed';
    });
    if (result === 'processed') processed += 1;
    else skipped += 1;
  }
  const remaining = Math.max(0, dryRun.rows.filter(row => !row.alreadyMigrated).length - processed - skipped);
  await db.doc(`system_migrations/${PHASE6_SERVICE_MIGRATION_VERSION}`).set({
    version: PHASE6_SERVICE_MIGRATION_VERSION,
    dryRunHash: dryRun.dryRunHash,
    lastBatchAt: FieldValue.serverTimestamp(),
    lastBatchBy: actor.uid,
    state: remaining === 0 ? 'COMPLETED' : 'IN_PROGRESS',
  }, { merge: true });
  return { version: PHASE6_SERVICE_MIGRATION_VERSION, processed, skipped, remaining, complete: remaining === 0 };
});

export const rollbackPhase6ServiceMigration = onCall(CALLABLE_OPTIONS, async request => {
  const actor = await requireManager(request);
  requireExecutionGate();
  const input = dataOf(request.data);
  if (input.confirmation !== 'ROLLBACK_PHASE6_SERVICE_MIGRATION') {
    throw new HttpsError('failed-precondition', 'Explicit rollback confirmation is required.');
  }
  const requestedBatchSize = Number(input.batchSize || 20);
  if (!Number.isInteger(requestedBatchSize) || requestedBatchSize < 1 || requestedBatchSize > 50) {
    throw new HttpsError('invalid-argument', 'batchSize must be from 1 to 50.');
  }
  const db = getFirestore();
  const backups = await db.collection(`system_migrations/${PHASE6_SERVICE_MIGRATION_VERSION}/backups`)
    .orderBy('__name__').limit(500).get();
  let restored = 0;
  let skipped = 0;
  for (const backupDoc of backups.docs) {
    if (restored >= requestedBatchSize) break;
    const projectId = backupDoc.id;
    const projectRef = db.doc(`projects/${projectId}`);
    const rollbackRevisionRef = db.doc(`projects/${projectId}/revisions/service-migration-rollback-${PHASE6_SERVICE_MIGRATION_VERSION}`);
    const result = await db.runTransaction(async tx => {
      const [projectSnap, revisionSnap] = await Promise.all([tx.get(projectRef), tx.get(rollbackRevisionRef)]);
      if (!projectSnap.exists) return 'skipped';
      const project = projectSnap.data() || {};
      const migration = project.serviceMigration as Record<string, unknown> | undefined;
      if (migration?.version !== PHASE6_SERVICE_MIGRATION_VERSION) return 'skipped';
      const backup = backupDoc.data();
      const now = Timestamp.now().toDate().toISOString();
      if (!revisionSnap.exists) {
        tx.create(rollbackRevisionRef, {
          id: rollbackRevisionRef.id,
          operationId: rollbackRevisionRef.id,
          projectId,
          projectCode: backup.projectCode || project.code || projectId,
          kind: 'SERVICE_MIGRATION_ROLLBACK',
          reason: 'Manager-approved Phase 6 rollback',
          editor: { uid: actor.uid, name: actor.profile.name || actor.profile.email || actor.uid, role: 'Manager' },
          before: { services: project.services || [] },
          after: { services: backup.originalServices || [] },
          version: 1,
          migrationVersion: PHASE6_SERVICE_MIGRATION_VERSION,
          createdAt: now,
          serverCreatedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.update(projectRef, { services: backup.originalServices || [], serviceMigration: FieldValue.delete() });
      return 'restored';
    });
    if (result === 'restored') restored += 1;
    else skipped += 1;
  }
  await db.doc(`system_migrations/${PHASE6_SERVICE_MIGRATION_VERSION}`).set({
    state: 'ROLLED_BACK',
    lastRollbackAt: FieldValue.serverTimestamp(),
    lastRollbackBy: actor.uid,
  }, { merge: true });
  return { version: PHASE6_SERVICE_MIGRATION_VERSION, restored, skipped };
});
