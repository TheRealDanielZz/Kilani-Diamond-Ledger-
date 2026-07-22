import { httpsCallable } from 'firebase/functions';
import { getBlob, ref, uploadString } from 'firebase/storage';
import { functions, storage } from './firebase';
import { BagItem, BagReturnTransaction, DiamondBag, DiamondSpec, IssueRequest, InventoryMovement } from '../types';

export interface FulfillmentPreviewSpec {
  id: string;
  label: string;
  shape: string;
  sizeMm: number;
  ctPerStone: number;
  location: 'TORONTO_MELEE';
  availablePcs: number;
  maximumIssuePcs: number;
  recommendedIssuePcs: number;
  availabilityState: 'UNINITIALIZED' | 'OUT_OF_STOCK' | 'PARTIAL' | 'AVAILABLE';
}

export interface FulfillmentPreview {
  requestId: string;
  specs: FulfillmentPreviewSpec[];
}

export interface PrivateInventoryContext {
  specs: DiamondSpec[];
  bags: DiamondBag[];
  requests: IssueRequest[];
}

export interface Phase1BootstrapAudit {
  canonicalLocation: 'TORONTO_MELEE';
  specsChecked: number;
  movementsChecked: number;
  evidenceChecked: number;
  blockers: Array<{ specId: string; label: string; problem: string }>;
  legacyEvidenceBlockers: Array<{ evidenceId: string; problem: string }>;
  ready: boolean;
  note: string;
}

export interface InventoryReconciliationLine {
  specId: string;
  specLabel: string;
  location: string;
  currentPcs: number;
  currentCt: number;
  resolvedPcs: number;
  resolvedCt: number;
  expectedPcs: number;
  expectedCt: number;
  discrepancyPcs: number;
  discrepancyCt: number;
  type: string;
  detail: string;
  autoRepairable: false;
  correctionAllowed: boolean;
  auditFingerprint: string;
  sourceEvidence: string[];
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
}

export interface InventoryReconciliationAudit {
  dryRun: true;
  location: 'TORONTO_MELEE';
  scannedSpecs: number;
  issues: InventoryReconciliationLine[];
  lines: InventoryReconciliationLine[];
  autoRepaired: [];
  needsManagerReview: InventoryReconciliationLine[];
  sourceCounts: Record<string, number>;
  nextCursor: string | null;
}

function call<Req extends Record<string, unknown>, Res>(name: string, payload: Req): Promise<Res> {
  return httpsCallable<Req, Res>(functions, name)(payload).then((result) => result.data);
}

export function newOperationId(): string {
  return crypto.randomUUID();
}

export async function uploadInventoryEvidence(input: {
  dataUrl: string;
  kind: 'issues' | 'returns';
  uploaderUid: string;
  operationId: string;
  projectId: string;
}): Promise<string> {
  const contentType = /^data:([^;,]+)[;,]/.exec(input.dataUrl)?.[1] || 'image/jpeg';
  if (!contentType.startsWith('image/')) throw new Error('Evidence must be an image.');
  const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const path = `evidence/${input.kind}/${input.uploaderUid}/${input.operationId}/original.${extension}`;
  const target = ref(storage, path);
  await uploadString(target, input.dataUrl, 'data_url', {
    contentType,
    customMetadata: {
      uploaderUid: input.uploaderUid,
      operationId: input.operationId,
      projectId: input.projectId,
      evidenceKind: input.kind,
    },
  });
  return path;
}

export async function getInventoryEvidenceUrl(storagePath: string): Promise<string> {
  const evidenceBlob = await getBlob(ref(storage, storagePath));
  return URL.createObjectURL(evidenceBlob);
}

export const inventoryApi = {
  ensureSecurityProfile: () => call<Record<string, never>, { userId: string; created: boolean; legacyProfileIds: string[] }>('ensureUidSecurityProfile', {}),
  getMyContext: () => call<Record<string, never>, PrivateInventoryContext>('getMyInventoryContext', {}),
  createRequest: (payload: { operationId: string; projectId: string; jobNumberSnapshot?: string; lines: Array<{ specId: string; requestedPcs: number }> }) =>
    call<typeof payload, { requestId: string; status: string }>('createInventoryRequest', payload),
  cancelRequest: (payload: { operationId: string; requestId: string }) =>
    call<typeof payload, { requestId: string; status: string }>('cancelInventoryRequest', payload),
  getFulfillmentPreview: (requestId: string) =>
    call<{ requestId: string }, FulfillmentPreview>('getFulfillmentPreview', { requestId }),
  confirmIssue: (payload: {
    operationId: string;
    requestId: string;
    bagNumber: string;
    issuedLines: Array<{ sourceLineIndex: number; specId: string; issuedPcs: number; explanation?: string }>;
    evidencePath?: string;
    imageSource?: 'Camera' | 'Device Gallery';
  }) => call<typeof payload, { requestId: string; bagId: string | null; movementId: string | null; status: string }>('confirmInventoryIssue', payload),
  submitReturn: (payload: {
    operationId: string;
    bagId: string;
    projectId: string;
    evidencePath: string;
    notes?: string;
    imageSource?: 'Camera' | 'Device Gallery';
    returnLines: Array<{ specId: string; returnedPcs: number }>;
  }) => call<typeof payload, { bagId: string; returnId: string; status: string }>('submitInventoryReturn', payload),
  confirmReturn: (payload: {
    operationId: string;
    bagId: string;
    returnId: string;
    returnLines: Array<{ specId: string; returnedPcs: number }>;
    breakageLines: Array<{ specId: string; pieces: number }>;
    breakageReason?: string;
  }) => call<typeof payload, { bagId: string; returnId: string; status: string }>('confirmInventoryReturn', payload),
  recordMovement: (payload: { operationId: string } & Partial<InventoryMovement>) =>
    call<Record<string, unknown>, { movementId: string; type: string }>('recordInventoryMovement', payload as Record<string, unknown>),
  applyCorrection: (payload: {
    operationId: string;
    specId: string;
    reason: string;
    mode: 'PCS' | 'WEIGHT';
    previousPcs: number;
    previousCt: number;
    targetPcs: number;
    targetCt: number;
    reconciliation?: {
      auditFingerprint: string;
      expectedPcs: number;
      expectedCt: number;
      sourceEvidence: string[];
    };
  }) => call<typeof payload, { movementId: string | null; specId: string; targetPcs: number; targetCt: number }>('applyInventoryCorrection', payload),
  runReconciliationAudit: (payload: { location?: 'TORONTO_MELEE'; dryRun: true; pageSize?: number; cursor?: string } = { dryRun: true }) =>
    call<typeof payload, InventoryReconciliationAudit>('runInventoryReconciliationAudit', payload),
  hardenLegacyEvidence: (apply = false) => call<{ apply: boolean }, {
    apply: boolean;
    candidateCount: number;
    migratedCount: number;
    failed: Array<{ evidenceId: string; reason: string }>;
  }>('hardenLegacyEvidenceAccess', { apply }),
  getBootstrapAudit: () => call<Record<string, never>, Phase1BootstrapAudit>('getPhase1BootstrapAudit', {}),
};

export function sanitizePrivateBagReturn(_return: BagReturnTransaction): BagReturnTransaction {
  return _return;
}

export function toBagItems(lines: Array<{ specId: string; issuedPcs: number }>): BagItem[] {
  return lines;
}
