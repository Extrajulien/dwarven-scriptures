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
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-dwarf-cave font-mono text-dwarf-parchment antialiased selection:bg-dwarf-gold selection:text-dwarf-abyss">
      {/* Scanline texture overlay */}
      <div className="retro-scanlines pointer-events-none fixed inset-0 z-50" />
      {/* Ambient cave lighting gradient (token-driven, see .cave-ambient) */}
      <div className="cave-ambient pointer-events-none fixed inset-0" />

      <AuthNavbar locale={locale} messages={messages} />

      <main className="relative z-20 flex flex-grow items-center justify-center p-3 sm:p-6 lg:p-10">
        {children}
      </main>
    </div>
  );
}
