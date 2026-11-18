import { SITE } from '../data/site';
import Image from 'next/image';
import type { Locale, Messages } from '../i18n/messages';
import SettingsMenu from './Navbar/SettingsMenu';
import ButtonSecondary from './ButtonSecondary';

/**
 * Lean auth navbar: the site name (a secondary button) linking back to the
 * home page, plus the FR/EN locale (I18N-02) and theme (DES-05) selectors
 * collapsed behind a single settings gear. Shared by the `/login` and
 * `/register` screens via the `(auth)` layout. Sticky by default so the
 * controls stay reachable while a mobile form scrolls (the `(auth)` layout
 * clips horizontal overflow with `overflow-x-clip` to keep `sticky` working).
 */
export default function AuthNavbar({
  locale,
  messages,
  sticky = true,
}: {
  locale: Locale;
  messages: Messages;
  /** Keep the bar pinned to the top; `false` lets it scroll away. */
  sticky?: boolean;
}) {
  const position = sticky ? 'sticky top-0 z-30' : 'relative z-30';

  return (
    <header className={`${position} flex w-full items-center justify-between border-b border-dwarf-border bg-dwarf-bg/90 px-4 py-2.5 backdrop-blur-sm`}>
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
      <div className="flex items-center gap-space-md">
        {/* Theme + locale behind the settings gear, reachable on every screen. */}
        <SettingsMenu locale={locale} messages={messages} />
      </div>
    </header>
  );
}
