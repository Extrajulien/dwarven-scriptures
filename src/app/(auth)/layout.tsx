import AuthNavbar from '../../components/AuthNavbar';
import { getLocale, pick } from '../../i18n/messages';

/**
 * Shared shell for the authentication pages (`/login`, `/register`).
 * Owns the cave background, scanline overlay, ambient gradient and the lean
 * navbar once, so the individual pages only render their card/showcase grid.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = pick(locale);

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#0f0e0d] font-mono text-dwarf-parchment antialiased selection:bg-dwarf-gold selection:text-dwarf-abyss">
      {/* Scanline texture overlay */}
      <div className="retro-scanlines pointer-events-none fixed inset-0 z-50" />
      {/* Ambient cave lighting gradient */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(197,155,39,0.08),rgba(15,14,13,0.9))]" />

      <AuthNavbar locale={locale} messages={messages} />

      <main className="relative z-20 flex flex-grow items-center justify-center p-3 sm:p-6 lg:p-10">
        {children}
      </main>
    </div>
  );
}
