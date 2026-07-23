import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc, updateDoc } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const projectId = 'kilani-phase5-test';
const config = { apiKey: 'test-key', authDomain: `${projectId}.firebaseapp.com`, projectId };
const apps = [];
let adminEnv, manager, designer, otherDesigner, setter, jeweller;

const operation = suffix => `phase5_operation_${suffix.padEnd(20, '0')}`;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function client(name, email) {
  const app = initializeApp(config, name); apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const credential = await createUserWithEmailAndPassword(auth, email, 'Phase5-Test-Password!');
  const functions = getFunctions(app, 'northamerica-northeast1'); connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { uid: credential.user.uid, functions, db };
}
const call = (app, name, payload) => httpsCallable(app.functions, name)(payload).then(result => result.data);
const seed = (path, value) => adminEnv.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), path), value));
async function read(path) { let value; await adminEnv.withSecurityRulesDisabled(async context => { const snap = await getDoc(doc(context.firestore(), path)); value = snap.exists() ? snap.data() : null; }); return value; }

before(async () => {
  adminEnv = await initializeTestEnvironment({ projectId });
  manager = await client('p5-manager', 'p5-manager@example.test');
  designer = await client('p5-designer', 'p5-designer@example.test');
  otherDesigner = await client('p5-other', 'p5-other@example.test');
  setter = await client('p5-setter', 'p5-setter@example.test');
  jeweller = await client('p5-jeweller', 'p5-jeweller@example.test');
  await Promise.all([
    seed(`users/${manager.uid}`, { authUid: manager.uid, name: 'Manager', role: 'Manager', active: true, legacyProfileIds: [] }),
    seed(`users/${designer.uid}`, { authUid: designer.uid, name: 'Designer', role: 'Designer', active: true, legacyProfileIds: [] }),
    seed(`users/${otherDesigner.uid}`, { authUid: otherDesigner.uid, name: 'Other', role: 'Designer', active: true, legacyProfileIds: [] }),
    seed(`users/${setter.uid}`, { authUid: setter.uid, name: 'Setter', role: 'Setter', active: true, legacyProfileIds: [] }),
    seed(`users/${jeweller.uid}`, { authUid: jeweller.uid, name: 'Jeweller', role: 'Jeweller', active: true, legacyProfileIds: [] }),
    seed('projects/main', {
      code: 'P5-MAIN', status: 'Active', designStage: 'Casting Sent', activeAssignees: [designer.uid, setter.uid, jeweller.uid],
      assignments: [{ userId: designer.uid, active: true }, { userId: setter.uid, active: true }, { userId: jeweller.uid, active: true }],
      goldComponents: [
        { id: 'pendant-r1', componentId: 'pendant', revisionId: 'pendant-r1', revisionVersion: 0, state: 'ACTIVE', label: 'Pendant', type: 'Yellow', purity: '10k', purityRatioPpm: 417000 },
        { id: 'accent-r1', componentId: 'accent', revisionId: 'accent-r1', revisionVersion: 0, state: 'ACTIVE', label: 'Accent', type: 'White', purity: '14k', purityRatioPpm: 585000 },
      ],
      castingEvents: [{ id: 'casting-1', projectId: 'main', cycleNumber: 1, sentAt: new Date().toISOString(), goldComponentIds: ['pendant-r1', 'accent-r1'] }], progress: [],
    }),
    seed('projects/legacy-closed', { code: 'OLD', status: 'Closed', date_picked_up: '2025-01-01T12:00:00.000Z', finalGoldCostCalculated: 123.45, projectEndGoldPriceSnapshot: 88.88 }),
  ]);
});
after(async () => { await adminEnv?.cleanup(); await Promise.all(apps.map(deleteApp)); });

test('one component changes independently and creates a linked superseded revision', async () => {
  await assert.rejects(setDoc(doc(designer.db, 'projects/forged-financial-project'), { status: 'Active', goldComponents: [{ id: 'forged', label: 'Forged', type: 'Yellow', purity: '14k', internalCastingCost: { amountCents: 1 } }] }));
  await call(designer, 'reviseMetalComponent', { operationId: operation('component-change'), projectId: 'main', revisionId: 'accent-r1', reason: 'Client selected rose gold.', expectedVersion: 0, label: 'Accent', metal: 'Rose', purity: '18k' });
  const project = await read('projects/main');
  assert.equal(project.goldComponents.find(c => c.revisionId === 'pendant-r1').purity, '10k');
  assert.equal(project.goldComponents.find(c => c.revisionId === 'accent-r1').state, 'SUPERSEDED');
  const replacement = project.goldComponents.find(c => c.supersedesRevisionId === 'accent-r1');
  assert.equal(replacement.purity, '18k');
  assert.equal((await read(`projects/main/revisions/${operation('component-change')}`)).kind, 'COMPONENT_SUPERSEDED');
  await assert.rejects(call(otherDesigner, 'reviseMetalComponent', { operationId: operation('unauthorized-change'), projectId: 'main', revisionId: replacement.revisionId, reason: 'No access', expectedVersion: 1, label: 'Accent', metal: 'White', purity: '14k' }));
});

test('only an assigned Designer or Manager can receive casting and each receipt rate creates an independent draft', async () => {
  const project = await read('projects/main');
  const accent = project.goldComponents.find(c => c.state === 'ACTIVE' && c.componentId === 'accent');
  const weights = [
    { revisionId: 'pendant-r1', weightMg: 12400, supplierRateCentsPerGram: 4000 },
    { revisionId: accent.revisionId, weightMg: 1000, supplierRateCentsPerGram: 5000 },
  ];
  await assert.rejects(call(setter, 'recordCastingReceipt', { operationId: operation('setter-receipt'), projectId: 'main', condition: 'CORRECT', notes: '', weights }));
  await assert.rejects(call(jeweller, 'recordCastingReceipt', { operationId: operation('jeweller-receipt'), projectId: 'main', condition: 'CORRECT', notes: '', weights }));
  await assert.rejects(call(otherDesigner, 'recordCastingReceipt', { operationId: operation('other-receipt'), projectId: 'main', condition: 'CORRECT', notes: '', weights }));
  await assert.rejects(updateDoc(doc(setter.db, 'projects/main'), { castingEvents: [{ forged: true }] }));
  const result = await call(designer, 'recordCastingReceipt', {
    operationId: operation('casting-receipt'),
    projectId: 'main',
    condition: 'CORRECT',
    notes: 'Confirmed by casting slip.',
    weights
  });
  assert.equal(result.overallCastingCostCents, 54600);
  const updated = await read('projects/main');
  const pendant = updated.goldComponents.find(c => c.revisionId === 'pendant-r1');
  assert.equal(pendant.castingWeightMg, 12400);
  assert.equal(pendant.pendingInternalCastingCost.supplierRateCentsPerGram, 4000);
  assert.equal(pendant.pendingInternalCastingCost.amountCents, 49600);
  assert.equal(updated.goldComponents.find(c => c.revisionId === accent.revisionId).castingWeightMg, 1000);
  assert.equal(pendant.internalCastingCost, undefined);
  assert.equal(updated.castingEvents[0].overallCastingCostCents, 54600);
  assert.equal(updated.castingEvents[0].componentCosts.length, 2);
});

test('casting weight times supplier rate is fixed precision and confirmation locks it', async () => {
  const payload = { operationId: operation('confirm-cost'), projectId: 'main', revisionId: 'pendant-r1', supplierRateCentsPerGram: 4150 };
  const first = await call(manager, 'confirmInternalCastingCost', payload);
  const retry = await call(manager, 'confirmInternalCastingCost', payload);
  assert.deepEqual(retry, first);
  assert.equal(first.amountCents, 51460);
  const updated = await read('projects/main');
  assert.equal(updated.goldComponents.find(c => c.revisionId === 'pendant-r1').internalCastingCost.status, 'LOCKED');
  assert.equal(updated.goldComponents.find(c => c.revisionId === 'pendant-r1').pendingInternalCastingCost, undefined);
  assert.equal(updated.castingEvents[0].componentCosts.find(c => c.revisionId === 'pendant-r1').supplierRateCentsPerGram, 4000);
  await assert.rejects(call(designer, 'confirmInternalCastingCost', { ...payload, operationId: operation('designer-cost') }));
});

test('direct locked-cost edit is blocked and correction creates one reversal plus one replacement', async () => {
  const project = await read('projects/main');
  await assert.rejects(updateDoc(doc(manager.db, 'projects/main'), { goldComponents: project.goldComponents.map(c => c.revisionId === 'pendant-r1' ? { ...c, internalCastingCost: { amountCents: 1 } } : c) }));
  const payload = { operationId: operation('correct-cost'), projectId: 'main', revisionId: 'pendant-r1', reason: 'Supplier slip was entered incorrectly.', castingWeightMg: 12345, supplierRateCentsPerGram: 4200 };
  const first = await call(manager, 'correctInternalCastingCost', payload);
  const retry = await call(manager, 'correctInternalCastingCost', payload);
  assert.deepEqual(retry, first);
  assert.equal(first.amountCents, 51849);
  assert.equal((await read(`projects/main/revisions/${first.reversalId}`)).kind, 'INTERNAL_COST_REVERSAL');
  assert.equal((await read(`projects/main/revisions/${first.replacementId}`)).kind, 'INTERNAL_COST_REPLACEMENT');
});

test('assigned Designer records final component weights while Setter and Jeweller remain blocked', async () => {
  const project = await read('projects/main');
  const accent = project.goldComponents.find(c => c.state === 'ACTIVE' && c.componentId === 'accent');
  const beforeCost = project.goldComponents.find(c => c.revisionId === 'pendant-r1').internalCastingCost.amountCents;
  const weights = [{ revisionId: 'pendant-r1', weightMg: 11000 }, { revisionId: accent.revisionId, weightMg: 900 }];
  await assert.rejects(call(setter, 'recordFinalComponentWeights', { operationId: operation('setter-final'), projectId: 'main', weights }));
  await assert.rejects(call(jeweller, 'recordFinalComponentWeights', { operationId: operation('jeweller-final'), projectId: 'main', weights }));
  await assert.rejects(call(otherDesigner, 'recordFinalComponentWeights', { operationId: operation('other-final'), projectId: 'main', weights }));
  await call(designer, 'recordFinalComponentWeights', { operationId: operation('final-weights'), projectId: 'main', weights });
  const updated = await read('projects/main');
  assert.equal(updated.goldComponents.find(c => c.revisionId === 'pendant-r1').finalWeightMg, 11000);
  assert.equal(updated.goldComponents.find(c => c.revisionId === 'pendant-r1').castingWeightMg - 11000, 1345);
  assert.equal(updated.goldComponents.find(c => c.revisionId === 'pendant-r1').internalCastingCost.amountCents, beforeCost);
});

test('casting removal preserves history, excludes the component, and keeps at least one active component', async () => {
  await seed('projects/removal', {
    code: 'REMOVAL',
    status: 'Active',
    designStage: 'Casting Sent',
    activeAssignees: [designer.uid, setter.uid],
    assignments: [{ userId: designer.uid, active: true }, { userId: setter.uid, active: true }],
    goldComponents: [
      { id: 'main-r1', componentId: 'main', revisionId: 'main-r1', revisionVersion: 0, state: 'ACTIVE', label: 'Main', type: 'Yellow', purity: '14k', purityRatioPpm: 585000 },
      { id: 'extra-r1', componentId: 'extra', revisionId: 'extra-r1', revisionVersion: 0, state: 'ACTIVE', label: 'Extra', type: 'White', purity: '10k', purityRatioPpm: 417000 },
    ],
    castingEvents: [{ id: 'casting-removal', projectId: 'removal', cycleNumber: 1, sentAt: new Date().toISOString(), goldComponentIds: ['main-r1', 'extra-r1'] }],
    progress: [],
  });
  const result = await call(designer, 'recordCastingReceipt', {
    operationId: operation('remove-component'),
    projectId: 'removal',
    condition: 'CORRECT',
    notes: 'Extra component is no longer required.',
    weights: [{ revisionId: 'main-r1', weightMg: 2000, supplierRateCentsPerGram: 1000 }],
    removedComponents: [{ revisionId: 'extra-r1', reason: 'Design no longer needs this piece.' }],
  });
  assert.equal(result.overallCastingCostCents, 2000);
  const project = await read('projects/removal');
  assert.equal(project.goldComponents.find(c => c.revisionId === 'extra-r1').state, 'REMOVED');
  assert.equal(project.goldComponents.filter(c => c.state === 'ACTIVE').length, 1);
  assert.equal(project.castingEvents[0].removedComponents[0].reason, 'Design no longer needs this piece.');
  assert.equal((await read(`projects/removal/revisions/${operation('remove-component')}`)).after.removedComponents.length, 1);
});

test('pickup requires Manager, Review status, retroactive reason, and locks independent no-markup charges', async () => {
  await seed('projects/main', { ...(await read('projects/main')), status: 'Review' });
  const retro = '2026-07-20';
  await assert.rejects(call(manager, 'confirmProjectPickupPhase5', { operationId: operation('retro-no-reason'), projectId: 'main', actualPickupDate: retro, testPriceCentsPerGram: 10000 }));
  await assert.rejects(call(designer, 'confirmProjectPickupPhase5', { operationId: operation('designer-pickup'), projectId: 'main', actualPickupDate: retro, lateEntryReason: 'Late', testPriceCentsPerGram: 10000 }));
  const payload = { operationId: operation('pickup'), projectId: 'main', actualPickupDate: retro, lateEntryReason: 'Client pickup was entered after the weekend.', testPriceCentsPerGram: 10000 };
  const first = await call(manager, 'confirmProjectPickupPhase5', payload);
  const retry = await call(manager, 'confirmProjectPickupPhase5', payload);
  assert.deepEqual(retry, first);
  assert.equal(first.totalClientGoldChargeCents, 52620); // 11g 10K + 0.9g 18K, independently rounded, no markup
  const closed = await read('projects/main');
  assert.equal(closed.pickupPricingSnapshot.actualPickupDate, retro);
  assert.equal(closed.pickupPricingSnapshot.formulaVersion, 'NO_MARKUP_V1');
  assert.equal(closed.pickupPricingSnapshot.locked, true);
  await assert.rejects(updateDoc(doc(manager.db, 'projects/main'), { pickupPricingSnapshot: { totalClientGoldChargeCents: 1 } }));
  await assert.rejects(call(manager, 'correctInternalCastingCost', { operationId: operation('after-pickup'), projectId: 'main', revisionId: 'pendant-r1', reason: 'Illegal', castingWeightMg: 10000, supplierRateCentsPerGram: 4000 }));
});

test('historical-price outage never closes the project or uses current rate', async () => {
  await seed('projects/outage', { code: 'OUTAGE', status: 'Review', assignments: [], activeAssignees: [], progress: [], goldComponents: [{ id: 'g', componentId: 'g', revisionId: 'g', revisionVersion: 0, state: 'ACTIVE', label: 'Gold', type: 'Yellow', purity: '14k', purityRatioPpm: 585000, castingWeightMg: 1000, finalWeightMg: 900 }] });
  await assert.rejects(call(manager, 'confirmProjectPickupPhase5', { operationId: operation('outage'), projectId: 'outage', actualPickupDate: today(), testSimulatePriceFailure: true }));
  const project = await read('projects/outage');
  assert.equal(project.status, 'Review');
  assert.equal(project.pickupPricingSnapshot, undefined);
});

test('Platinum remains explicitly unpriced and historical totals stay untouched', async () => {
  await seed('projects/platinum', { code: 'PLAT', status: 'Review', assignments: [], activeAssignees: [], progress: [], goldComponents: [{ id: 'p', componentId: 'p', revisionId: 'p', revisionVersion: 0, state: 'ACTIVE', label: 'Platinum', type: 'Platinum', purity: '950', purityRatioPpm: 0, castingWeightMg: 1000, finalWeightMg: 900 }] });
  await call(manager, 'confirmProjectPickupPhase5', { operationId: operation('platinum'), projectId: 'platinum', actualPickupDate: today(), testPriceCentsPerGram: 10000 });
  const platinum = await read('projects/platinum');
  assert.equal(platinum.pickupPricingSnapshot.components[0].pricingStatus, 'PLATINUM_PRICING_PENDING');
  assert.equal(platinum.pickupPricingSnapshot.totalClientGoldChargeCents, 0);
  const legacy = await read('projects/legacy-closed');
  assert.equal(legacy.finalGoldCostCalculated, 123.45);
  assert.equal(legacy.projectEndGoldPriceSnapshot, 88.88);
});

test('casting dispatch is assigned-role checked, atomic, and retry safe', async () => {
  await seed('projects/dispatch', { code: 'DISPATCH', status: 'Active', designStage: 'Approved', activeAssignees: [designer.uid], assignments: [{ userId: designer.uid, active: true }], goldComponents: [{ id: 'd', componentId: 'd', revisionId: 'd', revisionVersion: 0, state: 'ACTIVE', label: 'Main', type: 'Yellow', purity: '14k', purityRatioPpm: 585000 }], castingEvents: [] });
  const payload = { operationId: operation('dispatch'), projectId: 'dispatch', revisionIds: ['d'] };
  const first = await call(designer, 'dispatchCastingPhase5', payload);
  assert.deepEqual(await call(designer, 'dispatchCastingPhase5', payload), first);
  const project = await read('projects/dispatch');
  assert.equal(project.castingEvents.length, 1);
  assert.equal(project.designStage, 'Casting Sent');
  await assert.rejects(call(otherDesigner, 'dispatchCastingPhase5', { operationId: operation('dispatch-other'), projectId: 'dispatch', revisionIds: ['d'] }));
  await assert.rejects(call(setter, 'dispatchCastingPhase5', { operationId: operation('dispatch-setter'), projectId: 'dispatch', revisionIds: ['d'] }));
  await assert.rejects(call(jeweller, 'dispatchCastingPhase5', { operationId: operation('dispatch-jeweller'), projectId: 'dispatch', revisionIds: ['d'] }));
});

test('only Manager can safely return an unpicked Review project to Active', async () => {
  await seed('projects/review-revert', { code: 'REVERT', status: 'Review', date_completed: '2026-07-21T12:00:00.000Z', projectEndGoldPriceSnapshot: 99, finalGoldCostCalculated: 50, progress: [], assignments: [{ userId: designer.uid, active: true }], activeAssignees: [designer.uid] });
  await assert.rejects(call(designer, 'revertProjectToActivePhase5', { operationId: operation('revert-designer'), projectId: 'review-revert' }));
  await call(manager, 'revertProjectToActivePhase5', { operationId: operation('revert-manager'), projectId: 'review-revert' });
  const project = await read('projects/review-revert');
  assert.equal(project.status, 'Active');
  assert.equal(project.projectEndGoldPriceSnapshot, undefined);
  assert.equal(project.finalGoldCostCalculated, undefined);
});
