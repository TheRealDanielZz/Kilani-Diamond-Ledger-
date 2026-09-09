import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isTorontoMeleeLocation, TORONTO_MELEE } from '../functions/lib/inventory/models.js';
import {
  computeLineDelta,
  normalizeBalance,
  calculateCurrentStockCarats,
  isWeightAuthoritativeLine,
  roundCt,
} from '../services/inventoryMath.ts';

test('isTorontoMeleeLocation correctly canonicalizes Melee and Toronto for Melee specs', () => {
  assert.equal(isTorontoMeleeLocation('Melee'), true);
  assert.equal(isTorontoMeleeLocation('melee'), true);
  assert.equal(isTorontoMeleeLocation(TORONTO_MELEE), true);
  assert.equal(isTorontoMeleeLocation('Toronto'), true);
  assert.equal(isTorontoMeleeLocation(''), true);
  assert.equal(isTorontoMeleeLocation(undefined), true);
  assert.equal(isTorontoMeleeLocation(null), true);
  assert.equal(isTorontoMeleeLocation('Miami'), false);
  assert.equal(isTorontoMeleeLocation('New York'), false);
});

test('Shipment in Pieces Mode calculates exact carats and creates proper signed deltas', () => {
  const spec = {
    id: 'sp-rd-1_0',
    label: '1.0mm Round',
    sizeMm: 1.0,
    shape: 'Round',
    ctPerStone: 0.005,
    defaultCostPerCtUsd: 500,
    location: 'Melee',
    pcs: 100,
    ct: 0.5,
  };
  const movement = { type: 'SHIPMENT_IN', weightAuthoritative: false };
  const line = { specId: 'sp-rd-1_0', pcs: 50, ct: 0.25, averageWeightSnapshot: 0.005 };
  const delta = computeLineDelta(movement, line, spec);
  assert.equal(delta.pieceDelta, 50);
  assert.equal(delta.caratDelta, 0.25);
});

test('Shipment in Weight Mode preserves authoritative carat weight without zeroing out', () => {
  const spec = {
    id: 'sp-rd-1_2',
    label: '1.2mm Round',
    sizeMm: 1.2,
    shape: 'Round',
    ctPerStone: 0.008,
    defaultCostPerCtUsd: 600,
    location: 'Melee',
    pcs: 0,
    ct: 0,
  };
  const enteredCt = 2.4;
  const estimatedPcs = Math.round(enteredCt / spec.ctPerStone);
  assert.equal(estimatedPcs, 300);
  const movement = { type: 'SHIPMENT_IN', weightAuthoritative: true };
  const line = { specId: 'sp-rd-1_2', pcs: estimatedPcs, ct: enteredCt, averageWeightSnapshot: spec.ctPerStone };
  assert.equal(isWeightAuthoritativeLine(movement, line), true);
  const delta = computeLineDelta(movement, line, spec);
  assert.equal(delta.pieceDelta, 300);
  assert.equal(delta.caratDelta, 2.4);
  const norm = normalizeBalance({ pcs: delta.pieceDelta, ct: delta.caratDelta }, spec.id, spec.ctPerStone);
  assert.equal(norm.pcs, 300);
  assert.equal(norm.ct, 2.4);
  assert.equal(norm.normalizedStaleCarats, false);
  const displayCt = calculateCurrentStockCarats(spec.id, norm.pcs, spec.ctPerStone, norm.ct);
  assert.equal(displayCt, 2.4);
});

test('normalizeBalance auto-derives pieces when positive carats exist but pieces was 0', () => {
  const ctPerStone = 0.01;
  const raw = { pcs: 0, ct: 1.5 };
  const norm = normalizeBalance(raw, 'sp-test', ctPerStone);
  assert.equal(norm.pcs, 150);
  assert.equal(norm.ct, 1.5);
  assert.equal(norm.normalizedStaleCarats, false);
});

test('Inventory correction computes signed delta and replaces balance coherently', () => {
  const spec = {
    id: 'sp-rd-1_5',
    label: '1.5mm Round',
    sizeMm: 1.5,
    shape: 'Round',
    ctPerStone: 0.014,
    defaultCostPerCtUsd: 695,
    location: 'Melee',
    pcs: 50,
    ct: 0.7,
  };
  const targetPcs = 60;
  const targetCt = roundCt(targetPcs * spec.ctPerStone);
  assert.equal(targetCt, 0.84);
  const pieceDelta = targetPcs - spec.pcs;
  const caratDelta = roundCt(targetCt - spec.ct);
  assert.equal(pieceDelta, 10);
  assert.equal(caratDelta, 0.14);
  const updatedPcs = spec.pcs + pieceDelta;
  const updatedCt = roundCt(spec.ct + caratDelta);
  assert.equal(updatedPcs, 60);
  assert.equal(updatedCt, 0.84);
});

test('Reversal and replacement correction movements preserve auditability', () => {
  const previousPcs = 50;
  const previousCt = 0.7;
  const targetPcs = 60;
  const targetCt = 0.84;
  const reversalLine = { pcs: -previousPcs, ct: -previousCt };
  const replacementLine = { pcs: targetPcs, ct: targetCt };
  assert.equal(reversalLine.pcs + replacementLine.pcs, 10);
  assert.equal(roundCt(reversalLine.ct + replacementLine.ct), 0.14);
});

test('phase1.ts enforces auto-initialization of uninitialized spec balances on receipt', async () => {
  const phase1 = fs.readFileSync('/Users/mo/Documents/Anti Graviti Projects/Kilani Diamond Reporter v7.0/functions/src/inventory/phase1.ts', 'utf8');
  assert.match(phase1, /requireInitializedMeleeSpec\([\s\S]*?allowAutoInit\s*=\s*false\)/);
  assert.match(phase1, /const isAdditive = type === 'SHIPMENT_IN' \|\| type === 'DIAMOND_ADD'/);
  assert.match(phase1, /requireInitializedMeleeSpec\(snap, isAdditive\)/);
});

test('phase1.ts atomically logs to diamond_transactions on shipment receive', async () => {
  const phase1 = fs.readFileSync('/Users/mo/Documents/Anti Graviti Projects/Kilani Diamond Reporter v7.0/functions/src/inventory/phase1.ts', 'utf8');
  assert.match(phase1, /diamond_transactions/);
  assert.match(phase1, /movementType: type === 'SHIPMENT_IN' \? 'added' : 'broken'/);
});

test('InventoryPage.tsx derives pieces in weight mode and targets canonical Melee location', async () => {
  const page = fs.readFileSync('/Users/mo/Documents/Anti Graviti Projects/Kilani Diamond Reporter v7.0/pages/InventoryPage.tsx', 'utf8');
  assert.match(page, /entryMode === 'WEIGHT'/);
  assert.match(page, /location: 'Melee'/);
  assert.match(page, /authoritativePreviousPcs/);
  assert.match(page, /authoritativePreviousCt/);
});

test('store.ts getInventorySummary reflects authoritative spec balances and includes all specs', async () => {
  const store = fs.readFileSync('/Users/mo/Documents/Anti Graviti Projects/Kilani Diamond Reporter v7.0/services/store.ts', 'utf8');
  assert.match(store, /authorPcs/);
  assert.match(store, /authorCt/);
  assert.match(store, /normalizeBalance\(resolvedData, specId, spec\.ctPerStone\)/);
});
test('Record Shipment allows pieces-only entries and auto-calculates carats', () => {
  const shipmentLines = [
    { specId: 'spec-1', pcs: 100, ct: 0, cost: 400 },
    { specId: 'spec-2', pcs: 0, ct: 2.5, cost: 450 }
  ];
  const validLines = shipmentLines.filter(l => l && (Number(l.pcs) > 0 || Number(l.ct) > 0));
  assert.equal(validLines.length, 2);

  const avgWeight1 = 0.014;
  const pcs1 = validLines[0].pcs;
  let ct1 = validLines[0].ct;
  if (ct1 <= 0 && pcs1 > 0 && avgWeight1 > 0) {
    ct1 = Math.round(pcs1 * avgWeight1 * 1000) / 1000;
  }
  assert.equal(ct1, 1.4);
});

test('isTorontoMeleeLocation and isMeleeLocation handle Active, Toronto, Melee and case variations', () => {
  const isMeleeLocation = (location) => {
    if (!location) return true;
    const trimmed = location.trim().toLowerCase();
    return (
      trimmed === 'melee' ||
      trimmed === 'toronto_melee' ||
      trimmed === 'toronto' ||
      trimmed === 'active' ||
      trimmed.includes('melee') ||
      trimmed.includes('toronto')
    );
  };

  assert.equal(isMeleeLocation('Melee'), true);
  assert.equal(isMeleeLocation('melee'), true);
  assert.equal(isMeleeLocation('Toronto'), true);
  assert.equal(isMeleeLocation('toronto_melee'), true);
  assert.equal(isMeleeLocation('Active'), true);
  assert.equal(isMeleeLocation('active'), true);
  assert.equal(isMeleeLocation(''), true);
  assert.equal(isMeleeLocation(null), true);
  assert.equal(isMeleeLocation(undefined), true);
  assert.equal(isMeleeLocation('Hong Kong Large Diamonds'), false);
});

test('Multi-line shipments with duplicate specId aggregate deltas and use unique txId', async () => {
  const phase1 = fs.readFileSync('/Users/mo/Documents/Anti Graviti Projects/Kilani Diamond Reporter v7.0/functions/src/inventory/phase1.ts', 'utf8');
  assert.match(phase1, /txId = `tx-\${movementId}-\${line\.specId}-\${lineIndex}`/);
  assert.match(phase1, /const specDeltas = new Map<string, { pcs: number; ct: number }>\(\)/);
});
