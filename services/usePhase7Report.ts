import { useEffect, useMemo, useState } from 'react';
import { Phase7ReportSection } from '../functions/src/reports/contract';
import { ReportFilterState, toPhase7Request } from './reportFilters';
import { Phase7ReportPage, queryPhase7Report } from './reportsApi';

interface UsePhase7ReportOptions {
  enabled?: boolean;
  page?: number;
  pageSize?: number;
}

export function usePhase7Report<T = Record<string, unknown>>(
  section: Phase7ReportSection,
  filters: ReportFilterState,
  options: UsePhase7ReportOptions = {},
) {
  const { enabled = true, page = 1, pageSize = 25 } = options;
  const [result, setResult] = useState<Phase7ReportPage<T>>({
    section,
    rows: [],
    total: 0,
    nextCursor: null,
    pageSize,
  });
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');

  const request = useMemo(() => {
    const offset = Math.max(0, page - 1) * pageSize;
    return toPhase7Request(section, {
      ...filters,
      cursor: offset > 0 ? `p7:${offset}` : null,
    }, pageSize);
  }, [
    section,
    filters.search,
    filters.from,
    filters.to,
    JSON.stringify(filters.selections),
    page,
    pageSize,
  ]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      void queryPhase7Report<T>(request)
        .then(next => {
          if (!cancelled) setResult(next);
        })
        .catch(cause => {
          if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load this report.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [request, enabled]);

  return { ...result, loading, error, request };
}
