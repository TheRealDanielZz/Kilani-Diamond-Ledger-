import test, { after, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

let env;
let managerDb;
let setterDb;
let designerDb;
let otherDb;
let jewellerDb;
let salesRepDb;
let inactiveDb;
let managerStorage;
let setterStorage;
let designerStorage;
let otherStorage;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'kilani-phase1-test',
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
    storage: { rules: await readFile('storage.rules', 'utf8') },
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users/manager-uid'), { authUid: 'manager-uid', legacyProfileIds: [], role: 'Manager', active: true }),
      setDoc(doc(db, 'users/designer-uid'), { authUid: 'designer-uid', legacyProfileIds: ['legacy-designer'], role: 'Designer', active: true }),
      setDoc(doc(db, 'users/setter-uid'), { authUid: 'setter-uid', legacyProfileIds: [], role: 'Setter', active: true }),
      setDoc(doc(db, 'users/other-uid'), { authUid: 'other-uid', legacyProfileIds: [], role: 'Setter', active: true }),
      setDoc(doc(db, 'users/jeweller-uid'), { authUid: 'jeweller-uid', legacyProfileIds: [], role: 'Jeweller', active: true }),
      setDoc(doc(db, 'users/sales-uid'), { authUid: 'sales-uid', legacyProfileIds: [], role: 'Sales Rep', active: true }),
      setDoc(doc(db, 'users/inactive-uid'), { authUid: 'inactive-uid', legacyProfileIds: [], role: 'Setter', active: false }),
      setDoc(doc(db, 'projects/project-1'), { activeAssignees: ['setter-uid'], code: 'P1' }),
      setDoc(doc(db, 'projects/project-legacy'), { activeAssignees: ['legacy-designer'], code: 'OLD' }),
      setDoc(doc(db, 'projects/role-project'), {
        code: 'ROLE-1', status: 'Active', workDetails: 'Protected', goldType: 'Yellow', goldPurity: '10k',
        activeAssignees: ['designer-uid', 'setter-uid', 'jeweller-uid'],
        assignments: [
          { userId: 'designer-uid', active: true },
          { userId: 'setter-uid', active: true },
          { userId: 'jeweller-uid', active: true },
        ],
        progress: [], designLogs: [], services: [{ code: 'REPAIR', status: 'PENDING' }],
        projectPhotos: [], projectPhotoIds: [],
        repair: { type: 'General Repair', status: 'Intake', financials: { quotedPriceCad: 100 } },
      }),
      setDoc(doc(db, 'projects/legacy-role-project'), {
        code: 'ROLE-OLD', status: 'Active', activeAssignees: ['setter-uid'], assignments: [{ userId: 'setter-uid', active: true }],
      }),
      setDoc(doc(db, 'projects/picked-up-role-project'), {
        code: 'ROLE-CLOSED', status: 'Closed', date_picked_up: '2026-07-20T12:00:00.000Z',
        activeAssignees: ['designer-uid', 'setter-uid'], assignments: [{ userId: 'designer-uid', active: true }, { userId: 'setter-uid', active: true }],
        progress: [], designLogs: [], services: [{ code: 'CUSTOM_MAKE', status: 'COMPLETED' }], projectPhotos: [], projectPhotoIds: [],
      }),
      setDoc(doc(db, 'specs/spec-1'), { label: 'RD 1mm', location: 'Melee', pcs: 10, ct: 0.05 }),
      setDoc(doc(db, 'bags/bag-1'), { issuedToId: 'setter-uid', projectId: 'project-1', status: 'Issued' }),
      setDoc(doc(db, 'requests/request-1'), { requestedById: 'setter-uid', projectId: 'project-1', status: 'OPEN' }),
      setDoc(doc(db, 'movements/movement-1'), { actionType: 'ISSUE', operationId: 'op-1' }),
      setDoc(doc(db, 'evidence/evidence-1'), { uploaderId: 'setter-uid', storagePath: 'evidence/returns/setter-uid/op-1/original.jpg' }),
      setDoc(doc(db, 'settings/global'), { goldPrice: 100 }),
      setDoc(doc(db, 'notifications/own'), { userId: 'setter-uid', read: false }),
      setDoc(doc(db, 'notifications/other'), { userId: 'other-uid', read: false }),
      setDoc(doc(db, 'system_migrations/phase6-service-canonical-v1'), { state: 'DRY_RUN' }),
      setDoc(doc(db, 'setter_tracking_events/phase9-event'), {
        setterUid: 'setter-uid', projectId: 'project-1', eventType: 'assignment_started',
      }),
      setDoc(doc(db, 'setter_assignment_intervals/phase9-interval'), {
        setterUid: 'setter-uid', projectId: 'project-1', active: true,
      }),
      setDoc(doc(db, 'phase9_tracking_operations/phase9-operation'), {
        sourceEventId: 'source-event',
      }),
    ]);
  });
  managerDb = env.authenticatedContext('manager-uid').firestore();
  setterDb = env.authenticatedContext('setter-uid').firestore();
  designerDb = env.authenticatedContext('designer-uid').firestore();
  otherDb = env.authenticatedContext('other-uid').firestore();
  jewellerDb = env.authenticatedContext('jeweller-uid').firestore();
  salesRepDb = env.authenticatedContext('sales-uid').firestore();
  inactiveDb = env.authenticatedContext('inactive-uid').firestore();
  managerStorage = env.authenticatedContext('manager-uid').storage();
  setterStorage = env.authenticatedContext('setter-uid').storage();
  designerStorage = env.authenticatedContext('designer-uid').storage();
  otherStorage = env.authenticatedContext('other-uid').storage();
});

after(async () => env?.cleanup());

test('Manager can read evidence and trusted inventory records', async () => {
  await assertSucceeds(getDoc(doc(managerDb, 'evidence/evidence-1')));
  await assertSucceeds(getDoc(doc(managerDb, 'bags/bag-1')));
  await assertSucceeds(getDoc(doc(managerDb, 'requests/request-1')));
  await assertSucceeds(getDoc(doc(managerDb, 'specs/spec-1')));
  await assertSucceeds(getDoc(doc(managerDb, 'movements/movement-1')));
});

test('Setter cannot discover inventory, ledger, evidence, or valuation directly', async () => {
  await assertFails(getDoc(doc(setterDb, 'evidence/evidence-1')));
  await assertFails(getDoc(doc(setterDb, 'bags/bag-1')));
  await assertFails(getDoc(doc(setterDb, 'requests/request-1')));
  await assertFails(getDoc(doc(setterDb, 'specs/spec-1')));
  await assertFails(getDoc(doc(setterDb, 'movements/movement-1')));
  await assertFails(getDoc(doc(setterDb, 'settings/global')));
  await assertSucceeds(getDoc(doc(setterDb, 'projects/project-1')));
});

test('ordinary clients cannot bypass protected workflow writes', async () => {
  await assertFails(setDoc(doc(setterDb, 'requests/bypass'), { requestedById: 'setter-uid' }));
  await assertFails(updateDoc(doc(setterDb, 'bags/bag-1'), { status: 'Counted_Confirmed' }));
  await assertFails(setDoc(doc(managerDb, 'movements/bypass'), { actionType: 'ISSUE' }));
  await assertFails(updateDoc(doc(managerDb, 'specs/spec-1'), { pcs: 999 }));
  await assertFails(deleteDoc(doc(managerDb, 'movements/movement-1')));
  await assertFails(deleteDoc(doc(managerDb, 'evidence/evidence-1')));
});

test('Phase 9 tracking records are backend-only, including for Managers', async () => {
  await assertFails(getDoc(doc(managerDb, 'setter_tracking_events/phase9-event')));
  await assertFails(getDoc(doc(setterDb, 'setter_assignment_intervals/phase9-interval')));
  await assertFails(getDoc(doc(managerDb, 'phase9_tracking_operations/phase9-operation')));
  await assertFails(setDoc(doc(managerDb, 'setter_tracking_events/forged'), {
    setterUid: 'setter-uid', projectId: 'project-1', eventType: 'project_completed',
  }));
  await assertFails(updateDoc(doc(managerDb, 'setter_assignment_intervals/phase9-interval'), {
    active: false,
  }));
  await assertFails(deleteDoc(doc(managerDb, 'setter_tracking_events/phase9-event')));
});

test('Manager may edit spec metadata but not its authoritative balance', async () => {
  await assertSucceeds(updateDoc(doc(managerDb, 'specs/spec-1'), { label: 'RD 1.0mm' }));
  await assertFails(updateDoc(doc(designerDb, 'specs/spec-1'), { ct: 99 }));
});

test('legacy project assignments remain usable through the canonical UID profile', async () => {
  await assertSucceeds(updateDoc(doc(designerDb, 'projects/project-legacy'), { code: 'OLD-UPDATED' }));
});

test('audit logs are append-only and actor-bound', async () => {
  await assertSucceeds(setDoc(doc(managerDb, 'system_logs/log-allowed'), { createdById: 'manager-uid', action: 'TEST' }));
  await assertFails(setDoc(doc(managerDb, 'system_logs/log-forged'), { createdById: 'setter-uid', action: 'TEST' }));
  await assertFails(updateDoc(doc(managerDb, 'system_logs/log-allowed'), { action: 'ALTERED' }));
  await assertFails(deleteDoc(doc(managerDb, 'system_logs/log-allowed')));
});

test('large-stone project assignment is blocked at direct API level', async () => {
  await assertSucceeds(setDoc(doc(managerDb, 'diamonds/diamond-1'), { cert: 'GIA1', location: 'Toronto' }));
  await assertFails(updateDoc(doc(managerDb, 'diamonds/diamond-1'), { projectId: 'project-1' }));
});

test('notification access is recipient scoped', async () => {
  await assertSucceeds(getDoc(doc(setterDb, 'notifications/own')));
  await assertFails(getDoc(doc(setterDb, 'notifications/other')));
  await assertFails(updateDoc(doc(otherDb, 'notifications/own'), { read: true }));
  await assertSucceeds(updateDoc(doc(setterDb, 'notifications/own'), { read: true }));
  await assertSucceeds(updateDoc(doc(managerDb, 'notifications/other'), { isArchived: true, archivedAt: 'now' }));
});

test('return evidence upload is immutable and Manager-readable only', async () => {
  const path = 'evidence/returns/setter-uid/phase1_operation_0001/original.jpg';
  const metadata = { contentType: 'image/jpeg', customMetadata: {
    uploaderUid: 'setter-uid', operationId: 'phase1_operation_0001', projectId: 'project-1', evidenceKind: 'returns',
  } };
  await assertSucceeds(uploadBytes(ref(setterStorage, path), new Uint8Array([1, 2, 3]), metadata));
  await assertFails(getBytes(ref(setterStorage, path)));
  await assertSucceeds(getBytes(ref(managerStorage, path)));
  await assertFails(uploadBytes(ref(setterStorage, path), new Uint8Array([4]), metadata));
  await assertFails(deleteObject(ref(managerStorage, path)));
});

test('only a Manager can upload issue evidence', async () => {
  const path = 'evidence/issues/manager-uid/phase1_operation_0002/original.jpg';
  const metadata = { contentType: 'image/jpeg', customMetadata: {
    uploaderUid: 'manager-uid', operationId: 'phase1_operation_0002', projectId: 'project-1', evidenceKind: 'issues',
  } };
  await assertFails(uploadBytes(ref(setterStorage, 'evidence/issues/setter-uid/phase1_operation_0002/original.jpg'), new Uint8Array([1]), {
    ...metadata, customMetadata: { ...metadata.customMetadata, uploaderUid: 'setter-uid' },
  }));
  await assertSucceeds(uploadBytes(ref(managerStorage, path), new Uint8Array([1, 2]), metadata));
});

test('Manager can create staff security profiles while non-Managers cannot assign roles', async () => {
  await assertSucceeds(setDoc(doc(managerDb, 'users/new-staff-uid'), {
    authUid: 'new-staff-uid', legacyProfileIds: [], role: 'Setter', active: true, name: 'New Setter',
  }));
  await assertFails(setDoc(doc(setterDb, 'users/forged-manager-uid'), {
    authUid: 'forged-manager-uid', legacyProfileIds: [], role: 'Manager', active: true,
  }));
  await assertFails(updateDoc(doc(setterDb, 'users/setter-uid'), { role: 'Manager' }));
});

test('Phase 6 project creation requires exactly one enabled canonical service', async () => {
  await assertSucceeds(setDoc(doc(managerDb, 'projects/canonical-create'), {
    code: 'CANONICAL', status: 'Active', services: [{ code: 'CUSTOM_MAKE', status: 'PENDING' }],
  }));
  await assertFails(setDoc(doc(managerDb, 'projects/legacy-create'), {
    code: 'LEGACY', status: 'Active', services: [{ name: 'Setting', status: 'PENDING' }],
  }));
  await assertFails(setDoc(doc(managerDb, 'projects/multiple-create'), {
    code: 'MULTI', status: 'Active', services: [{ code: 'CUSTOM_MAKE', status: 'PENDING' }, { code: 'REPAIR', status: 'PENDING' }],
  }));
  await assertFails(setDoc(doc(managerDb, 'projects/other-create'), {
    code: 'OTHER', status: 'Active', services: [{ code: 'OTHER', status: 'PENDING' }],
  }));
  await assertFails(setDoc(doc(designerDb, 'projects/designer-create'), {
    code: 'DESIGNER', status: 'Active', services: [{ code: 'CUSTOM_MAKE', status: 'PENDING' }],
  }));
});

test('Phase 6 service identity and migration metadata cannot be changed directly', async () => {
  await assertSucceeds(updateDoc(doc(setterDb, 'projects/role-project'), {
    services: [{ code: 'REPAIR', status: 'IN_PROGRESS', updatedBy: 'setter-uid' }],
  }));
  await assertFails(updateDoc(doc(managerDb, 'projects/role-project'), {
    services: [{ code: 'CUSTOM_MAKE', status: 'IN_PROGRESS' }],
  }));
  await assertFails(updateDoc(doc(managerDb, 'projects/role-project'), {
    serviceMigration: { version: 'forged' },
  }));
  await assertSucceeds(getDoc(doc(managerDb, 'system_migrations/phase6-service-canonical-v1')));
  await assertFails(getDoc(doc(setterDb, 'system_migrations/phase6-service-canonical-v1')));
});

test('assigned production staff can perform operational project writes but cannot change protected or financial fields', async () => {
  const progress = { id: 'progress-1', projectId: 'role-project', createdById: 'setter-uid', createdAt: 'now', stageName: 'Setting', percentComplete: 50 };
  await assertSucceeds(updateDoc(doc(setterDb, 'projects/role-project'), {
    progress: [progress], currentStageName: 'Setting', currentPercentComplete: 50,
  }));
  await assertSucceeds(updateDoc(doc(jewellerDb, 'projects/role-project'), {
    designLogs: [{ id: 'note-1', projectId: 'role-project', createdById: 'jeweller-uid', createdAt: 'now', text: 'Work note' }],
  }));
  await assertSucceeds(updateDoc(doc(setterDb, 'projects/role-project'), {
    services: [{ code: 'REPAIR', status: 'IN_PROGRESS', updatedBy: 'setter-uid' }],
  }));
  await assertSucceeds(updateDoc(doc(setterDb, 'projects/role-project'), {
    repair: { type: 'General Repair', status: 'In Progress', financials: { quotedPriceCad: 100 } },
  }));
  await assertFails(updateDoc(doc(setterDb, 'projects/role-project'), {
    assignments: [{ userId: 'other-uid', active: true }], activeAssignees: ['other-uid'], assignedSetterId: 'other-uid',
  }));
  await assertFails(updateDoc(doc(setterDb, 'projects/role-project'), { workDetails: 'Bypass' }));
  await assertFails(updateDoc(doc(jewellerDb, 'projects/role-project'), { internalCastingCost: 1 }));
  await assertFails(updateDoc(doc(setterDb, 'projects/role-project'), {
    repair: { type: 'General Repair', status: 'In Progress', financials: { quotedPriceCad: 1 } },
  }));
});

test('first progress and design-log writes remain compatible with legacy projects', async () => {
  await assertSucceeds(updateDoc(doc(setterDb, 'projects/legacy-role-project'), {
    progress: [{ id: 'legacy-progress', projectId: 'legacy-role-project', createdById: 'setter-uid', createdAt: 'now', stageName: 'Setting', percentComplete: 25 }],
    currentStageName: 'Setting', currentPercentComplete: 25,
  }));
  await assertSucceeds(updateDoc(doc(setterDb, 'projects/legacy-role-project'), {
    designLogs: [{ id: 'legacy-note', projectId: 'legacy-role-project', createdById: 'setter-uid', createdAt: 'now', text: 'First note' }],
  }));
});

test('unassigned, Sales Rep, and inactive users cannot mutate projects', async () => {
  await assertFails(updateDoc(doc(otherDb, 'projects/role-project'), { services: [] }));
  await assertFails(updateDoc(doc(salesRepDb, 'projects/role-project'), { services: [] }));
  await assertFails(updateDoc(doc(inactiveDb, 'projects/role-project'), { services: [] }));
});

test('project media is writable only by active assigned members and remains locked after pickup', async () => {
  const image = new Uint8Array([1, 2, 3]);
  const metadata = { contentType: 'image/jpeg' };
  const setterRef = ref(setterStorage, 'projects/role-project/gallery/setter.jpg');
  const designerRef = ref(designerStorage, 'projects/role-project/notes/designer.jpg');
  await assertSucceeds(uploadBytes(setterRef, image, metadata));
  await assertSucceeds(uploadBytes(designerRef, image, metadata));
  await assertFails(uploadBytes(ref(otherStorage, 'projects/role-project/gallery/unassigned.jpg'), image, metadata));
  await assertSucceeds(deleteObject(setterRef));
  await assertFails(uploadBytes(ref(setterStorage, 'projects/picked-up-role-project/gallery/closed.jpg'), image, metadata));
  await assertFails(updateDoc(doc(managerDb, 'projects/picked-up-role-project'), { workDetails: 'Unlock attempt' }));
  await assertFails(updateDoc(doc(designerDb, 'projects/picked-up-role-project'), { services: [{ code: 'CUSTOM_MAKE', status: 'PENDING' }] }));
});
