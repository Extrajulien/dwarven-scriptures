'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NAV_LINKS } from '../../data/homepageData';
import Icon from '../Icon';
import type { Messages } from '../../i18n/messages';

/**
 * Mobile navigation disclosure: a hamburger button that opens a panel whose
 * first entry is the home link (`/`) — so the brand button can be "consumed"
 * when space runs out — followed by the shared `NAV_LINKS`. Hidden at `xl`,
 * where the inline desktop nav takes over. The trigger is a real `<button>`
 * and the panel closes on link click, outside-click and Escape.
 */
export default function MobileMenu({ messages }: { messages: Messages }) {
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
    <div ref={rootRef} className="relative xl:hidden">
      <button
        type="button"
        aria-label={messages['nav.menu']}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded border border-outline-variant bg-surface-container-high text-on-surface-variant transition-colors hover:text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <Icon name="menu" className="text-headline-sm leading-none" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-space-sm flex min-w-max flex-col rounded border border-outline-variant bg-surface-container-lowest p-space-sm shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
          <nav aria-label={messages['nav.menu']} className="flex min-w-[220px] flex-col">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="px-space-md py-space-sm font-label-md text-label-md uppercase text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
            >
              {messages['nav.home']}
            </Link>
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="px-space-md py-space-sm font-label-md text-label-md uppercase text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
              >
                {messages[link.labelKey]}
              </a>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
