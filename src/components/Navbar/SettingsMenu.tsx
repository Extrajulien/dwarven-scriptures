'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import type { Locale, Messages } from '../../i18n/messages';
import LocaleSelector from './LocaleSelector';
import ThemeSelector from './ThemeSelector';

/**
 * Collapses the locale (I18N-02) and theme (DES-05) selectors behind a single
 * gear button so the navbar stays uncluttered, especially on mobile. The two
 * selectors are reused unchanged inside a disclosure panel; the trigger is a
 * real `<button>` (a11y: no clickable divs) and the panel closes on
 * outside-click and Escape.
 */
export default function SettingsMenu({
  locale,
  messages,
}: {
  locale: Locale;
  messages: Messages;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (rootRef.current && target instanceof Node && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={messages['nav.settings']}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded border border-outline-variant bg-surface-container-high text-on-surface-variant transition-colors hover:text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <Icon name="settings" className="text-headline-sm leading-none" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-space-sm flex min-w-max flex-col gap-space-md rounded border border-outline-variant bg-surface-container-lowest p-space-md shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
          <LocaleSelector locale={locale} messages={messages} />
          <ThemeSelector messages={messages} />
        </div>
      )}
    </div>
  );
}
