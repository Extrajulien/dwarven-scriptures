'use client';

import { useEffect, useState } from 'react';
import type { Messages } from '../../i18n/messages';
import { localizeBotDisplayName } from '../../lib/race/bot-display';
import type { RaceTrackParticipant } from '../../realtime/client-types';
import type { BonusAppliedMessage } from '../../realtime/protocol';

/**
 * Comeback-bonus announcements (BONUS-03): every `bonusApplied` event gets a
 * compact feed line visible to the whole room — rune/stone styling, no
 * emojis (DES-04) — and, when the event targeted the LOCAL participant, a
 * prominent banner that auto-dismisses (latest wins, ~4 s) and is announced
 * through an `aria-live="polite"` region. At most 3 events exist per race
 * (BONUS-01), so the feed never grows unbounded.
 *
 * The banner detection runs *during render* from the log reference (React's
 * documented "adjust state when props change" pattern, same as
 * `OvertakeIndicator`): a dismissed banner therefore never re-arms for an
 * old event, and a fresh local event restarts the dismiss timer.
 */

/** How long the local banner stays before it dismisses itself. */
export const BONUS_BANNER_DISMISS_MS = 4_000;

export type BonusAnnouncerProps = {
  /** The bonus events in order (from `RaceView.bonusLog`). */
  bonusLog: BonusAppliedMessage[];
  /** The latest track participants, to resolve the targeted display names. */
  participants: RaceTrackParticipant[];
  /** The viewer's wire identity — banner + aria announcements are local-only. */
  localParticipantId: string;
  messages: Messages;
};

/** Sign + localized unit of a word-count event (e.g. `+3 mots` / `−3 mots`). */
function wordDelta(event: BonusAppliedMessage, messages: Messages): string {
  const count =
    event.bonusType === 'addWords'
      ? (event.payload.words?.length ?? 0)
      : (event.payload.wordCount ?? 0);
  const sign = event.bonusType === 'addWords' ? '+' : '−';
  return `${sign}${count} ${messages['bonus.wordsUnit']}`;
}

/** The localized one-chip description of an event (feed + banner). */
function eventChip(event: BonusAppliedMessage, messages: Messages): string {
  if (event.bonusType === 'fog') {
    const seconds = Math.round((event.payload.durationMs ?? 0) / 1_000);
    return `${messages['bonus.fogChip']} ${seconds} s`;
  }
  return wordDelta(event, messages);
}

function resolveName(
  event: BonusAppliedMessage,
  participants: RaceTrackParticipant[],
  messages: Messages,
): string | null {
  const participant = participants.find(
    (candidate) => candidate.participantId === event.targetParticipantId,
  );
  if (participant === undefined) {
    return null;
  }
  return participant.kind === 'bot'
    ? localizeBotDisplayName(participant.displayName, messages)
    : participant.displayName;
}

export default function BonusAnnouncer({
  bonusLog,
  participants,
  localParticipantId,
  messages,
}: BonusAnnouncerProps) {
  const [prevLogLength, setPrevLogLength] = useState(0);
  const [bannerEvent, setBannerEvent] = useState<BonusAppliedMessage | null>(null);

  if (prevLogLength !== bonusLog.length) {
    setPrevLogLength(bonusLog.length);
    const latestLocal = [...bonusLog]
      .reverse()
      .find((event) => event.targetParticipantId === localParticipantId);
    if (latestLocal !== undefined) {
      setBannerEvent(latestLocal);
    }
  }

  // Auto-dismiss: every fresh local event restarts the timer ("latest wins").
  useEffect(() => {
    if (bannerEvent === null) {
      return;
    }
    const timer = setTimeout(() => setBannerEvent(null), BONUS_BANNER_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [bannerEvent]);

  const bannerText =
    bannerEvent === null
      ? null
      : bannerEvent.bonusType === 'fog'
        ? `${messages['bonus.banner.fog']} ${Math.round((bannerEvent.payload.durationMs ?? 0) / 1_000)} s`
        : `${wordDelta(bannerEvent, messages)} ${
            bannerEvent.bonusType === 'addWords'
              ? messages['bonus.banner.addWords']
              : messages['bonus.banner.removeWords']
          }`;

  return (
    <>
      {bannerText !== null && (
        <div
          data-testid="bonus-banner"
          data-bonus-type={bannerEvent?.bonusType ?? ''}
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-space-sm rounded border border-dwarf-gold bg-dwarf-basalt px-space-md py-space-sm shadow-stone-inner"
        >
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-dwarf-gold/60 bg-dwarf-slate font-mono text-label-md text-dwarf-gold"
          >
            {'ᛉ'}
          </span>
          <p
            data-testid="bonus-banner-text"
            className="min-w-0 font-label-md text-label-md text-dwarf-gold"
          >
            {bannerText}
          </p>
        </div>
      )}

      {bonusLog.length > 0 && (
        <ul
          data-testid="bonus-feed"
          className="flex w-full min-w-0 flex-col gap-space-xs rounded bg-surface-container-lowest p-space-md shadow-xl"
        >
          {bonusLog.map((event) => {
            const name = resolveName(event, participants, messages);
            if (name === null) {
              // The targeted participant left the latest tick: skip the line
              // rather than invent a name (at most 3 events per race).
              return null;
            }
            return (
              <li
                key={event.payload.at}
                data-testid="bonus-feed-line"
                data-bonus-type={event.bonusType}
                className="flex min-w-0 items-center gap-space-sm font-label-sm text-label-sm text-dwarf-parchment"
              >
                <span aria-hidden="true" className="shrink-0 font-mono text-dwarf-gold">
                  {'ᛉ'}
                </span>
                <span className="shrink-0">{messages['bonus.feedPrefix']}</span>
                <span className="truncate font-bold">{name}</span>
                <span className="shrink-0">{messages['bonus.feed.receives']}</span>
                <span className="shrink-0 rounded bg-dwarf-slate px-space-xs py-0.5 font-mono text-dwarf-gold">
                  {eventChip(event, messages)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
