export type Phase7ReportSection =
  | 'PROJECT_HISTORY'
  | 'WEEKLY_MOVEMENT'
  | 'INVENTORY_LEDGER'
  | 'BROKEN_STONES'
  | 'SYSTEM_LOGS'
  | 'ALL_PROJECTS'
  | 'REQUESTS'
  | 'RETURNS';

export interface Phase7DateRange {
  from?: string;
  to?: string;
}

export interface Phase7FilterRequest {
  section: Phase7ReportSection;
  search?: string;
  selections?: Record<string, string[]>;
  dateRange?: Phase7DateRange;
  pageSize?: number;
  cursor?: string;
}

export interface Phase7NormalizedRow {
  id: string;
  searchText: string;
  dateValue?: string;
  sortValue?: string | number;
  fields: Record<string, string | string[] | number | boolean | null | undefined>;
  data: Record<string, unknown>;
}

export interface Phase7Page<T = Record<string, unknown>> {
  rows: T[];
  total: number;
  nextCursor: string | null;
  pageSize: number;
}

export const PHASE7_DEFAULT_PAGE_SIZE = 25;
export const PHASE7_MAX_PAGE_SIZE = 100;

const SECTION_SET = new Set<Phase7ReportSection>([
  'PROJECT_HISTORY',
  'WEEKLY_MOVEMENT',
  'INVENTORY_LEDGER',
  'BROKEN_STONES',
  'SYSTEM_LOGS',
  'ALL_PROJECTS',
  'REQUESTS',
  'RETURNS',
]);

export function isPhase7ReportSection(value: unknown): value is Phase7ReportSection {
  return typeof value === 'string' && SECTION_SET.has(value as Phase7ReportSection);
}

export function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function editDistance(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

export function matchesPhase7Search(query: unknown, target: unknown): boolean {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;
  const normalizedTarget = normalizeText(target);
  if (normalizedTarget.includes(normalizedQuery)) return true;
  if (normalizedQuery.length <= 3) return false;
  const targetWords = normalizedTarget.split(' ');
  return normalizedQuery.split(' ').every(queryWord =>
    targetWords.some(targetWord => {
      if (targetWord.includes(queryWord)) return true;
      if (queryWord.length <= 3 || targetWord.length <= 3) return false;
      return editDistance(queryWord, targetWord) <= (queryWord.length > 5 ? 2 : 1);
    })
  );
}

function asComparableValues(value: Phase7NormalizedRow['fields'][string]): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter(item => item !== null && item !== undefined)
    .map(item => normalizeText(item));
}

export function matchesPhase7Selections(
  row: Phase7NormalizedRow,
  selections: Record<string, string[]> = {},
): boolean {
  return Object.entries(selections).every(([field, selected]) => {
    const normalizedSelected = selected.map(normalizeText).filter(Boolean);
    if (!normalizedSelected.length) return true;
    const rowValues = asComparableValues(row.fields[field]);
    return normalizedSelected.some(value => rowValues.includes(value));
  });
}

function startOfDay(value: string): number | null {
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : null;
}

function endOfDay(value: string): number | null {
  const time = new Date(`${value}T23:59:59.999`).getTime();
  return Number.isFinite(time) ? time : null;
}

export function matchesPhase7Date(dateValue: unknown, range?: Phase7DateRange): boolean {
  if (!range?.from && !range?.to) return true;
  const rowTime = new Date(String(dateValue || '')).getTime();
  if (!Number.isFinite(rowTime)) return false;
  const from = range.from ? startOfDay(range.from) : null;
  const to = range.to ? endOfDay(range.to) : null;
  if (from !== null && rowTime < from) return false;
  if (to !== null && rowTime > to) return false;
  return true;
}

export function filterPhase7Rows(
  rows: Phase7NormalizedRow[],
  request: Pick<Phase7FilterRequest, 'search' | 'selections' | 'dateRange'>,
): Phase7NormalizedRow[] {
  return rows.filter(row =>
    matchesPhase7Search(request.search, row.searchText)
    && matchesPhase7Selections(row, request.selections)
    && matchesPhase7Date(row.dateValue, request.dateRange)
  );
}

function sortable(value: string | number | undefined): number | string {
  if (typeof value === 'number') return value;
  const date = new Date(String(value || '')).getTime();
  if (Number.isFinite(date)) return date;
  return normalizeText(value);
}

export function sortPhase7Rows(rows: Phase7NormalizedRow[]): Phase7NormalizedRow[] {
  return [...rows].sort((a, b) => {
    const left = sortable(a.sortValue ?? a.dateValue);
    const right = sortable(b.sortValue ?? b.dateValue);
    if (left < right) return 1;
    if (left > right) return -1;
    return a.id.localeCompare(b.id);
  });
}

export interface Phase8SortableProject {
  id: string;
  priority?: unknown;
  dueDate?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
}

function validDateTime(value: unknown): number | null {
  const time = new Date(String(value || '')).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * Phase 8 project order:
 * Rush first, nearest valid due date, newest update, then stable project ID.
 * Legacy projects without a trustworthy due date remain after dated projects.
 */
export function comparePhase8Projects(left: Phase8SortableProject, right: Phase8SortableProject): number {
  const leftRush = String(left.priority || '').toLowerCase() === 'rush';
  const rightRush = String(right.priority || '').toLowerCase() === 'rush';
  if (leftRush !== rightRush) return leftRush ? -1 : 1;

  const leftDue = validDateTime(left.dueDate);
  const rightDue = validDateTime(right.dueDate);
  if (leftDue !== null && rightDue !== null && leftDue !== rightDue) return leftDue - rightDue;
  if ((leftDue !== null) !== (rightDue !== null)) return leftDue !== null ? -1 : 1;

  const leftUpdated = validDateTime(left.updatedAt) ?? validDateTime(left.createdAt) ?? 0;
  const rightUpdated = validDateTime(right.updatedAt) ?? validDateTime(right.createdAt) ?? 0;
  if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;

  return String(left.id || '').localeCompare(String(right.id || ''));
}

export function encodePhase7Cursor(offset: number): string {
  return `p7:${offset}`;
}

export function decodePhase7Cursor(cursor: unknown): number {
  if (typeof cursor !== 'string' || !cursor) return 0;
  const match = /^p7:(\d+)$/.exec(cursor);
  if (!match) return 0;
  const offset = Number(match[1]);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
}

export function paginatePhase7Rows(
  rows: Phase7NormalizedRow[],
  pageSizeInput?: unknown,
  cursor?: unknown,
): Phase7Page<Phase7NormalizedRow> {
  const requested = Number(pageSizeInput || PHASE7_DEFAULT_PAGE_SIZE);
  const pageSize = Number.isInteger(requested)
    ? Math.min(PHASE7_MAX_PAGE_SIZE, Math.max(1, requested))
    : PHASE7_DEFAULT_PAGE_SIZE;
  const offset = decodePhase7Cursor(cursor);
  const pageRows = rows.slice(offset, offset + pageSize);
  const nextOffset = offset + pageRows.length;
  return {
    rows: pageRows,
    total: rows.length,
    nextCursor: nextOffset < rows.length ? encodePhase7Cursor(nextOffset) : null,
    pageSize,
  };
}

export function escapePhase7CsvCell(value: unknown): string {
  const serialized = value === null || value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
  return `"${serialized.replace(/"/g, '""')}"`;
}

export function renderPhase7Csv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(escapePhase7CsvCell).join(',');
  const body = rows.map(row => columns.map(column => escapePhase7CsvCell(row[column])).join(','));
  return [header, ...body].join('\r\n');
}

export function sanitizePhase7Selections(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, selected]) => Array.isArray(selected))
      .map(([field, selected]) => [
        field,
        [...new Set((selected as unknown[]).filter(item => typeof item === 'string').map(String))].slice(0, 30),
      ])
      .filter(([, selected]) => selected.length > 0)
  );
}
