'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  applyThemeToRoot,
  readStoredPreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';

/**
 * DES-05: client-side theme state. The provider:
 *
 * - adopts the persisted choice on mount (SSR always renders `system`, so the
 *   server markup is deterministic and matches the inline script's result);
 * - tracks `prefers-color-scheme` live while the preference is `system`;
 * - applies the resolved theme to `<html>` (`dark` class + theme-color meta);
 * - persists `light`/`dark` to localStorage and REMOVES the stored value when
 *   the user picks `system` (see the decision in `src/theme/theme.ts`).
 */

export type ThemeContextValue = {
  /** The selector state: 'light' | 'dark' | 'system'. */
  preference: ThemePreference;
  /** The theme actually applied on `<html>`. */
  theme: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  // Skip the reactive apply effect on its first run: the mount effect below
  // already applies the same theme the inline script resolved (no flicker).
  const firstApply = useRef(true);

  // Adopt the persisted choice and apply the theme the inline script already
  // resolved, so the first client pass never contradicts the first paint.
  // The state adoption is deferred to the next animation frame so the effect
  // body itself only synchronizes the DOM (no cascading render).
  useEffect(() => {
    const stored = readStoredPreference();
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyThemeToRoot(resolveTheme(stored, prefersDark));
    const frame = requestAnimationFrame(() => {
      setPreferenceState(stored ?? 'system');
      setSystemPrefersDark(prefersDark);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Follow live OS theme changes while the preference is `system`.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemPrefersDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const theme = useMemo<ResolvedTheme>(
    () => (preference === 'system' ? resolveTheme(null, systemPrefersDark) : preference),
    [preference, systemPrefersDark],
  );

  useEffect(() => {
    if (firstApply.current) {
      firstApply.current = false;
      return;
    }
    applyThemeToRoot(theme);
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      if (next === 'system') {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      }
    } catch {
      // Storage unavailable (private mode): the choice still applies for the
      // session, it just won't survive a reload.
    }
    setPreferenceState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, theme, setPreference }),
    [preference, theme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
