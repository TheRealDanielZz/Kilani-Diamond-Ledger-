const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PHASE9_FEATURE_MESSAGE,
  PHASE9_READINESS_SCORE,
  phase9SetterBagContext,
  phase9StableHash,
} = require('../lib/analytics/phase9.js');

test('stable Phase 9 identifiers do not depend on object key order', () => {
  assert.equal(
    phase9StableHash({ projectId: 'P1', setterUid: 'S1' }),
    phase9StableHash({ setterUid: 'S1', projectId: 'P1' })
  );
});

test('bag context uses trusted issue time and only Manager-confirmed breakage', () => {
  const result = phase9SetterBagContext('bag-1', {
    bagNumber: 'B-100',
    projectId: 'project-1',
    issuedToId: 'setter-1',
    issuedAt: '2026-07-01T00:00:00.000Z',
    serverIssuedAt: '2026-07-02T00:00:00.000Z',
    status: 'Returned_Pending_Count',
    returns: [
      {
        status: 'PENDING',
        setterEstimatedPcs: 99,
        confirmedBreakageLines: [{ pieces: 50 }],
      },
      {
        status: 'CONFIRMED',
        setterEstimatedPcs: 100,
        confirmedBreakageLines: [{ pieces: 2 }, { pieces: 3 }],
      },
    ],
  }, new Date('2026-07-05T12:00:00.000Z'));

  assert.equal(result.issueDate, '2026-07-02T00:00:00.000Z');
  assert.equal(result.issueTimingQuality, 'server_confirmed');
  assert.equal(result.daysHeld, 3);
  assert.equal(result.pendingReturn, true);
  assert.equal(result.confirmedBrokenPieces, 5);
});

test('missing bag issue time remains blank and is never estimated', () => {
  const result = phase9SetterBagContext('bag-2', {
    bagNumber: 'B-200',
    projectId: 'project-2',
    issuedToId: 'setter-2',
    status: 'Issued',
  }, new Date('2026-07-05T12:00:00.000Z'));
  assert.equal(result.issueDate, null);
  assert.equal(result.issueTimingQuality, 'unavailable');
  assert.equal(result.daysHeld, null);
  assert.equal(result.confirmedBrokenPieces, 0);
});

test('future feature contract remains disabled and readiness is diagnostic only', () => {
  assert.equal(PHASE9_FEATURE_MESSAGE, 'Setter analytics will be available in a future update.');
  assert.equal(PHASE9_READINESS_SCORE, 62);
});
