import { useCallback, useEffect, useState } from 'react';
import { ProjectViewMode } from '../services/projectPresentation';

type ProjectViewPage = 'overview' | 'all-projects';

const MOBILE_QUERY = '(max-width: 639px)';

function isViewMode(value: unknown): value is ProjectViewMode {
  return value === 'LIST' || value === 'GRID';
}

export function projectViewPreferenceKey(userId: string, page: ProjectViewPage): string {
  return `kilani:view:${page}:${userId || 'anonymous'}`;
}

export function readProjectViewPreference(
  userId: string,
  page: ProjectViewPage,
  fallback: ProjectViewMode,
  storage: Pick<Storage, 'getItem'> | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
): ProjectViewMode {
  try {
    const stored = storage?.getItem(projectViewPreferenceKey(userId, page));
    return isViewMode(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function writeProjectViewPreference(
  userId: string,
  page: ProjectViewPage,
  value: ProjectViewMode,
  storage: Pick<Storage, 'setItem'> | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
): void {
  if (!isViewMode(value)) return;
  try {
    storage?.setItem(projectViewPreferenceKey(userId, page), value);
  } catch {
    // Preferences are optional UI state. Storage failures must never block work.
  }
}

function mobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches;
}

export function useProjectViewPreference(
  userId: string,
  page: ProjectViewPage,
  desktopFallback: ProjectViewMode,
) {
  const [isMobile, setIsMobile] = useState(mobileViewport);
  const [viewMode, setViewModeState] = useState<ProjectViewMode>(() =>
    mobileViewport() ? 'GRID' : readProjectViewPreference(userId, page, desktopFallback)
  );

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(event.matches);
      setViewModeState(event.matches ? 'GRID' : readProjectViewPreference(userId, page, desktopFallback));
    };
    handleChange(media);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [desktopFallback, page, userId]);

  const setViewMode = useCallback((next: ProjectViewMode) => {
    if (!isViewMode(next)) return;
    setViewModeState(next);
    if (!isMobile) writeProjectViewPreference(userId, page, next);
  }, [isMobile, page, userId]);

  return { viewMode, setViewMode, isMobile };
}
