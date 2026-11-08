import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getLocale, pick } from '../i18n/messages';

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

export const viewport: Viewport = {
  themeColor: '#131313',
  colorScheme: 'dark',
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
    <html lang={locale} className="dark">
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
        {children}
      </body>
    </html>
  );
}
