const test = require('node:test');
const assert = require('node:assert/strict');
const { phase5Math } = require('../lib/projects/phase5');

test('internal supplier cost uses integer half-up arithmetic', () => {
  assert.equal(phase5Math.roundInternalCostCents(12_400, 4_150), 51_460);
  assert.equal(phase5Math.roundInternalCostCents(1, 500), 1);
  assert.equal(phase5Math.roundInternalCostCents(1, 499), 0);
});

test('client charge uses final weight, independent purity ppm, and no markup', () => {
  assert.equal(phase5Math.roundClientChargeCents(10_000, 417_000, 10_000), 41_700);
  assert.equal(phase5Math.roundClientChargeCents(10_000, 585_000, 10_000), 58_500);
});
