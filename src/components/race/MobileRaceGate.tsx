'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { Messages } from '../../i18n/messages';
import SpriteTile from '../../sprites/SpriteTile';
import Icon from '../Icon';

/**
 * DES-06 mobile race gate: on mobile viewports the race's typing interaction
 * (the `TypingZone`) is REPLACED by a dwarf-styled stone notice recommending
 * a physical keyboard, while the progress track and the live top-3 stay
 * visible above it — spectator-like viewing (documented choice, see
 * `doc/EXIGENCES.md` → « Choix à documenter »). The parent keeps controls
 * that are not typing input: the quit button and, for a host on the waiting
 * screen, the start button (hosting a race from a phone while participants
 * type on keyboards is legitimate — the start button lives outside this
 * gate). On desktop the children render exactly as before.
 *
 * ## Breakpoint choice (DES-06)
 * Mobile = viewports strictly below Tailwind's `md` breakpoint (768 px):
 * `matchMedia('(max-width: 767px)')`. `md` was chosen over `sm` (640 px)
 * because phones in landscape (≈ 640–850 px) would still fall below it, and
 * the on-screen keyboard makes the typing zone unusable there; ≥ 768 px
 * (tablets, desktop) keeps the full race, as such devices commonly pair with
 * a physical keyboard.
 *
 * ## SSR safety
 * The server and the first client render default to desktop (`false`); the
 * effect below then synchronises with the real viewport, so hydration never
 * mismatches. On a phone the desktop zone can paint for one effect tick
 * before the notice appears — the accepted trade-off for the documented
 * "sensible server default of desktop". When `matchMedia` does not exist
 * (legacy browsers, jsdom tests) the gate stays on desktop.
 *
 * Detection is driven by the media query's `change` event AND re-checked on
 * window `resize`, covering browsers that only re-evaluate the query on
 * resize (e.g. URL-bar collapse, zoom).
 */

/** Viewports strictly below Tailwind's `md` breakpoint (768 px) — see above. */
export const MOBILE_RACE_MEDIA_QUERY = '(max-width: 767px)';

type MobileRaceGateProps = {
  /** The desktop race interaction (the typing zone). */
  children: ReactNode;
  messages: Messages;
};

export default function MobileRaceGate({ children, messages }: MobileRaceGateProps) {
  // SSR-safe server default: desktop (false).
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return; // no matchMedia (jsdom / legacy): keep the desktop view
    }
    const query = window.matchMedia(MOBILE_RACE_MEDIA_QUERY);
    const sync = () => setIsMobile(query.matches);
    sync();
    query.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    return () => {
      query.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  if (!isMobile) {
    // Desktop: the race renders exactly as before (children passthrough).
    return <>{children}</>;
  }

  return (
    <div
      data-testid="mobile-race-notice"
      role="status"
      className="relative flex w-full min-w-0 flex-col gap-space-md overflow-hidden rounded border border-dwarf-border bg-surface-container-lowest p-space-lg shadow-xl"
    >
      {/* Stone tunnel gates (sprite tiles — no emoji) frame the panel exactly
          like the track lane, keeping the DES-04 dwarf-cave look. */}
      <SpriteTile
        spriteKey="terrain.wall-west"
        scale={1}
        className="absolute left-0 top-1/2 h-8 w-8 -translate-y-1/2"
      />
      <SpriteTile
        spriteKey="terrain.wall-east"
        scale={1}
        className="absolute right-0 top-1/2 h-8 w-8 -translate-y-1/2"
      />
      <div className="flex min-w-0 items-center gap-space-sm px-10">
        <Icon name="keyboard" className="shrink-0 text-headline-md text-dwarf-gold" />
        <h3 className="min-w-0 font-headline-sm text-headline-sm uppercase tracking-wide text-primary">
          {messages['mobile.raceTitle']}
        </h3>
      </div>
      <p className="min-w-0 px-10 font-body-sm text-body-sm text-dwarf-parchmentMuted">
        {messages['mobile.raceBody']}
      </p>
    </div>
  );
}
