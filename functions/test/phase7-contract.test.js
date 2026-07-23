const test = require('node:test');
const assert = require('node:assert/strict');
const {
  escapePhase7CsvCell,
  filterPhase7Rows,
  matchesPhase7Search,
  paginatePhase7Rows,
  renderPhase7Csv,
  sanitizePhase7Selections,
  sortPhase7Rows,
} = require('../lib/reports/contract');

const rows = [
  {
    id: 'b',
    searchText: 'P-200 Ada ring Noor',
    dateValue: '2026-07-21T12:00:00.000Z',
    fields: { service: 'REPAIR', status: 'Active', repairFlag: ['NO_CHARGE', 'ACTIVE_REPAIR'] },
    data: { code: 'P-200' },
  },
  {
    id: 'a',
    searchText: 'P-100 Amiyah necklace Akrm',
    dateValue: '2026-07-22T12:00:00.000Z',
    fields: { service: 'CUSTOM_MAKE', status: 'Active', repairFlag: [] },
    data: { code: 'P-100' },
  },
  {
    id: 'c',
    searchText: 'P-300 Alayah bracelet Noor',
    dateValue: '2026-07-20T12:00:00.000Z',
    fields: { service: 'REPAIR', status: 'Closed', repairFlag: ['OUTSOURCED'] },
    data: { code: 'P-300' },
  },
];

test('OR is applied within one field and AND across fields', () => {
  const selected = filterPhase7Rows(rows, {
    selections: {
      service: ['REPAIR', 'CUSTOM_MAKE'],
      status: ['Active'],
    },
  });
  assert.deepEqual(selected.map(row => row.id).sort(), ['a', 'b']);

  const flags = filterPhase7Rows(rows, {
    selections: { service: ['REPAIR'], repairFlag: ['NO_CHARGE', 'OUTSOURCED'] },
  });
  assert.deepEqual(flags.map(row => row.id).sort(), ['b', 'c']);
});

test('search, selections, and date ranges compose with AND semantics', () => {
  assert.equal(matchesPhase7Search('Amiyha necklce', rows[1].searchText), true);
  const result = filterPhase7Rows(rows, {
    search: 'Noor',
    selections: { service: ['REPAIR'] },
    dateRange: { from: '2026-07-21', to: '2026-07-22' },
  });
  assert.deepEqual(result.map(row => row.id), ['b']);
});

test('sorting and cursor pagination are stable and deterministic', () => {
  const sorted = sortPhase7Rows(rows);
  assert.deepEqual(sorted.map(row => row.id), ['a', 'b', 'c']);
  const first = paginatePhase7Rows(sorted, 2);
  assert.deepEqual(first.rows.map(row => row.id), ['a', 'b']);
  assert.equal(first.total, 3);
  assert.equal(first.nextCursor, 'p7:2');
  const second = paginatePhase7Rows(sorted, 2, first.nextCursor);
  assert.deepEqual(second.rows.map(row => row.id), ['c']);
  assert.equal(second.nextCursor, null);
});

test('CSV escaping preserves commas, quotes, and line breaks', () => {
  assert.equal(escapePhase7CsvCell('A, "B"'), '"A, ""B"""');
  const csv = renderPhase7Csv([{ code: 'P-1', notes: 'first,\n"second"' }], ['code', 'notes']);
  assert.match(csv, /"first,\n""second"""/);
  assert.equal(csv.split('\r\n').length, 2);
});

test('untrusted selection input is normalized and bounded', () => {
  assert.deepEqual(sanitizePhase7Selections({
    service: ['REPAIR', 'REPAIR', 7],
    bad: 'CUSTOM_MAKE',
  }), { service: ['REPAIR'] });
});
