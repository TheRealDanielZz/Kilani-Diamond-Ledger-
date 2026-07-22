import { Timestamp } from 'firebase-admin/firestore';

export const TORONTO_MELEE = 'TORONTO_MELEE' as const;

export type InventoryOperationKind =
  | 'REQUEST_CREATE'
  | 'REQUEST_CANCEL'
  | 'ISSUE'
  | 'RETURN_SUBMIT'
  | 'RETURN_CONFIRM'
  | 'BREAKAGE'
  | 'RECEIPT'
  | 'CORRECTION';

export interface UserProfile {
  id?: string;
  authUid?: string;
  name?: string;
  email?: string;
  role?: string;
  active?: boolean;
  legacyProfileIds?: string[];
  securityProfileVersion?: number;
}

export interface RequestLine {
  specId: string;
  requestedPcs: number;
}

export interface IssuedLineInput {
  sourceLineIndex: number;
  specId: string;
  issuedPcs: number;
  explanation?: string;
}

export interface BagItem {
  specId: string;
  issuedPcs: number;
  averageWeightSnapshot?: number;
}

export interface ReturnLineInput {
  specId: string;
  returnedPcs: number;
}

export interface BreakageLineInput {
  specId: string;
  pieces: number;
}

export interface InventorySpec {
  id?: string;
  label?: string;
  shape?: string;
  sizeMm?: number;
  ctPerStone?: number;
  defaultCostPerCtUsd?: number;
  location?: string;
  pcs?: number;
  ct?: number;
  active?: boolean;
}

export interface InventoryOperation {
  operationId: string;
  kind: InventoryOperationKind;
  payloadHash: string;
  actorUid: string;
  status: 'COMMITTED';
  createdAt: Timestamp;
  result: Record<string, unknown>;
}

export interface ProjectUsageLine {
  issuedPcs: number;
  returnedPcs: number;
  brokenPcs: number;
  netUsedPcs: number;
  averageWeightSnapshot: number;
}

export interface ProjectInventoryUsage {
  bySpec: Record<string, ProjectUsageLine>;
  updatedAt?: Timestamp;
  lastOperationId?: string;
}

export function isTorontoMeleeLocation(location: unknown): boolean {
  return location === undefined || location === null || location === '' || location === 'Melee' || location === TORONTO_MELEE;
}

