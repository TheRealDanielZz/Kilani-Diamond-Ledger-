import React, { createContext, useContext, useState, useEffect } from 'react';
import { store } from '../services/store';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {}
});

export const useTheme = () => useContext(ThemeContext);

/** Detect the OS / browser preferred color scheme */
const getOSPreference = (): Theme =>
  window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme_preference');
    // Explicit user preference takes priority
    if (saved === 'light' || saved === 'dark') return saved;
    // First visit → respect the OS / browser setting
    return getOSPreference();
  });

  // Apply theme via data-theme attribute on <html> (no class mutation needed)
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme_preference', theme);
  }, [theme]);

  // Follow OS theme changes in real time —
  // only when the user hasn't set a manual preference
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handleOSChange = (e: MediaQueryListEvent) => {
      const saved = localStorage.getItem('theme_preference');
      // If the key exists it means the user explicitly chose a theme → don't override
      // We use a separate key to track manual intent
      const isManual = localStorage.getItem('theme_manual') === '1';
      if (!isManual) {
        setTheme(e.matches ? 'light' : 'dark');
      }
    };
    mq.addEventListener('change', handleOSChange);
    return () => mq.removeEventListener('change', handleOSChange);
  }, []);

  // Sync theme with loaded Firestore user profile (e.g. after login on a new device)
  useEffect(() => {
    const syncThemeWithUser = () => {
      const currentUser = store.getCurrentUser();
      if (currentUser && currentUser.theme && currentUser.theme !== theme) {
        setTheme(currentUser.theme as Theme);
      }
    };
    syncThemeWithUser();
    const unsubscribe = store.subscribe(syncThemeWithUser);
    return () => unsubscribe();
  }, [theme]);

  const toggleTheme = async () => {
    const nextTheme: Theme = theme === 'light' ? 'dark' : 'light';

    // ── Transition guard ──────────────────────────────────────────
    // Add the attribute that activates smooth CSS transitions,
    // then remove it after the animation window (350ms) so normal
    // hover/focus interactions stay instant.
    document.documentElement.setAttribute('data-transition-active', '');
    setTimeout(() => {
      document.documentElement.removeAttribute('data-transition-active');
    }, 350);

    // Mark as explicit manual choice so OS changes won't override it
    localStorage.setItem('theme_manual', '1');

    setTheme(nextTheme);

    // Persist to Firestore so the preference follows the user across devices
    const currentUser = store.getCurrentUser();
    if (currentUser) {
      try {
        await store.updateUser({ ...currentUser, theme: nextTheme });
      } catch (e) {
        console.error('Failed to sync theme preference with Firestore:', e);
      }
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
