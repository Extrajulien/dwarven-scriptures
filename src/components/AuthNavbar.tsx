import { SITE } from '../data/site';
import type { Locale, Messages } from '../i18n/messages';
import LocaleSelector from './Navbar/LocaleSelector';
import ButtonSecondary from './ButtonSecondary';

/**
 * Lean auth navbar: the site name (a secondary button) linking back to the
 * home page, plus the FR/EN locale selector (I18N-02 — the selector is
 * reachable from every page, including the auth screens). Shared by the
 * `/login` and `/register` screens via the `(auth)` layout.
 */
export default function AuthNavbar({
  locale,
  messages,
}: {
  locale: Locale;
  messages: Messages;
}) {
  return (
    <header className="sticky top-0 z-30 flex w-full items-center justify-between border-b border-dwarf-border bg-dwarf-bg/90 px-4 py-2.5 backdrop-blur-sm">
      <ButtonSecondary href="/" aria-label={SITE.name}>
        <img
          alt={messages['chrome.siteLogoAlt']}
          className="h-6 w-6 rounded-sm object-contain"
          src={SITE.logoUrl}
        />
        <span className="font-display text-sm font-bold tracking-wider text-dwarf-gold">
          {SITE.name}
        </span>
      </ButtonSecondary>
      <LocaleSelector locale={locale} messages={messages} />
    </header>
  );
}
