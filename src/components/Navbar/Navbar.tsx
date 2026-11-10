import { NAV_LINKS } from '../../data/homepageData';
import { SITE } from '../../data/site';
import Image from 'next/image';
import type { Locale, Messages } from '../../i18n/messages';
import LocaleSelector from './LocaleSelector';
import ThemeSelector from './ThemeSelector';
import PersonalAccount from './PersonalAccount';
import ButtonSecondary from '../ButtonSecondary';

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
        <ButtonSecondary href="/" aria-label={SITE.name}>
          <Image
            alt={messages['chrome.siteLogoAlt']}
            className="rounded-sm"
            src={SITE.logoUrl}
            width={24}
            height={24}
            priority
          />
          <span className="font-display text-sm font-bold tracking-wider text-dwarf-gold">
            {SITE.name}
          </span>
        </ButtonSecondary>

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
