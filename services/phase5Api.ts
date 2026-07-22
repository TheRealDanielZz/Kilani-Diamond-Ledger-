import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface ComponentWeightInput { revisionId: string; weightMg: number }

async function call<TInput, TResult>(name: string, payload: TInput): Promise<TResult> {
  return (await httpsCallable<TInput, TResult>(functions, name)(payload)).data;
}

export function reviseMetalComponent(payload: {
  operationId: string; projectId: string; revisionId: string; reason: string;
  expectedVersion: number; label: string; metal: string; purity: string;
}) {
  return call<typeof payload, { projectId: string; componentId: string; revisionId: string; version: number }>('reviseMetalComponent', payload);
}

export function recordCastingReceipt(payload: {
  operationId: string; projectId: string; condition: 'CORRECT' | 'DAMAGED' | 'INCORRECT';
  notes: string; weights: ComponentWeightInput[];
}) {
  return call<typeof payload, { projectId: string; castingEventId: string }>('recordCastingReceipt', payload);
}

export function dispatchCastingPhase5(payload: { operationId: string; projectId: string; revisionIds: string[] }) {
  return call<typeof payload, { projectId: string; castingEventId: string; designStage: string }>('dispatchCastingPhase5', payload);
}

export function confirmInternalCastingCost(payload: {
  operationId: string; projectId: string; revisionId: string; supplierRateCentsPerGram: number;
}) {
  return call<typeof payload, { projectId: string; revisionId: string; recordId: string; amountCents: number }>('confirmInternalCastingCost', payload);
}

export function correctInternalCastingCost(payload: {
  operationId: string; projectId: string; revisionId: string; reason: string;
  castingWeightMg: number; supplierRateCentsPerGram: number;
}) {
  return call<typeof payload, { projectId: string; revisionId: string; reversalId: string; replacementId: string; amountCents: number }>('correctInternalCastingCost', payload);
}

export function recordFinalComponentWeights(payload: {
  operationId: string; projectId: string; weights: ComponentWeightInput[];
}) {
  return call<typeof payload, { projectId: string; weights: Array<{ revisionId: string; finalWeightMg: number; productionVarianceMg: number }> }>('recordFinalComponentWeights', payload);
}

export function confirmProjectPickupPhase5(payload: {
  operationId: string; projectId: string; actualPickupDate: string; lateEntryReason?: string;
}) {
  return call<typeof payload, { projectId: string; actualPickupDate: string; totalClientGoldChargeCents: number; priceCentsPerGram: number }>('confirmProjectPickupPhase5', payload);
}

export function revertProjectToActivePhase5(payload: { operationId: string; projectId: string }) {
  return call<typeof payload, { projectId: string; status: 'Active' }>('revertProjectToActivePhase5', payload);
}
