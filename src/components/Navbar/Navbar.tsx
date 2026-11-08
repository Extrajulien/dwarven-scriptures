import { GUILD, NAV_LINKS } from '../../data/homepageData';
import type { Locale, Messages } from '../../i18n/messages';
import LocaleSelector from './LocaleSelector';
import ThemeSelector from './ThemeSelector';
import PersonalAccount from './PersonalAccount';

export type NavUser = { username: string; pfpUrl?: string | null };

export default function Navbar({
  user = null,
  locale,
  messages,
}: {
  user?: NavUser | null;
  locale: Locale;
  messages: Messages;
}) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
      <div className="h-20 w-full px-margin-desktop flex items-center justify-between gap-gutter">
        <div className="flex items-center gap-space-md">
          <img
            alt={messages['chrome.guildEmblemAlt']}
            className="h-8 w-auto object-contain"
            src={GUILD.logoUrl}
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-space-xs">
              <span className="font-headline-sm text-headline-sm uppercase text-primary">
                {messages[GUILD.nameKey]}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant select-none">
                {GUILD.runes}
              </span>
            </div>
            <div className="flex items-center gap-space-sm mt-space-xs">
              <span className="font-label-sm text-label-sm uppercase bg-surface-container-high text-on-surface-variant px-space-xs py-0.5 rounded">
                {messages[GUILD.tagKey]}
              </span>
              <span className="font-label-sm text-label-sm uppercase bg-secondary-container text-on-secondary-container px-space-xs py-0.5 rounded shadow-[0_0_8px_rgba(217,119,6,0.35)]">
                {messages[GUILD.streakKey]}
              </span>
            </div>
          </div>
        </div>

        <nav className="hidden xl:flex items-center gap-space-sm">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-label-md text-label-md uppercase px-space-md py-space-sm text-on-surface-variant hover:text-on-surface transition-colors"
            >
              {messages[link.labelKey]}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-space-md">
          {/* I18N-02: visible on every breakpoint (desktop and mobile). */}
          <LocaleSelector locale={locale} messages={messages} />
          {/* DES-05: Light / Dark / System theme selector. */}
          <ThemeSelector messages={messages} />

          <PersonalAccount user={user} messages={messages} />
        </div>
      </div>
    </header>
  );
}
