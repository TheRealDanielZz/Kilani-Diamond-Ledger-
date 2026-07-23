import React, { useRef } from 'react';
import { CalendarDays, Check, ChevronDown, Search, X } from 'lucide-react';
import './report-filter-date.css';
import {
  ReportFilterDefinition,
  ReportFilterState,
  newReportFilterState,
  removeReportSelection,
  reportFilterCount,
  reportOptionLabel,
  toggleReportSelection,
} from '../../services/reportFilters';

interface MultiSelectFilterProps {
  definition: ReportFilterDefinition;
  selected: string[];
  onToggle: (value: string) => void;
}

const MultiSelectFilter: React.FC<MultiSelectFilterProps> = ({ definition, selected, onToggle }) => (
  <details className="relative group open:z-50">
    <summary
      className="list-none min-h-11 px-4 py-2.5 rounded-2xl border border-theme-border bg-theme-input-bg text-sm text-theme-text-primary cursor-pointer flex items-center justify-between gap-3 transition-colors hover:bg-theme-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold"
      aria-label={`${definition.label} filter`}
    >
      <span className="truncate">
        {selected.length ? `${definition.label} (${selected.length})` : definition.label}
      </span>
      <ChevronDown size={15} className="shrink-0 transition-transform group-open:rotate-180" />
    </summary>
    <div className="absolute inset-x-0 z-[70] mt-2 min-w-56 max-h-72 overflow-y-auto overscroll-contain rounded-2xl border border-theme-border bg-surface-raised shadow-[0_18px_50px_rgba(0,0,0,0.45)] p-2">
      {definition.options.map(option => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onToggle(option.value)}
            className="w-full min-h-11 px-3 py-2 rounded-xl flex items-center gap-3 text-left text-sm hover:bg-theme-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold"
            aria-pressed={active}
          >
            <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${active ? 'bg-lux-gold border-lux-gold text-black' : 'border-theme-border text-transparent'}`}>
              <Check size={13} />
            </span>
            <span className="text-theme-text-primary">{option.label}</span>
          </button>
        );
      })}
    </div>
  </details>
);

interface DateFilterProps {
  label: 'From' | 'To';
  value: string;
  onChange: (value: string) => void;
}

const DateFilter: React.FC<DateFilterProps> = ({ label, value, onChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    try {
      input.showPicker?.();
    } catch {
      // Browsers that do not expose showPicker still open their native picker on click.
      input.focus();
      input.click();
    }
  };

  return (
    <label className="text-[10px] uppercase tracking-wider text-theme-text-muted">
      {label}
      <div className="relative mt-1">
        <input
          ref={inputRef}
          type="date"
          value={value}
          onChange={event => onChange(event.target.value)}
          aria-label={`${label} date`}
          className="report-filter-date-input w-full min-h-11 bg-theme-input-bg border border-theme-border rounded-2xl pl-3 pr-12 text-sm text-theme-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold"
        />
        <button
          type="button"
          onClick={openPicker}
          className="absolute right-1 top-1 min-w-9 min-h-9 rounded-xl text-lux-gold hover:bg-lux-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold flex items-center justify-center"
          aria-label={`Open ${label.toLowerCase()} date calendar`}
          title={`Open ${label.toLowerCase()} date calendar`}
        >
          <CalendarDays size={17} aria-hidden="true" />
        </button>
      </div>
    </label>
  );
};

interface ReportFilterBarProps {
  state: ReportFilterState;
  onChange: (state: ReportFilterState) => void;
  definitions: ReportFilterDefinition[];
  searchPlaceholder?: string;
  showDates?: boolean;
  resultCount?: number;
  loading?: boolean;
}

export const ReportFilterBar: React.FC<ReportFilterBarProps> = ({
  state,
  onChange,
  definitions,
  searchPlaceholder = 'Search report…',
  showDates = true,
  resultCount,
  loading = false,
}) => {
  const activeCount = reportFilterCount(state);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <label className="relative md:col-span-2">
          <span className="sr-only">Search report</span>
          <Search className="absolute left-3 top-3.5 w-4 h-4 text-theme-text-muted" />
          <input
            value={state.search}
            onChange={event => onChange({ ...state, search: event.target.value, cursor: null })}
            placeholder={searchPlaceholder}
            className="w-full min-h-11 bg-theme-input-bg border border-theme-border rounded-2xl pl-10 pr-4 text-sm text-theme-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold"
          />
        </label>
        {definitions.map(definition => (
          <MultiSelectFilter
            key={definition.field}
            definition={definition}
            selected={state.selections[definition.field] || []}
            onToggle={value => onChange(toggleReportSelection(state, definition.field, value))}
          />
        ))}
        {showDates && (
          <>
            <DateFilter
              label="From"
              value={state.from}
              onChange={from => onChange({ ...state, from, cursor: null })}
            />
            <DateFilter
              label="To"
              value={state.to}
              onChange={to => onChange({ ...state, to, cursor: null })}
            />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 min-h-8">
        {Object.entries(state.selections).flatMap(([field, values]) =>
          values.map(value => (
            <button
              type="button"
              key={`${field}:${value}`}
              onClick={() => onChange(removeReportSelection(state, field, value))}
              className="min-h-8 px-3 rounded-full bg-lux-gold/10 border border-lux-gold/25 text-lux-gold text-xs flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold"
              aria-label={`Remove ${reportOptionLabel(definitions, field, value)} filter`}
            >
              {reportOptionLabel(definitions, field, value)}
              <X size={12} />
            </button>
          ))
        )}
        {(state.search || state.from || state.to) && (
          <span className="text-xs text-theme-text-muted">Search/date filters active</span>
        )}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => onChange(newReportFilterState())}
            className="min-h-8 px-3 rounded-full border border-theme-border text-xs text-theme-text-secondary hover:text-theme-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold"
          >
            Clear All
          </button>
        )}
        <span className="ml-auto text-xs text-theme-text-muted" aria-live="polite">
          {loading ? 'Loading…' : resultCount === undefined ? '' : `${resultCount} result${resultCount === 1 ? '' : 's'}`}
        </span>
      </div>
    </div>
  );
};

interface ReportPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export const ReportPagination: React.FC<ReportPaginationProps> = ({ page, pageSize, total, onPageChange }) => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <nav className="flex items-center justify-between gap-3 p-4 border-t border-theme-border" aria-label="Report pagination">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="min-h-11 px-4 rounded-xl border border-theme-border disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold"
      >
        Previous
      </button>
      <span className="text-sm text-theme-text-secondary">Page {page} of {pageCount}</span>
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        className="min-h-11 px-4 rounded-xl border border-theme-border disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold"
      >
        Next
      </button>
    </nav>
  );
};

export const ReportMessage: React.FC<{ loading?: boolean; error?: string; empty?: boolean }> = ({ loading, error, empty }) => {
  if (loading) return <div className="p-10 text-center text-theme-text-muted" role="status">Loading report…</div>;
  if (error) return <div className="p-10 text-center text-red-400" role="alert">{error}</div>;
  if (empty) return <div className="p-10 text-center text-theme-text-muted">No results match the active filters.</div>;
  return null;
};
