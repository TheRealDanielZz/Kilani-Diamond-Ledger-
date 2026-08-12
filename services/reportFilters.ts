import {
  Phase7FilterRequest,
  Phase7NormalizedRow,
  Phase7ReportSection,
  filterPhase7Rows,
  paginatePhase7Rows,
  sortPhase7Rows,
} from '../functions/src/reports/contract';

export interface ReportFilterState {
  search: string;
  selections: Record<string, string[]>;
  from: string;
  to: string;
  cursor: string | null;
}

export interface ReportFilterOption {
  value: string;
  label: string;
}

export interface ReportFilterDefinition {
  field: string;
  label: string;
  options: ReportFilterOption[];
}

export const EMPTY_REPORT_FILTER_STATE: ReportFilterState = {
  search: '',
  selections: {},
  from: '',
  to: '',
  cursor: null,
};

export function newReportFilterState(): ReportFilterState {
  return { ...EMPTY_REPORT_FILTER_STATE, selections: {} };
}

export function toggleReportSelection(
  state: ReportFilterState,
  field: string,
  value: string,
): ReportFilterState {
  const current = state.selections[field] || [];
  const next = current.includes(value)
    ? current.filter(item => item !== value)
    : [...current, value];
  const selections = { ...state.selections };
  if (next.length) selections[field] = next;
  else delete selections[field];
  return { ...state, selections, cursor: null };
}

export function removeReportSelection(
  state: ReportFilterState,
  field: string,
  value: string,
): ReportFilterState {
  const next = (state.selections[field] || []).filter(item => item !== value);
  const selections = { ...state.selections };
  if (next.length) selections[field] = next;
  else delete selections[field];
  return { ...state, selections, cursor: null };
}

export function clearReportFields(state: ReportFilterState, fields: string[]): ReportFilterState {
  const selections = { ...state.selections };
  fields.forEach(field => delete selections[field]);
  return { ...state, selections, cursor: null };
}

export function toPhase7Request(
  section: Phase7ReportSection,
  state: ReportFilterState,
  pageSize = 25,
): Phase7FilterRequest {
  return {
    section,
    search: state.search,
    selections: state.selections,
    dateRange: { from: state.from || undefined, to: state.to || undefined },
    cursor: state.cursor || undefined,
    pageSize,
  };
}

export function filterAndPageReportRows(
  rows: Phase7NormalizedRow[],
  section: Phase7ReportSection,
  state: ReportFilterState,
  pageSize = 25,
) {
  const request = toPhase7Request(section, state, pageSize);
  return paginatePhase7Rows(sortPhase7Rows(filterPhase7Rows(rows, request)), pageSize, state.cursor);
}

export function reportFilterCount(state: ReportFilterState): number {
  return Object.values(state.selections).reduce((sum, values) => sum + values.length, 0)
    + (state.search.trim() ? 1 : 0)
    + (state.from ? 1 : 0)
    + (state.to ? 1 : 0);
}

export function reportOptionLabel(
  definitions: ReportFilterDefinition[],
  field: string,
  value: string,
): string {
  const definition = definitions.find(item => item.field === field);
  return definition?.options.find(option => option.value === value)?.label || value;
}

/**
 * Synchronizes shared filter parameters (search, date range from/to)
 * from a source filter state into a target filter state, preserving
 * tab-specific selection filters.
 */
export function syncFilterSharedState(
  target: ReportFilterState,
  source: ReportFilterState,
): ReportFilterState {
  return {
    ...target,
    search: source.search,
    from: source.from,
    to: source.to,
    cursor: null, // Reset cursor on sync
  };
}

export function resetReportFilterState(state: ReportFilterState): ReportFilterState {
  return {
    ...EMPTY_REPORT_FILTER_STATE,
    selections: {},
  };
}

