import React, { useState, useMemo, useEffect } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, monthIndex: number): number {
  return new Date(year, monthIndex, 1).getDay();
}

function getMonthGrid(year: number, monthIndex: number): (number | null)[] {
  const daysInMonth = getDaysInMonth(year, monthIndex);
  const firstDay = getFirstDayOfWeek(year, monthIndex);
  const grid: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) {
    grid.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    grid.push(d);
  }
  return grid;
}

function formatDateRangeDisplay(sDate?: string, eDate?: string) {
  if (!sDate && !eDate) return 'All Time / Select Dates';
  if (sDate && !eDate) {
    const [y, m, d] = sDate.split('-').map(Number);
    if (!y || !m || !d) return sDate;
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }
  if (!sDate && eDate) {
    const [y, m, d] = eDate.split('-').map(Number);
    if (!y || !m || !d) return eDate;
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return `Until ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
  }
  if (sDate === eDate && sDate) {
    const [y, m, d] = sDate.split('-').map(Number);
    if (!y || !m || !d) return sDate;
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }
  if (sDate && eDate) {
    const [y1, m1, d1] = sDate.split('-').map(Number);
    const [y2, m2, d2] = eDate.split('-').map(Number);
    if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return `${sDate} – ${eDate}`;
    const date1 = new Date(Date.UTC(y1, m1 - 1, d1, 12));
    const date2 = new Date(Date.UTC(y2, m2 - 1, d2, 12));
    const m1Str = date1.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    const m2Str = date2.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

    if (m1Str === m2Str && y1 === y2) {
      return `${m1Str} ${d1}–${d2}, ${y1}`;
    }
    if (y1 === y2) {
      return `${m1Str} ${d1} – ${m2Str} ${d2}, ${y1}`;
    }
    return `${m1Str} ${d1}, ${y1} – ${m2Str} ${d2}, ${y2}`;
  }
  return 'All Time';
}

interface AirbnbDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFrom?: string;
  initialTo?: string;
  onApply: (from: string, to: string) => void;
}

const AirbnbDateModal: React.FC<AirbnbDateModalProps> = ({
  isOpen,
  onClose,
  initialFrom = '',
  initialTo = '',
  onApply,
}) => {
  const [tempFrom, setTempFrom] = useState(initialFrom);
  const [tempTo, setTempTo] = useState(initialTo);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [navYear, setNavYear] = useState(() => {
    if (initialFrom) return Number(initialFrom.split('-')[0]) || 2026;
    return new Date().getFullYear();
  });
  const [navMonth, setNavMonth] = useState(() => {
    if (initialFrom) return (Number(initialFrom.split('-')[1]) - 1) || 7;
    return new Date().getMonth();
  });

  useEffect(() => {
    if (isOpen) {
      setTempFrom(initialFrom);
      setTempTo(initialTo);
      if (initialFrom) {
        const [y, m] = initialFrom.split('-').map(Number);
        if (y && m) {
          setNavYear(y);
          setNavMonth(m - 1);
        }
      }
    }
  }, [isOpen, initialFrom, initialTo]);

  const secondMonthInfo = useMemo(() => {
    let m = navMonth + 1;
    let y = navYear;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    return { year: y, monthIndex: m };
  }, [navYear, navMonth]);

  const handlePrevMonth = () => {
    if (navMonth === 0) {
      setNavMonth(11);
      setNavYear(y => y - 1);
    } else {
      setNavMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (navMonth === 11) {
      setNavMonth(0);
      setNavYear(y => y + 1);
    } else {
      setNavMonth(m => m + 1);
    }
  };

  const handleDayClick = (dateStr: string) => {
    if (!tempFrom || (tempFrom && tempTo && tempFrom !== tempTo)) {
      setTempFrom(dateStr);
      setTempTo(dateStr);
    } else if (tempFrom && tempFrom === tempTo) {
      if (dateStr < tempFrom) {
        setTempTo(tempFrom);
        setTempFrom(dateStr);
      } else {
        setTempTo(dateStr);
      }
    }
  };

  const applyPreset = (preset: 'today' | 'yesterday' | '7days' | '30days' | 'thisMonth' | 'all') => {
    const today = new Date();
    if (preset === 'today') {
      setTempFrom(todayStr);
      setTempTo(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().split('T')[0];
      setTempFrom(yStr);
      setTempTo(yStr);
    } else if (preset === '7days') {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      setTempFrom(d.toISOString().split('T')[0]);
      setTempTo(todayStr);
    } else if (preset === '30days') {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      setTempFrom(d.toISOString().split('T')[0]);
      setTempTo(todayStr);
    } else if (preset === 'thisMonth') {
      const yStr = today.getFullYear();
      const mStr = String(today.getMonth() + 1).padStart(2, '0');
      setTempFrom(`${yStr}-${mStr}-01`);
      setTempTo(todayStr);
    } else if (preset === 'all') {
      setTempFrom('');
      setTempTo('');
    }
  };

  if (!isOpen) return null;

  const renderMonthGrid = (year: number, monthIndex: number) => {
    const daysGrid = getMonthGrid(year, monthIndex);
    const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    return (
      <div className="space-y-2">
        <div className="text-center font-extrabold text-white text-xs tracking-wide">
          {MONTH_NAMES[monthIndex]} {year}
        </div>
        <div className="grid grid-cols-7 text-center gap-1">
          {dayNames.map(d => (
            <span key={d} className="text-[10px] font-bold text-zinc-500 py-1">
              {d}
            </span>
          ))}
          {daysGrid.map((d, i) => {
            if (d === null) {
              return <div key={`empty-${i}`} className="h-8" />;
            }
            const mm = String(monthIndex + 1).padStart(2, '0');
            const dd = String(d).padStart(2, '0');
            const dateStr = `${year}-${mm}-${dd}`;

            const isStart = tempFrom === dateStr;
            const isEnd = tempTo === dateStr;

            const effectiveEnd = (tempFrom && tempTo && tempFrom !== tempTo) ? tempTo : hoverDate;
            const minD = tempFrom && effectiveEnd ? (tempFrom < effectiveEnd ? tempFrom : effectiveEnd) : null;
            const maxD = tempFrom && effectiveEnd ? (tempFrom < effectiveEnd ? effectiveEnd : tempFrom) : null;
            const isInRange = minD && maxD && dateStr > minD && dateStr < maxD;

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => handleDayClick(dateStr)}
                onMouseEnter={() => {
                  if (tempFrom && tempFrom === tempTo) {
                    setHoverDate(dateStr);
                  }
                }}
                onMouseLeave={() => setHoverDate(null)}
                className={`h-8 w-full flex items-center justify-center text-xs font-bold transition-all relative ${
                  isStart || isEnd
                    ? 'bg-lux-gold text-black shadow-lg shadow-amber-400/40 z-10 font-black scale-105 rounded-full'
                    : isInRange
                    ? 'bg-amber-500/25 text-amber-300 font-bold hover:bg-amber-500/40 rounded-full border border-amber-400/20'
                    : 'text-zinc-200 hover:bg-zinc-800 hover:text-white rounded-full'
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl bg-zinc-950 border border-amber-500/30 rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-lux-gold" />
            <h3 className="font-extrabold text-white text-base">Select Date Range</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Live Period Banner */}
        <div className="bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-2xl flex items-center justify-between text-xs">
          <span className="text-zinc-400 font-bold uppercase tracking-wider text-[10px]">Active Range:</span>
          <span className="font-extrabold text-lux-gold">{formatDateRangeDisplay(tempFrom, tempTo)}</span>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: 'Today', key: 'today' },
            { label: 'Yesterday', key: 'yesterday' },
            { label: 'Last 7 Days', key: '7days' },
            { label: 'Last 30 Days', key: '30days' },
            { label: 'This Month', key: 'thisMonth' },
            { label: 'All Time', key: 'all' },
          ].map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key as any)}
              className="px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900 text-xs font-bold text-zinc-300 hover:bg-lux-gold/15 hover:border-lux-gold/30 hover:text-lux-gold transition-all"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Dual Month Calendar View */}
        <div className="relative border border-zinc-800/80 bg-zinc-900/40 rounded-2xl p-4">
          <div className="flex items-center justify-between absolute left-4 right-4 top-4 pointer-events-none">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="pointer-events-auto w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="pointer-events-auto w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {renderMonthGrid(navYear, navMonth)}
            {renderMonthGrid(secondMonthInfo.year, secondMonthInfo.monthIndex)}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
          <button
            type="button"
            onClick={() => { setTempFrom(''); setTempTo(''); }}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5"
          >
            <RotateCcw size={13} /> Clear
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-zinc-800 text-xs font-bold text-zinc-300 hover:bg-zinc-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(tempFrom, tempTo);
                onClose();
              }}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
            >
              Apply Filter
            </button>
          </div>
        </div>
      </div>
    </div>
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
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const activeCount = reportFilterCount(state);

  const dateRangeDisplay = useMemo(() => {
    return formatDateRangeDisplay(state.from, state.to);
  }, [state.from, state.to]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <label className="relative flex-1">
          <span className="sr-only">Search report</span>
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-theme-text-muted" />
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
          <button
            type="button"
            onClick={() => setIsDateModalOpen(true)}
            className="flex items-center justify-between gap-2.5 min-h-11 px-4 rounded-2xl bg-zinc-950/90 border border-amber-400/40 hover:border-amber-400/80 text-white shadow-lg transition-all hover:bg-zinc-900 active:scale-[0.98] group shrink-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <CalendarDays size={15} className="text-lux-gold shrink-0 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold tracking-wide text-zinc-200 truncate">{dateRangeDisplay}</span>
            </div>
            <SlidersHorizontal size={13} className="text-zinc-400 shrink-0 ml-1" />
          </button>
        )}
      </div>

      {showDates && (
        <AirbnbDateModal
          isOpen={isDateModalOpen}
          onClose={() => setIsDateModalOpen(false)}
          initialFrom={state.from}
          initialTo={state.to}
          onApply={(from, to) => {
            onChange({ ...state, from, to, cursor: null });
          }}
        />
      )}

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
        className="min-h-11 px-4 rounded-xl border border-theme-border disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold text-xs font-bold"
      >
        Previous
      </button>
      <span className="text-xs font-bold text-theme-text-secondary">Page {page} of {pageCount}</span>
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        className="min-h-11 px-4 rounded-xl border border-theme-border disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lux-gold text-xs font-bold"
      >
        Next
      </button>
    </nav>
  );
};

export const ReportMessage: React.FC<{ loading?: boolean; error?: string; empty?: boolean }> = ({ loading, error, empty }) => {
  if (loading) return <div className="p-10 text-center text-theme-text-muted text-xs font-bold" role="status">Loading report…</div>;
  if (error) return <div className="p-10 text-center text-red-400 text-xs font-bold" role="alert">{error}</div>;
  if (empty) return <div className="p-10 text-center text-theme-text-muted text-xs font-bold">No results match the active filters.</div>;
  return null;
};
