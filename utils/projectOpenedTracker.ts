// Project Last Opened Tracker Utility
// Tracks when a user opens or views a project.
// Stored per user in localStorage with in-memory fallback. Zero Firestore mutations or permission impact.

const MEMORY_CACHE: Record<string, Record<string, string>> = {};

function getStorageKey(userId?: string): string {
  return `kilani:project_last_opened:${userId || 'default'}`;
}

export function getAllProjectsLastOpened(userId?: string): Record<string, string> {
  const key = getStorageKey(userId);
  if (typeof window === 'undefined') {
    return MEMORY_CACHE[key] || {};
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return MEMORY_CACHE[key] || {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return MEMORY_CACHE[key] || {};
  }
}

export function getProjectLastOpened(projectId: string, userId?: string): string | null {
  if (!projectId) return null;
  const map = getAllProjectsLastOpened(userId);
  return map[projectId] || null;
}

export function recordProjectOpened(projectId: string, userId?: string): void {
  if (!projectId) return;
  const key = getStorageKey(userId);
  const now = new Date().toISOString();

  if (!MEMORY_CACHE[key]) {
    MEMORY_CACHE[key] = {};
  }
  MEMORY_CACHE[key][projectId] = now;

  if (typeof window === 'undefined') return;
  try {
    const map = getAllProjectsLastOpened(userId);
    map[projectId] = now;
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Fail gracefully on private browsing quota limits
  }
}

export function formatLastOpenedRelative(isoDate: string | null): string {
  if (!isoDate) return 'Never opened';
  const time = new Date(isoDate).getTime();
  if (isNaN(time)) return 'Never opened';

  const diffMs = Date.now() - time;
  if (diffMs < 0) return 'Just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'Just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;

  return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
