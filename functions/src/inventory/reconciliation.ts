import { FieldPath, Firestore, QueryDocumentSnapshot, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireManager } from './auth';
import { TORONTO_MELEE, isTorontoMeleeLocation } from './models';
import { payloadHash, roundCarats } from './validation';

const REGION = 'northamerica-northeast1';
const CALLABLE_OPTIONS = { region: REGION, cors: true, timeoutSeconds: 540 } as const;
const SOURCE_BATCH_SIZE = 250;
const MAX_PAGE_SIZE = 25;
const EPSILON = 0.000001;

type RecordMap = Record<string, unknown>;

export interface ReconciliationLine {
  specId: string;
  specLabel: string;
  location: string;
  currentPcs: number;
  currentCt: number;
  resolvedPcs: number;
  resolvedCt: number;
  expectedPcs: number;
  expectedCt: number;
  openingPcs: number | null;
  openingCt: number | null;
  additionsPcs: number;
  additionsCt: number;
  issuesPcs: number;
  issuesCt: number;
  returnsPcs: number;
  returnsCt: number;
  breakagePcs: number;
  breakageCt: number;
  adjustmentsPcs: number;
  adjustmentsCt: number;
  correctionsPcs: number;
  correctionsCt: number;
  discrepancyPcs: number;
  discrepancyCt: number;
  type: string;
  detail: string;
  autoRepairable: false;
  correctionAllowed: boolean;
  auditFingerprint: string;
  sourceEvidence: string[];
}

interface AuditProblem {
  type: string;
  detail: string;
  sourceEvidence?: string;
}

interface Totals {
  pcs: number;
  ct: number;
  additionsPcs: number;
  additionsCt: number;
  issuesPcs: number;
  issuesCt: number;
  returnsPcs: number;
  returnsCt: number;
  breakagePcs: number;
  breakageCt: number;
  adjustmentsPcs: number;
  adjustmentsCt: number;
  correctionsPcs: number;
  correctionsCt: number;
  movements: number;
  hasLegacyWeight: boolean;
  problems: AuditProblem[];
}

function asRecord(value: unknown): RecordMap {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordMap : {};
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function canonicalLocation(value: unknown): string {
  return isTorontoMeleeLocation(value) ? TORONTO_MELEE : text(value) || 'UNKNOWN';
}

function cursorFrom(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    return /^[^/]{1,200}$/.test(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

async function readCollectionInBatches(db: Firestore, collectionName: string): Promise<Array<{ id: string; data: RecordMap }>> {
  const result: Array<{ id: string; data: RecordMap }> = [];
  let last: QueryDocumentSnapshot | undefined;
  // This is deliberately server-side and bounded per query; no history is sent to the browser.
  while (true) {
    let query = db.collection(collectionName).orderBy(FieldPath.documentId()).limit(SOURCE_BATCH_SIZE);
    if (last) query = query.startAfter(last) as typeof query;
    const page = await query.get();
    page.docs.forEach((doc) => result.push({ id: doc.id, data: asRecord(doc.data()) }));
    if (page.size < SOURCE_BATCH_SIZE) return result;
    last = page.docs[page.docs.length - 1];
  }
}

function emptyTotals(): Totals {
  return {
    pcs: 0, ct: 0, additionsPcs: 0, additionsCt: 0, issuesPcs: 0, issuesCt: 0,
    returnsPcs: 0, returnsCt: 0, breakagePcs: 0, breakageCt: 0,
    adjustmentsPcs: 0, adjustmentsCt: 0, correctionsPcs: 0, correctionsCt: 0,
    movements: 0, hasLegacyWeight: false, problems: [],
  };
}

function movementCategory(type: string, actionType: string): 'addition' | 'issue' | 'return' | 'breakage' | 'adjustment' | 'correction' | 'unknown' {
  const action = actionType || type;
  if (action === 'SHIPMENT_IN' || action === 'DIAMOND_ADD') return 'addition';
  if (action === 'ISSUE') return 'issue';
  if (action === 'RETURN' || action === 'RETURN_MIXED' || action === 'BULK_RETURN_INTAKE') return 'return';
  if (action === 'BREAKAGE' || action === 'BROKEN_OUT' || action === 'DIAMOND_DELETE' || action === 'MELEE_SPEC_DELETE') return 'breakage';
  if (action === 'MANUAL_ADJUSTMENT') return 'adjustment';
  if (type === 'INVENTORY_CORRECTION' || action === 'CORRECTION_REVERSAL' || action === 'CORRECTION_REPLACEMENT') return 'correction';
  return 'unknown';
}

function signedLine(category: ReturnType<typeof movementCategory>, line: RecordMap, movement: RecordMap, spec: RecordMap): { pcs: number; ct: number } {
  const linePcs = number(line.pcs);
  const snapshot = number(line.averageWeightSnapshot);
  const weightAuthoritative = movement.weightAuthoritative === true || linePcs === 0;
  const rawCt = number(line.ct);
  const lineCt = weightAuthoritative ? rawCt : roundCarats(linePcs * (snapshot || number(spec.ctPerStone)));
  const sign = category === 'issue' || category === 'breakage' ? -1 : 1;
  return { pcs: sign * linePcs, ct: roundCarats(sign * lineCt) };
}

function problem(map: Map<string, AuditProblem[]>, specId: string, type: string, detail: string, sourceEvidence?: string): void {
  const next = map.get(specId) || [];
  next.push({ type, detail, sourceEvidence });
  map.set(specId, next);
}

async function sourceData(db: Firestore) {
  const [specs, movements, bags, requests, projects, transactions, operations, evidence] = await Promise.all([
    readCollectionInBatches(db, 'specs'),
    readCollectionInBatches(db, 'movements'),
    readCollectionInBatches(db, 'bags'),
    readCollectionInBatches(db, 'requests'),
    readCollectionInBatches(db, 'projects'),
    readCollectionInBatches(db, 'diamond_transactions'),
    readCollectionInBatches(db, 'inventory_operations'),
    readCollectionInBatches(db, 'evidence'),
  ]);
  return { specs, movements, bags, requests, projects, transactions, operations, evidence };
}

export async function auditReconciliationSpec(db: Firestore, specId: string): Promise<ReconciliationLine> {
  const specSnap = await db.doc(`specs/${specId}`).get();
  if (!specSnap.exists) throw new HttpsError('not-found', 'Diamond specification was not found.');
  const source = await sourceData(db);
  const spec = asRecord(specSnap.data());
  return buildAuditLine(specId, spec, source);
}

function buildAuditLine(specId: string, spec: RecordMap, source: Awaited<ReturnType<typeof sourceData>>): ReconciliationLine {
  const totals = emptyTotals();
  const problems = new Map<string, AuditProblem[]>();
  const allSpecIds = new Set([specId]);
  const projectIds = new Set(source.projects.map((row) => row.id));
  const bagById = new Map(source.bags.map((row) => [row.id, row.data]));
  const requestIds = new Set(source.requests.map((row) => row.id));
  const operationIds = new Set(source.operations.map((row) => row.id));
  const movementById = new Set(source.movements.map((row) => row.id));
  const issueByBag = new Map<string, number>();
  const returnByBag = new Map<string, number>();
  const correctedOperationIds = new Set<string>();

  source.operations.forEach((operation) => {
    if (text(operation.data.kind) === 'CORRECTION') correctedOperationIds.add(operation.id);
  });

  source.movements.forEach((movement) => {
    const data = movement.data;
    const category = movementCategory(text(data.type), text(data.actionType));
    const lines = Array.isArray(data.lines) ? data.lines.map(asRecord) : [];
    const operationId = text(data.operationId);
    if (operationId && !operationIds.has(operationId)) {
      lines.forEach((line) => line.specId === specId && problem(problems, specId, 'ORPHAN_OPERATION', `Movement ${movement.id} references a missing authoritative operation.`, `movements/${movement.id}`));
    }
    if (text(data.referenceProjectId) && !projectIds.has(text(data.referenceProjectId))) {
      lines.forEach((line) => line.specId === specId && problem(problems, specId, 'ORPHAN_PROJECT', `Movement ${movement.id} references a missing project.`, `movements/${movement.id}`));
    }
    if (text(data.referenceRequestId) && !requestIds.has(text(data.referenceRequestId))) {
      lines.forEach((line) => line.specId === specId && problem(problems, specId, 'ORPHAN_REQUEST', `Movement ${movement.id} references a missing request.`, `movements/${movement.id}`));
    }
    const bagNumber = text(data.referenceBagNumber);
    if (category === 'issue' && bagNumber) issueByBag.set(bagNumber, (issueByBag.get(bagNumber) || 0) + 1);
    if (category === 'return' && bagNumber) returnByBag.set(bagNumber, (returnByBag.get(bagNumber) || 0) + 1);
    lines.forEach((line) => {
      const lineSpecId = text(line.specId);
      if (!lineSpecId) return;
      allSpecIds.add(lineSpecId);
      if (lineSpecId !== specId) return;
      if (canonicalLocation(data.location) !== canonicalLocation(spec.location)) return;
      if (!number(line.averageWeightSnapshot) && number(line.pcs) > 0) totals.hasLegacyWeight = true;
      const delta = signedLine(category, line, data, spec);
      totals.pcs += delta.pcs;
      totals.ct = roundCarats(totals.ct + delta.ct);
      totals.movements += 1;
      switch (category) {
        case 'addition': totals.additionsPcs += delta.pcs; totals.additionsCt = roundCarats(totals.additionsCt + delta.ct); break;
        case 'issue': totals.issuesPcs += -delta.pcs; totals.issuesCt = roundCarats(totals.issuesCt - delta.ct); break;
        case 'return': totals.returnsPcs += delta.pcs; totals.returnsCt = roundCarats(totals.returnsCt + delta.ct); break;
        case 'breakage': totals.breakagePcs += -delta.pcs; totals.breakageCt = roundCarats(totals.breakageCt - delta.ct); break;
        case 'adjustment': totals.adjustmentsPcs += delta.pcs; totals.adjustmentsCt = roundCarats(totals.adjustmentsCt + delta.ct); break;
        case 'correction': totals.correctionsPcs += delta.pcs; totals.correctionsCt = roundCarats(totals.correctionsCt + delta.ct); break;
        default: problem(problems, specId, 'UNKNOWN_MOVEMENT_TYPE', `Movement ${movement.id} has an unrecognized inventory action.`, `movements/${movement.id}`);
      }
    });
  });

  source.bags.forEach((bag) => {
    const data = bag.data;
    if (text(data.projectId) && !projectIds.has(text(data.projectId))) {
      (Array.isArray(data.items) ? data.items.map(asRecord) : []).forEach((item) => {
        if (text(item.specId) === specId) problem(problems, specId, 'ORPHAN_BAG_PROJECT', `Bag ${bag.id} references a missing project.`, `bags/${bag.id}`);
      });
    }
    const bagNumber = text(data.bagNumber);
    const items = Array.isArray(data.items) ? data.items.map(asRecord) : [];
    items.forEach((item) => {
      if (text(item.specId) !== specId) return;
      if (bagNumber && (issueByBag.get(bagNumber) || 0) === 0) problem(problems, specId, 'MISSING_ISSUE_DEDUCTION', `Bag ${bagNumber} has issued items but no matching issue movement.`, `bags/${bag.id}`);
      if (bagNumber && (issueByBag.get(bagNumber) || 0) > 1) problem(problems, specId, 'DUPLICATE_ISSUE_DEDUCTION', `Bag ${bagNumber} has multiple issue movements.`, `bags/${bag.id}`);
      let returned = 0;
      let broken = 0;
      (Array.isArray(data.returns) ? data.returns.map(asRecord) : []).forEach((entry) => {
        if (text(entry.status) !== 'CONFIRMED') return;
        (Array.isArray(entry.lines) ? entry.lines.map(asRecord) : []).forEach((line) => {
          if (text(line.specId) === specId) returned += number(line.returnedPcs);
        });
        (Array.isArray(entry.confirmedBreakageLines) ? entry.confirmedBreakageLines.map(asRecord) : []).forEach((line) => {
          if (text(line.specId) === specId) broken += number(line.pieces);
        });
      });
      if (returned + broken > number(item.issuedPcs)) problem(problems, specId, 'IMPOSSIBLE_BAG_BALANCE', `Bag ${bagNumber || bag.id} returns/breakage exceed its issued quantity.`, `bags/${bag.id}`);
      if (returned > 0 && bagNumber && (returnByBag.get(bagNumber) || 0) === 0) problem(problems, specId, 'MISSING_RETURN_ADDITION', `Bag ${bagNumber} has a confirmed return but no matching return movement.`, `bags/${bag.id}`);
      if (bagNumber && (returnByBag.get(bagNumber) || 0) > 1) problem(problems, specId, 'DUPLICATE_RETURN_ADDITION', `Bag ${bagNumber} has multiple return movements.`, `bags/${bag.id}`);
    });
  });

  source.transactions.forEach((transaction) => {
    const data = transaction.data;
    if (text(data.specId) !== specId || text(data.status) === 'deleted') return;
    const sourcePath = text(data.sourceRecordPath);
    const sourceMovementId = sourcePath.startsWith('movements/') ? sourcePath.slice('movements/'.length) : '';
    if (!sourceMovementId || !movementById.has(sourceMovementId)) {
      problem(problems, specId, 'UNMATCHED_LEGACY_TRANSACTION', `Legacy ledger transaction ${transaction.id} is not linked to a movement and is excluded from expected stock.`, `diamond_transactions/${transaction.id}`);
    }
  });

  if (totals.hasLegacyWeight) problem(problems, specId, 'LEGACY_WEIGHT_UNVERIFIED', 'One or more historical lines have no immutable weight snapshot; carat evidence is not fully authoritative.', 'movements');
  if (totals.pcs < -EPSILON || totals.ct < -EPSILON) problem(problems, specId, 'NEGATIVE_TRANSACTION_STOCK', 'Transaction-derived stock is negative.', 'movements');
  if (number(spec.pcs) < -EPSILON || number(spec.ct) < -EPSILON) problem(problems, specId, 'NEGATIVE_CURRENT_STOCK', 'Current displayed stock is negative.', `specs/${specId}`);
  if (number(spec.pcs) > 0 && number(spec.ct) <= EPSILON) problem(problems, specId, 'PIECE_WEIGHT_INCONSISTENCY', 'Current stock has pieces but no carat weight.', `specs/${specId}`);

  const currentPcs = number(spec.pcs);
  const currentCt = roundCarats(number(spec.ct));
  const expectedPcs = Math.round(totals.pcs);
  const expectedCt = roundCarats(totals.ct);
  const expectedFromCurrentCatalog = roundCarats(expectedPcs * number(spec.ctPerStone));
  if (expectedPcs > 0 && Math.abs(expectedCt - expectedFromCurrentCatalog) > EPSILON) {
    problem(problems, specId, 'PIECE_WEIGHT_INCONSISTENCY', 'Transaction-derived pieces and carats use incompatible historical weights; the audit will not propose a correction.', 'movements');
  }
  const discrepancyPcs = currentPcs - expectedPcs;
  const discrepancyCt = roundCarats(currentCt - expectedCt);
  const latestOperation = text(spec.lastInventoryOperationId);
  const alreadyCorrected = Boolean(latestOperation && correctedOperationIds.has(latestOperation));
  const lineProblems = problems.get(specId) || [];
  if (totals.movements === 0 && (currentPcs > 0 || currentCt > EPSILON)) {
    lineProblems.push({ type: 'UNMATCHED_OPENING_BALANCE', detail: 'No transaction history explains this approved current balance; it is preserved as an opening-balance evidence gap.', sourceEvidence: `specs/${specId}` });
  }
  const mismatch = Math.abs(discrepancyPcs) > 0 || Math.abs(discrepancyCt) > EPSILON;
  if (mismatch && !alreadyCorrected) lineProblems.push({ type: 'DISPLAYED_VS_EXPECTED_MISMATCH', detail: `Current displayed stock differs from transaction-derived stock by ${discrepancyPcs} pcs / ${discrepancyCt.toFixed(6)} ct.`, sourceEvidence: `specs/${specId}` });
  if (alreadyCorrected) lineProblems.push({ type: 'ALREADY_CORRECTED', detail: 'The latest authoritative operation is a correction; this audit will not propose the same correction again.', sourceEvidence: `inventory_operations/${latestOperation}` });

  const primary = lineProblems[0] || { type: 'NO_DISCREPANCY', detail: 'Current displayed stock matches the available transaction evidence.' };
  const correctionAllowed = mismatch && !alreadyCorrected && lineProblems.every((item) => !['UNMATCHED_OPENING_BALANCE', 'LEGACY_WEIGHT_UNVERIFIED', 'ORPHAN_OPERATION', 'UNKNOWN_MOVEMENT_TYPE'].includes(item.type));
  const sourceEvidence = Array.from(new Set(lineProblems.flatMap((item) => item.sourceEvidence ? [item.sourceEvidence] : []))).slice(0, 25);
  const auditFingerprint = payloadHash({ specId, currentPcs, currentCt, expectedPcs, expectedCt, stockVersion: number(spec.stockVersion), sourceEvidence });
  return {
    specId,
    specLabel: text(spec.label) || specId,
    location: canonicalLocation(spec.location),
    currentPcs,
    currentCt,
    resolvedPcs: expectedPcs,
    resolvedCt: expectedCt,
    expectedPcs,
    expectedCt,
    openingPcs: null,
    openingCt: null,
    additionsPcs: totals.additionsPcs,
    additionsCt: totals.additionsCt,
    issuesPcs: totals.issuesPcs,
    issuesCt: totals.issuesCt,
    returnsPcs: totals.returnsPcs,
    returnsCt: totals.returnsCt,
    breakagePcs: totals.breakagePcs,
    breakageCt: totals.breakageCt,
    adjustmentsPcs: totals.adjustmentsPcs,
    adjustmentsCt: totals.adjustmentsCt,
    correctionsPcs: totals.correctionsPcs,
    correctionsCt: totals.correctionsCt,
    discrepancyPcs,
    discrepancyCt,
    type: primary.type,
    detail: primary.detail,
    autoRepairable: false,
    correctionAllowed,
    auditFingerprint,
    sourceEvidence,
  };
}

export const runInventoryReconciliationAudit = onCall(CALLABLE_OPTIONS, async (request) => {
  await requireManager(request);
  const input = asRecord(request.data);
  if (input.dryRun !== undefined && input.dryRun !== true) throw new HttpsError('invalid-argument', 'Phase 2 reconciliation audits are dry-run only.');
  const requestedLocation = input.location === undefined ? TORONTO_MELEE : canonicalLocation(input.location);
  if (requestedLocation !== TORONTO_MELEE) throw new HttpsError('invalid-argument', 'Phase 2 reconciliation currently supports Toronto Melee only.');
  const pageSize = typeof input.pageSize === 'number' && Number.isInteger(input.pageSize)
    ? Math.max(1, Math.min(MAX_PAGE_SIZE, input.pageSize))
    : MAX_PAGE_SIZE;
  const db = getFirestore();
  let query = db.collection('specs').orderBy(FieldPath.documentId()).limit(pageSize);
  const cursor = cursorFrom(input.cursor);
  if (input.cursor && !cursor) throw new HttpsError('invalid-argument', 'Invalid audit cursor.');
  if (cursor) query = query.startAfter(cursor) as typeof query;
  const specPage = await query.get();
  const source = await sourceData(db);
  const pagedSpecs = specPage.docs
    .filter((doc) => canonicalLocation(doc.data().location) === requestedLocation)
  const lines = pagedSpecs.map((doc) => buildAuditLine(doc.id, asRecord(doc.data()), source));
  // Unknown specs have no spec document to appear in the normal page. Surface
  // them once on the first page as evidence-only records; never invent stock.
  if (!cursor) {
    const knownSpecIds = new Set(source.specs.map((row) => row.id));
    const unknownSpecIds = new Set<string>();
    source.movements.forEach((movement) => {
      (Array.isArray(movement.data.lines) ? movement.data.lines.map(asRecord) : []).forEach((line) => {
        const id = text(line.specId);
        if (id && !knownSpecIds.has(id)) unknownSpecIds.add(id);
      });
    });
    unknownSpecIds.forEach((unknownSpecId) => {
      lines.push({
        specId: unknownSpecId,
        specLabel: `Unknown specification: ${unknownSpecId}`,
        location: requestedLocation,
        currentPcs: 0, currentCt: 0, resolvedPcs: 0, resolvedCt: 0, expectedPcs: 0, expectedCt: 0,
        openingPcs: null, openingCt: null,
        additionsPcs: 0, additionsCt: 0, issuesPcs: 0, issuesCt: 0, returnsPcs: 0, returnsCt: 0,
        breakagePcs: 0, breakageCt: 0, adjustmentsPcs: 0, adjustmentsCt: 0, correctionsPcs: 0, correctionsCt: 0,
        discrepancyPcs: 0, discrepancyCt: 0,
        type: 'UNKNOWN_SPECIFICATION', detail: 'A historical movement references a specification that no longer exists. It is excluded from correction.',
        autoRepairable: false, correctionAllowed: false,
        auditFingerprint: payloadHash({ unknownSpecId, type: 'UNKNOWN_SPECIFICATION' }),
        sourceEvidence: source.movements.filter((movement) => (Array.isArray(movement.data.lines) ? movement.data.lines : []).some((line) => text(asRecord(line).specId) === unknownSpecId)).map((movement) => `movements/${movement.id}`).slice(0, 25),
      });
    });
  }
  const issues = lines.filter((line) => line.type !== 'NO_DISCREPANCY' || Math.abs(line.discrepancyPcs) > 0 || Math.abs(line.discrepancyCt) > EPSILON);
  return {
    dryRun: true,
    location: requestedLocation,
    scannedSpecs: pagedSpecs.length,
    issues,
    lines,
    autoRepaired: [],
    needsManagerReview: issues,
    sourceCounts: {
      movements: source.movements.length,
      specs: source.specs.length,
      bags: source.bags.length,
      requests: source.requests.length,
      projects: source.projects.length,
      transactions: source.transactions.length,
      operations: source.operations.length,
      evidence: source.evidence.length,
    },
    nextCursor: specPage.size === pageSize ? encodeCursor(specPage.docs[specPage.docs.length - 1].id) : null,
  };
});
