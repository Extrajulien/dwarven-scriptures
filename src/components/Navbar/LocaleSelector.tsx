'use client';

import { setLocale } from '../../i18n/locale-actions';
import type { Locale, Messages } from '../../i18n/messages';

/**
 * I18N-02: the dwarf-styled FR/EN selector replacing the old `[ENG/FR]`
 * placeholder. Each option is its own form calling the `setLocale` server
 * action with a hidden `locale` field, so switching works without JavaScript
 * too; the cookie write re-renders the page in the chosen language. The
 * active locale is highlighted stone-gold and announced with `aria-pressed`.
 */
const OPTIONS = [
  {
    code: 'fr',
    labelKey: 'locale.fr',
    ariaKey: 'locale.switchToFr',
  },
  {
    code: 'en',
    labelKey: 'locale.en',
    ariaKey: 'locale.switchToEn',
  },
] as const satisfies readonly {
  code: Locale;
  labelKey: keyof Messages;
  ariaKey: keyof Messages;
}[];

export default function LocaleSelector({
  locale,
  messages,
}: {
  locale: Locale;
  messages: Messages;
}) {
  return (
    <div
      className="inline-flex items-center rounded border border-outline-variant bg-surface-container-high p-0.5"
      role="group"
      aria-label="FR / EN"
    >
      {OPTIONS.map((option) => {
        const active = option.code === locale;
        return (
          <form key={option.code} action={setLocale}>
            <input type="hidden" name="locale" value={option.code} />
            <button
              type="submit"
              aria-pressed={active}
              // WCAG 2.5.3 (Label in Name): the visible text (FR/EN) leads
              // the accessible name as a real token — parentheticals are
              // stripped by the matching rule, so it cannot sit in "(…)".
              aria-label={`${messages[option.labelKey]}: ${messages[option.ariaKey]}`}
              className={
                active
                  ? 'rounded-[3px] bg-primary px-2 py-0.5 font-label-sm text-label-sm font-bold uppercase tracking-wider text-on-primary shadow-[0_0_6px_rgba(217,119,6,0.4)]'
                  : 'rounded-[3px] px-2 py-0.5 font-label-sm text-label-sm font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:text-primary'
              }
            >
              {messages[option.labelKey]}
            </button>
          </form>
        );
      })}
    </div>
  );
}
