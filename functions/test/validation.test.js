const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseBreakageLines,
  parseIssuedLines,
  parseRequestLines,
  parseReturnLines,
  payloadHash,
  requireOperationId,
  roundCarats,
} = require('../lib/inventory/validation');

test('payload hashes are stable across object key order', () => {
  assert.equal(payloadHash({ b: 2, a: 1 }), payloadHash({ a: 1, b: 2 }));
});

test('operation identifiers must be stable and sufficiently long', () => {
  assert.equal(requireOperationId('phase1_operation_0001'), 'phase1_operation_0001');
  assert.throws(() => requireOperationId('short'));
});

test('request lines accept positive whole pieces', () => {
  assert.deepEqual(parseRequestLines([{ specId: 'spec-1', requestedPcs: 100 }]), [{ specId: 'spec-1', requestedPcs: 100 }]);
});

test('request lines reject zero, fractions, and duplicate specs', () => {
  assert.throws(() => parseRequestLines([{ specId: 'spec-1', requestedPcs: 0 }]));
  assert.throws(() => parseRequestLines([{ specId: 'spec-1', requestedPcs: 1.5 }]));
  assert.throws(() => parseRequestLines([{ specId: 'spec-1', requestedPcs: 1 }, { specId: 'spec-1', requestedPcs: 2 }]));
});

test('issued lines preserve explicit removed lines', () => {
  assert.deepEqual(parseIssuedLines([{ sourceLineIndex: 0, specId: 'spec-1', issuedPcs: 0, explanation: 'Removed' }]), [
    { sourceLineIndex: 0, specId: 'spec-1', issuedPcs: 0, explanation: 'Removed' },
  ]);
});

test('issued lines reject duplicate source indexes', () => {
  assert.throws(() => parseIssuedLines([
    { sourceLineIndex: 0, specId: 'spec-1', issuedPcs: 1 },
    { sourceLineIndex: 0, specId: 'spec-2', issuedPcs: 1 },
  ]));
});

test('return lines require positive pieces and unique issued specs', () => {
  assert.deepEqual(parseReturnLines([{ specId: 'spec-1', returnedPcs: 2 }]), [{ specId: 'spec-1', returnedPcs: 2 }]);
  assert.throws(() => parseReturnLines([{ specId: 'spec-1', returnedPcs: 0 }]));
});

test('breakage may be empty but otherwise requires positive whole pieces', () => {
  assert.deepEqual(parseBreakageLines([], true), []);
  assert.throws(() => parseBreakageLines([{ specId: 'spec-1', pieces: -1 }], true));
});

test('carat arithmetic is normalized to six decimal places', () => {
  assert.equal(roundCarats(0.123456789), 0.123457);
});
