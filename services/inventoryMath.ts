// ============================================================================
// inventoryMath.ts — Single source of truth for diamond inventory balance math.
//
// This module centralises every rule that ties PIECES and CARATS together so
// that piece quantity and carat weight can never drift apart. It is pure
// (no Firebase, no React) so it can be unit-tested in isolation and reused by
// the store, the reconciliation script, and the test harness.
//
// Core invariants enforced here (see also REQUIRED DATA INVARIANTS in spec):
//   • Carats for a piece-based movement are ALWAYS pieces × averageWeightSnapshot
//     captured at write time — never recomputed from the live catalog.
//   • When a spec's piece balance resolves to 0, its carat balance resolves to
//     exactly 0 (except the carat-only MIXED-UNSORTED bucket).
//   • Harmless floating-point residue is normalised to 0 using a small epsilon.
//   • Balances are never allowed to silently go negative.
// ============================================================================

import { InventoryMovementType, InventoryLine, InventoryMovement, DiamondSpec } from '../types';

/** The carat-only bucket used for unsorted mixed returns. It legitimately has
 *  0 pieces but a positive carat weight, so it is exempt from the
 *  "0 pieces ⇒ 0 carats" rule. */
export const MIXED_UNSORTED_SPEC_ID = 'MIXED-UNSORTED';

/** Carats are displayed to 3 decimals. Any residual balance smaller than half
 *  of the last displayed digit is pure floating-point noise and is normalised
 *  to zero. This tolerance is ONLY for harmless float residue — it must never
 *  be widened to paper over real inventory discrepancies. */
export const CT_EPSILON = 0.0005;

/** Pieces are whole numbers; anything below this magnitude is float noise. */
export const PCS_EPSILON = 1e-6;

/** Round a carat value to full internal precision (6 dp) to strip binary
 *  floating-point artefacts while preserving all meaningful weight. Display
 *  rounding (3 dp) happens separately in the UI — never here. */
export function roundCt(ct: number): number {
  if (!isFinite(ct)) return 0;
  return Math.round(ct * 1e6) / 1e6;
}

/** Movement types whose stored line deltas are ADDED as-is (sign preserved).
 *  SHIPMENT_IN / RETURN / etc. store positive magnitudes that increase stock.
 *  MANUAL_ADJUSTMENT and INVENTORY_CORRECTION store ALREADY-SIGNED deltas
 *  (pieces/carats may be negative) and must pass through without a sign flip.
 *  Everything else (ISSUE, BROKEN_OUT) stores positive magnitudes that reduce
 *  stock and therefore gets a negative sign. */
export function isAdditiveMovement(type?: InventoryMovementType): boolean {
  return (
    type === InventoryMovementType.SHIPMENT_IN ||
    type === InventoryMovementType.RETURN ||
    type === InventoryMovementType.RETURN_MIXED ||
    type === InventoryMovementType.BULK_RETURN_INTAKE ||
    type === InventoryMovementType.MANUAL_ADJUSTMENT ||
    type === InventoryMovementType.INVENTORY_CORRECTION
  );
}

/**
 * Resolve the authoritative average weight (ct per stone) for a movement line.
 * Priority:
 *   1. The snapshot persisted on the line at write time (immutable history).
 *   2. The spec's current catalog weight (only for pre-snapshot legacy lines).
 * This is what makes catalog edits non-retroactive: once a line has a snapshot,
 * changing the catalog can never alter its historical carats.
 */
export function resolveAvgWeight(line: InventoryLine, spec?: DiamondSpec): number {
  if (typeof line.averageWeightSnapshot === 'number' && line.averageWeightSnapshot > 0) {
    return line.averageWeightSnapshot;
  }
  return spec?.ctPerStone || 0;
}

/**
 * Compute the signed piece and carat delta a single movement line contributes
 * to a spec's running balance.
 *
 * Weight-based lines preserve their EXACT entered carat weight as authoritative.
 * Piece-based lines derive carats from pieces × snapshot weight so the two can
 * never diverge. The sign is decided by the movement type.
 */
export function computeLineDelta(
  movement: Pick<InventoryMovement, 'type'>,
  line: InventoryLine,
  spec?: DiamondSpec
): { pieceDelta: number; caratDelta: number } {
  const avgWeight = resolveAvgWeight(line, spec);
  const pcs = line.pcs || 0;

  // Determine the line's absolute carat magnitude.
  // Prefer an explicitly stored exact weight (weight-priority entry); otherwise
  // derive from pieces × snapshot weight (piece-priority entry).
  let ct: number;
  if (line.ct !== undefined && line.ct !== null) {
    ct = line.ct;
  } else {
    ct = line.specId === MIXED_UNSORTED_SPEC_ID ? 0 : pcs * avgWeight;
  }

  const sign = isAdditiveMovement(movement.type) ? 1 : -1;
  return {
    pieceDelta: sign * pcs,
    caratDelta: roundCt(sign * ct),
  };
}

export interface RawBalance {
  pcs: number;
  ct: number;
}

export interface NormalizedBalance {
  pcs: number;
  ct: number;
  /** True if the raw summed pieces were meaningfully negative (data problem). */
  negativePieces: boolean;
  /** True if the raw summed carats were meaningfully negative (data problem). */
  negativeCarats: boolean;
  /** True if a stale non-zero carat residue was normalised away at 0 pieces. */
  normalizedStaleCarats: boolean;
}

/**
 * Apply all display/aggregation invariants to a raw (pcs, ct) sum.
 *
 *   • 0 pieces  ⇒ 0 carats (except MIXED-UNSORTED, the carat-only bucket).
 *   • Negative balances are clamped to 0 for display and flagged.
 *   • Sub-epsilon carat residue is normalised to exactly 0.
 *
 * The flags let callers (reconciliation, audits) distinguish harmless float
 * cleanup from genuine discrepancies that need manager review.
 */
export function normalizeBalance(raw: RawBalance, specId?: string): NormalizedBalance {
  const isMixed = specId === MIXED_UNSORTED_SPEC_ID;

  let pcs = raw.pcs;
  let ct = roundCt(raw.ct);

  const negativePieces = pcs < -PCS_EPSILON;
  const negativeCarats = ct < -CT_EPSILON;

  // Snap piece float noise to whole numbers / zero.
  if (Math.abs(pcs) < PCS_EPSILON) pcs = 0;
  pcs = Math.round(pcs);

  let normalizedStaleCarats = false;

  if (!isMixed) {
    if (pcs <= 0) {
      // 0 (or negative) pieces ⇒ carats MUST resolve to exactly 0.
      if (Math.abs(ct) > CT_EPSILON) normalizedStaleCarats = true;
      pcs = Math.max(0, pcs);
      ct = 0;
    } else {
      // Pieces remain: strip harmless float residue, never allow negative carats.
      if (Math.abs(ct) < CT_EPSILON) ct = 0;
      if (ct < 0) ct = 0;
    }
  } else {
    // Carat-only bucket: pieces are always 0; just clean float noise on carats.
    if (Math.abs(ct) < CT_EPSILON) ct = 0;
    if (ct < 0) ct = 0;
    pcs = 0;
  }

  return { pcs, ct, negativePieces, negativeCarats, normalizedStaleCarats };
}

/** Estimated value from a normalised carat balance. 0 carats ⇒ $0, always. */
export function estimatedValue(ct: number, costPerCtUsd: number): number {
  if (ct <= CT_EPSILON) return 0;
  return roundCt(ct * (costPerCtUsd || 0));
}
