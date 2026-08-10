import { useEffect, useMemo, useState, useSyncExternalStore, useRef } from 'react';
import { Phase7ReportSection } from '../functions/src/reports/contract';
import { ReportFilterState, toPhase7Request } from './reportFilters';
import { Phase7ReportPage, queryPhase7Report, queryPhase7ReportLocal } from './reportsApi';
import { store } from './store';

interface UsePhase7ReportOptions {
  enabled?: boolean;
  page?: number;
  pageSize?: number;
}

/** Subscribe to the store's version counter so we re-render (and re-query) when Firestore snapshots arrive. */
function useStoreVersion(): number {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getVersion(),
  );
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
  // Once the Cloud Function fails, switch permanently to local-only mode
  // for the lifetime of this component. No more wasted HTTP round-trips.
  const localOnlyRef = useRef(false);

  const storeVersion = useStoreVersion();

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

    // If we already know Cloud Functions are broken, skip the HTTP call
    // entirely and generate the report from local store data. This path
    // is re-triggered by storeVersion so we always have the latest data.
    if (localOnlyRef.current) {
      const localResult = queryPhase7ReportLocal<T>(request);
      setResult(localResult);
      setLoading(false);
      setError('');
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
          if (!cancelled) {
            // Cloud Function failed — switch to local-only mode
            localOnlyRef.current = true;
            const localResult = queryPhase7ReportLocal<T>(request);
            setResult(localResult);
            setError('');
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // storeVersion is included so that in local-only mode, the report
    // re-generates whenever Firestore snapshot data arrives.
  }, [request, enabled, storeVersion]);

  return { ...result, loading, error, request };
}
