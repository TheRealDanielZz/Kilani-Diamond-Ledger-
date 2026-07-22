const path = require('node:path');
const { createRequire } = require('node:module');
const requireFunctions = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { applicationDefault, initializeApp, deleteApp } = requireFunctions('firebase-admin/app');
const { FieldValue, Timestamp, getFirestore } = requireFunctions('firebase-admin/firestore');
const {
  classifyLegacyProjectServices,
  LEGACY_SETTING_OWNER_NOTE,
  stableHash,
} = require('../functions/lib/projects/phase6.js');

const PROJECT_ID = 'kilani-diamond-ledger';
const VERSION = 'phase6-service-canonical-v1';
const APPROVED_HASH = '225977ccc129d081ba06daecde45acb18a7a43de0a44236940b72c8607b3ced9';
const BATCH_SIZE = 20;

function withoutMigrationFields(project) {
  const copy = { ...project };
  delete copy.services;
  delete copy.serviceMigration;
  return copy;
}

async function buildDryRun(db) {
  const [snapshot, backupsSnapshot] = await Promise.all([
    db.collection('projects').orderBy('__name__').get(),
    db.collection(`system_migrations/${VERSION}/backups`).get(),
  ]);
  const backups = new Map(backupsSnapshot.docs.map(document => [document.id, document.data()]));
  const rows = snapshot.docs.map(document => {
    const project = document.data();
    const migration = project.serviceMigration;
    const backup = backups.get(document.id);
    const current = classifyLegacyProjectServices(project);
    const classification = migration?.version === VERSION && backup
      ? {
          code: backup.classification,
          ruleId: String(backup.ruleId || 'UNKNOWN'),
          status: current.status,
          originalServices: Array.isArray(backup.originalServices) ? backup.originalServices : [],
          originalServicesHash: String(backup.originalServicesHash || ''),
        }
      : current;
    return {
      projectId: document.id,
      projectCode: typeof project.code === 'string' ? project.code : document.id,
      ...classification,
      alreadyMigrated: migration?.version === VERSION,
    };
  });
  const hashInput = rows.map(row => ({
    projectId: row.projectId,
    originalServicesHash: row.originalServicesHash,
    code: row.code,
    ruleId: row.ruleId,
  }));
  return { rows, dryRunHash: stableHash(hashInput), snapshot };
}

async function main() {
  const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID }, `phase6-approved-${Date.now()}`);
  const db = getFirestore(app);

  try {
    const initial = await buildDryRun(db);
    if (initial.dryRunHash !== APPROVED_HASH) {
      throw new Error(`Approved checksum mismatch: expected ${APPROVED_HASH}, received ${initial.dryRunHash}.`);
    }
    const beforeProtectedHashes = new Map(
      initial.snapshot.docs.map(document => [document.id, stableHash(withoutMigrationFields(document.data()))])
    );
    const users = await db.collection('users').get();
    const managerDoc = users.docs.find(document => {
      const profile = document.data();
      return profile.role === 'Manager' && String(profile.email || '').toLowerCase() === 'kilanimedia@gmail.com';
    });
    if (!managerDoc) throw new Error('The approved Manager security profile was not found.');
    const manager = managerDoc.data();
    const actor = {
      uid: managerDoc.id,
      name: manager.name || manager.email || managerDoc.id,
    };

    let totalProcessed = 0;
    while (true) {
      const dryRun = await buildDryRun(db);
      if (dryRun.dryRunHash !== APPROVED_HASH) {
        throw new Error(`Migration checksum changed during execution: ${dryRun.dryRunHash}.`);
      }
      const pending = dryRun.rows.filter(row => !row.alreadyMigrated).slice(0, BATCH_SIZE);
      if (pending.length === 0) break;

      for (const row of pending) {
        const projectRef = db.doc(`projects/${row.projectId}`);
        const backupRef = db.doc(`system_migrations/${VERSION}/backups/${row.projectId}`);
        const revisionRef = db.doc(`projects/${row.projectId}/revisions/service-migration-${VERSION}`);
        const processed = await db.runTransaction(async tx => {
          const [projectSnap, backupSnap, revisionSnap] = await Promise.all([
            tx.get(projectRef), tx.get(backupRef), tx.get(revisionRef),
          ]);
          if (!projectSnap.exists) throw new Error(`Project ${row.projectId} disappeared during migration.`);
          const project = projectSnap.data() || {};
          if (project.serviceMigration?.version === VERSION) return false;
          const current = classifyLegacyProjectServices(project);
          if (
            current.originalServicesHash !== row.originalServicesHash
            || current.code !== row.code
            || current.ruleId !== row.ruleId
          ) {
            throw new Error(`Project ${row.projectId} changed after the approved dry run.`);
          }
          const now = Timestamp.now().toDate().toISOString();
          if (!backupSnap.exists) {
            tx.create(backupRef, {
              projectId: row.projectId,
              projectCode: row.projectCode,
              version: VERSION,
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
              reason: current.ruleId === 'OWNER_CONFIRMED_LEGACY_SETTING_TO_CUSTOM_MAKE'
                ? LEGACY_SETTING_OWNER_NOTE
                : current.ruleId,
              editor: { uid: actor.uid, name: actor.name, role: 'Manager' },
              before: { services: current.originalServices },
              after: { services: [{ code: current.code, status: current.status }], classification: current.code },
              version: 1,
              migrationVersion: VERSION,
              ruleId: current.ruleId,
              createdAt: now,
              serverCreatedAt: FieldValue.serverTimestamp(),
            });
          }
          tx.update(projectRef, {
            services: [{ code: current.code, status: current.status }],
            serviceMigration: {
              version: VERSION,
              classification: current.code,
              ruleId: current.ruleId,
              originalServicesHash: current.originalServicesHash,
              migratedAt: now,
              migratedBy: actor.uid,
              status: 'MIGRATED',
            },
          });
          return true;
        });
        if (processed) totalProcessed += 1;
      }

      const remaining = Math.max(0, dryRun.rows.filter(row => !row.alreadyMigrated).length - pending.length);
      await db.doc(`system_migrations/${VERSION}`).set({
        version: VERSION,
        dryRunHash: APPROVED_HASH,
        lastBatchAt: FieldValue.serverTimestamp(),
        lastBatchBy: actor.uid,
        state: remaining === 0 ? 'COMPLETED' : 'IN_PROGRESS',
      }, { merge: true });
    }

    const final = await buildDryRun(db);
    const counts = { CUSTOM_MAKE: 0, REPAIR: 0 };
    let backupCount = 0;
    let revisionCount = 0;
    let ownerHistoryNoteCount = 0;
    const invalidAuditRecords = [];
    const changedProtectedProjects = [];
    for (const document of final.snapshot.docs) {
      const project = document.data();
      const code = project.services?.[0]?.code;
      if (code in counts) counts[code] += 1;
      const [backup, revision] = await Promise.all([
        db.doc(`system_migrations/${VERSION}/backups/${document.id}`).get(),
        db.doc(`projects/${document.id}/revisions/service-migration-${VERSION}`).get(),
      ]);
      if (backup.exists) backupCount += 1;
      if (revision.exists) revisionCount += 1;
      const backupData = backup.data();
      const revisionData = revision.data();
      if (
        !backup.exists
        || !revision.exists
        || backupData?.version !== VERSION
        || revisionData?.migrationVersion !== VERSION
        || stableHash(backupData?.originalServices || []) !== backupData?.originalServicesHash
        || stableHash(revisionData?.before?.services || []) !== backupData?.originalServicesHash
      ) {
        invalidAuditRecords.push(document.id);
      }
      if (revisionData?.reason === LEGACY_SETTING_OWNER_NOTE) ownerHistoryNoteCount += 1;
      const afterHash = stableHash(withoutMigrationFields(project));
      if (afterHash !== beforeProtectedHashes.get(document.id)) changedProtectedProjects.push(document.id);
    }
    const ownerNoteCount = final.snapshot.docs.filter(document =>
      document.data().serviceMigration?.ruleId === 'OWNER_CONFIRMED_LEGACY_SETTING_TO_CUSTOM_MAKE'
    ).length;
    const marker = await db.doc(`system_migrations/${VERSION}`).get();
    console.log(JSON.stringify({
      approvedHash: APPROVED_HASH,
      processedThisRun: totalProcessed,
      projectCount: final.rows.length,
      classifications: counts,
      migratedCount: final.rows.filter(row => row.alreadyMigrated).length,
      backupCount,
      revisionCount,
      ownerNoteCount,
      ownerHistoryNoteCount,
      invalidAuditRecords,
      protectedProjectChanges: changedProtectedProjects,
      migrationState: marker.data()?.state || null,
    }, null, 2));
  } finally {
    await deleteApp(app);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
