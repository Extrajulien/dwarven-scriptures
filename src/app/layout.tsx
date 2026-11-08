import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getLocale, pick } from '../i18n/messages';
import { ThemeProvider } from '../theme/ThemeProvider';
import { buildInlineThemeScript } from '../theme/theme';
import { DARK_BACKGROUND_HEX, LIGHT_BACKGROUND_HEX } from '../theme/palette';

/**
 * I18N-02: the root shell resolves the UI locale per request — the `locale`
 * cookie wins, then the browser `Accept-Language`, then `fr` — and drives
 * both `<html lang>` (accessibility, spellcheck) and the localized page
 * title/description. Locale switching is cookie-based (there are no `/fr`
 * and `/en` URL routes), so `alternates.languages` is intentionally omitted.
 */
export async function generateMetadata(): Promise<Metadata> {
  const messages = pick(await getLocale());
  return {
    title: messages['meta.title'],
    description: messages['meta.description'],
    icons: {
      icon: '/favicon.png',
      apple: '/logo192.png',
    },
    manifest: '/manifest.json',
  };
}

/**
 * DES-05: the server can't know the client theme, so the viewport emits
 * system-based `theme-color` metas (correct for the "system" default) and
 * no hardcoded `colorScheme` — the `color-scheme` CSS property is instead
 * driven per theme in `globals.css` (`:root` = light, `html.dark` = dark).
 * The pre-paint inline script appends a media-less theme-color meta matching
 * the ACTIVE theme, which wins over these (last matching meta wins).
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: LIGHT_BACKGROUND_HEX },
    { media: '(prefers-color-scheme: dark)', color: DARK_BACKGROUND_HEX },
  ],
};

const FONT_STYLESHEETS = [
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap',
];

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    // suppressHydrationWarning: the inline <head> script below toggles the
    // `dark` class on <html> before hydration, so the DOM intentionally
    // differs from the server markup (DES-05 — see
    // node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md).
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Runs synchronously during HTML parsing — before first paint — and
            applies the stored/system theme so the user never sees the wrong
            theme flash (DES-05). */}
        <script dangerouslySetInnerHTML={{ __html: buildInlineThemeScript() }} />
      </head>
      <body className="bg-surface text-on-surface font-body-md text-body-md min-h-screen selection:bg-secondary-container selection:text-on-secondary-container">
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {FONT_STYLESHEETS.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
