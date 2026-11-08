import { renderToStaticMarkup } from 'react-dom/server';
import RootLayout, { viewport } from './layout';
import { buildInlineThemeScript, THEME_STORAGE_KEY } from '../theme/theme';

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({ get: () => undefined }),
  headers: jest.fn().mockResolvedValue({ get: () => 'fr-CA,fr;q=0.9' }),
}));

/**
 * DES-05: the server payload must carry the pre-paint inline theme script in
 * `<head>` (before the body content, so it runs during HTML parsing) and must
 * no longer hardcode `class="dark"` on `<html>` — the class is set
 * client-side by the script / ThemeProvider. The viewport export must expose
 * system-based theme-color metas and no hardcoded `colorScheme`.
 */
describe('root layout theme bootstrap (DES-05)', () => {
  test('html has no hardcoded dark class and the inline script sits before the body', async () => {
    const markup = renderToStaticMarkup(
      await RootLayout({ children: <main>content</main> }),
    );

    // No theme class in the server markup at all.
    expect(markup).not.toMatch(/<html[^>]*class=/);
    expect(markup).toContain('lang="fr"');

    // The script is present, first-paint-safe: it appears in <head>, before
    // any body content.
    const scriptIndex = markup.indexOf(buildInlineThemeScript());
    const bodyIndex = markup.indexOf('<body');
    expect(scriptIndex).toBeGreaterThanOrEqual(0);
    expect(scriptIndex).toBeLessThan(bodyIndex);

    // The script resolves the stored preference and the system scheme.
    expect(markup).toContain(THEME_STORAGE_KEY);
    expect(markup).toContain('prefers-color-scheme');
  });

  test('viewport exposes system-based theme-color metas and no hardcoded colorScheme', () => {
    expect(viewport.themeColor).toEqual([
      { media: '(prefers-color-scheme: light)', color: '#e9e2d2' },
      { media: '(prefers-color-scheme: dark)', color: '#131313' },
    ]);
    expect(viewport.colorScheme).toBeUndefined();
  });
});
