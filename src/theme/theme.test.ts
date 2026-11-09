import {
  applyThemeToRoot,
  buildInlineThemeScript,
  isResolvedTheme,
  isThemePreference,
  readStoredPreference,
  resolveTheme,
  THEME_STORAGE_KEY,
} from './theme';
import { DARK_BACKGROUND_HEX, LIGHT_BACKGROUND_HEX } from './palette';

/**
 * DES-05: unit tests for the pure theme resolution logic and — by executing
 * the generated script in jsdom — for the no-flash inline script itself
 * (storage read, prefers-color-scheme fallback, dark default, class toggle
 * and theme-color meta).
 */

function runInlineScript(stored: string | null, systemPrefersDark: boolean | null): void {
  document.documentElement.className = '';
  document.head
    .querySelectorAll('meta[name="theme-color"]:not([media])')
    .forEach((meta) => meta.remove());
  if (stored === null) {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } else {
    localStorage.setItem(THEME_STORAGE_KEY, stored);
  }
  // jsdom (in this project's version) does not implement matchMedia; provide
  // a stub on window so the script and spyOn can use it.
  const matchMediaMock = jest.fn();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: matchMediaMock as unknown as typeof window.matchMedia,
  });
  matchMediaMock.mockReturnValue({
    matches: systemPrefersDark === true,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  });
  // The script never calls matchMedia when the stored value is a valid theme.
  if (systemPrefersDark === null && stored === null) {
    matchMediaMock.mockImplementation(() => {
      throw new Error('matchMedia unavailable');
    });
  }
  // Executing the generated inline script is the point of this test.
  new Function(buildInlineThemeScript())();
  matchMediaMock.mockReset();
}

describe('resolveTheme (pure)', () => {
  test('stored light/dark wins over the system preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  test('falls back to the system preference when nothing is stored', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  test('defaults to dark when the system preference is unknown', () => {
    expect(resolveTheme(null, null)).toBe('dark');
    expect(resolveTheme(undefined, undefined)).toBe('dark');
  });

  test('ignores invalid stored values', () => {
    expect(resolveTheme('bogus', true)).toBe('dark');
    expect(resolveTheme('bogus', false)).toBe('light');
  });
});

describe('guards and storage key', () => {
  test('isThemePreference accepts only the three selector states', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('')).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });

  test('isResolvedTheme accepts only light/dark', () => {
    expect(isResolvedTheme('light')).toBe(true);
    expect(isResolvedTheme('dark')).toBe(true);
    expect(isResolvedTheme('system')).toBe(false);
  });

  test('the storage key is "theme"', () => {
    expect(THEME_STORAGE_KEY).toBe('theme');
  });

  test('readStoredPreference returns only a valid stored theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readStoredPreference()).toBe('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'system');
    expect(readStoredPreference()).toBeNull();
    localStorage.removeItem(THEME_STORAGE_KEY);
    expect(readStoredPreference()).toBeNull();
  });
});

describe('inline script (executed in jsdom)', () => {
  test('applies the stored theme regardless of the system preference', () => {
    runInlineScript('light', true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    runInlineScript('dark', false);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  test('falls back to the system preference without a stored value', () => {
    runInlineScript(null, true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    runInlineScript(null, false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  test('defaults to dark when matchMedia is unavailable', () => {
    runInlineScript(null, null);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  test('appends a theme-color meta matching the resolved theme', () => {
    runInlineScript(null, true);
    const meta = document.head.querySelector('meta[name="theme-color"]:not([media])');
    expect(meta).not.toBeNull();
    expect(meta?.getAttribute('content')).toBe(DARK_BACKGROUND_HEX);

    runInlineScript('light', true);
    expect(
      document.head
        .querySelector('meta[name="theme-color"]:not([media])')
        ?.getAttribute('content'),
    ).toBe(LIGHT_BACKGROUND_HEX);
  });

  test('the script embeds the storage key and the media query', () => {
    const script = buildInlineThemeScript();
    expect(script).toContain(THEME_STORAGE_KEY);
    expect(script).toContain('prefers-color-scheme: dark');
  });
});

describe('applyThemeToRoot', () => {
  test('toggles the dark class and syncs the theme-color meta', () => {
    document.documentElement.className = '';
    document.head
      .querySelectorAll('meta[name="theme-color"]:not([media])')
      .forEach((meta) => meta.remove());
    runInlineScript(null, false); // creates the meta with the light colour

    applyThemeToRoot('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(
      document.head
        .querySelector('meta[name="theme-color"]:not([media])')
        ?.getAttribute('content'),
    ).toBe(DARK_BACKGROUND_HEX);

    applyThemeToRoot('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(
      document.head
        .querySelector('meta[name="theme-color"]:not([media])')
        ?.getAttribute('content'),
    ).toBe(LIGHT_BACKGROUND_HEX);
  });
});
