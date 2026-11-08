import { DARK_BACKGROUND_HEX, LIGHT_BACKGROUND_HEX } from './palette';

/**
 * DES-05: theme resolution + the no-flash inline script.
 *
 * Design (documented here because it is the decision DES-05 asks for):
 *
 * - The selector has three states: **Light / Dark / System**. `light` and
 *   `dark` are persisted to `localStorage['theme']`; choosing `system`
 *   REMOVES the stored value, so the OS preference (`prefers-color-scheme`)
 *   decides again.
 * - Resolution order: stored value wins, then the system preference, then
 *   `dark` (the default the site has always shipped with).
 * - The dark/light styles are driven by the `dark` class on
 *   `document.documentElement` (Tailwind `darkMode: 'class'`), set by the
 *   pre-paint inline script (see {@link buildInlineThemeScript}) and kept in
 *   sync by `ThemeProvider`.
 *
 * Everything in this module is pure apart from {@link applyThemeToRoot} /
 * {@link readStoredPreference} (DOM access happens only inside the function
 * bodies, so the module stays importable in Node/jest).
 */

export const THEME_STORAGE_KEY = 'theme';

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;

/** What the user can pick in the selector. */
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** The theme actually applied (never `system`). */
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === 'string' &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

export function isResolvedTheme(value: unknown): value is ResolvedTheme {
  return value === 'light' || value === 'dark';
}

/**
 * Pure resolution rule: a stored `light`/`dark` wins, then the system
 * preference, then `dark` when the system preference is unknown.
 */
export function resolveTheme(
  stored: string | null | undefined,
  systemPrefersDark: boolean | null | undefined,
): ResolvedTheme {
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  if (typeof systemPrefersDark === 'boolean') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return 'dark';
}

/** Reads the persisted choice ('light' | 'dark'); `null` if absent/invalid. */
export function readStoredPreference(): ResolvedTheme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isResolvedTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Applies a resolved theme to `<html>`: toggles the `dark` class and keeps
 * the `theme-color` meta (appended by the pre-paint script) in sync.
 */
export function applyThemeToRoot(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  const color = theme === 'dark' ? DARK_BACKGROUND_HEX : LIGHT_BACKGROUND_HEX;
  if (meta) {
    meta.setAttribute('content', color);
  }
}

/**
 * The inline `<head>` script (DES-05 no-flash mechanism). It must be fully
 * self-contained (no imports, no optional chaining) and runs synchronously
 * while the browser parses the HTML — before first paint — so it reads
 * localStorage and `prefers-color-scheme`, sets the `dark` class and appends
 * a matching `theme-color` meta. The appended meta has no `media` attribute,
 * so it wins over the system-based `<meta name="theme-color" media=…>`
 * emitted by the viewport export.
 */
export function buildInlineThemeScript(): string {
  return [
    '(function(){',
    'try{',
    'var s=null;',
    'try{s=localStorage.getItem("' + THEME_STORAGE_KEY + '")}catch(e){}',
    'var d=true;',
    'try{if(window.matchMedia){d=window.matchMedia("(prefers-color-scheme: dark)").matches}}catch(e){}',
    'var t=(s==="light"||s==="dark")?s:(d?"dark":"light");',
    'var r=document.documentElement;',
    'if(t==="dark"){r.classList.add("dark")}else{r.classList.remove("dark")}',
    'var m=document.createElement("meta");',
    'm.name="theme-color";',
    'm.content=t==="dark"?"' + DARK_BACKGROUND_HEX + '":"' + LIGHT_BACKGROUND_HEX + '";',
    'document.head.appendChild(m);',
    '}catch(e){}',
    '})();',
  ].join('');
}
