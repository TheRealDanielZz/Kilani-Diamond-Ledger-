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
  // Flag to indicate if Cloud Function is currently unreachable (e.g. offline)
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);

  const storeVersion = useStoreVersion();

  // Listen to browser online/offline status to recover server-side queries automatically
  useEffect(() => {
    const handleOnline = () => {
      setIsOfflineFallback(false);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

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

    // If browser is explicitly offline or previously failed in this offline window,
    // generate from local store and update state.
    if (!navigator.onLine || isOfflineFallback) {
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
          if (!cancelled) {
            setResult(next);
            setIsOfflineFallback(false);
          }
        })
        .catch(cause => {
          if (!cancelled) {
            // Temporary network/CF failure — switch to local fallback for current offline window
            setIsOfflineFallback(true);
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
  }, [request, enabled, isOfflineFallback, storeVersion]);

  return { ...result, loading, error, request, isOfflineFallback };
}
