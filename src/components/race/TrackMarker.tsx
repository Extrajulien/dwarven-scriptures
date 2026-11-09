'use client';

import type { CSSProperties } from 'react';
import type { Messages } from '../../i18n/messages';
import type { RankedTrackParticipant } from '../../lib/race/track';
import type { RaceTrackParticipant } from '../../realtime/client-types';
import UserAvatar from '../UserAvatar';
import GuestAvatar from '../rooms/GuestAvatar';

/**
 * One participant marker on the progress track (COURSE-05): the avatar
 * (UserAvatar / GuestAvatar pattern; bots get a distinct stone rune until
 * their dedicated Phase-4 marker — BOT-04), the display name, a live WPM chip
 * and, for finishers, the finish-order badge. The marker is positioned by the
 * parent through a `--track-progress` custom property: the marker column is
 * `var(--track-marker-w)` wide and its `left` is
 * `calc(progress * (100% - var(--track-marker-w)))`, so the marker never
 * spills out of the lane even at progress 0 or 1 (no horizontal overflow at
 * 360 px — DES-06).
 *
 * The local participant gets a gold ring + glow and the i18n "you" tag; the
 * live top-3 get a gold name. Markers are labelled (`role="group"` +
 * `aria-label`) and the parent announces rank changes through an
 * `aria-live` region (GAME-3 tie-in).
 */

function MarkerAvatar({
  participant,
  pfpUrl,
}: {
  participant: RaceTrackParticipant;
  pfpUrl?: string | null;
}) {
  switch (participant.kind) {
    case 'user':
      return (
        <UserAvatar
          pfpUrl={pfpUrl ?? null}
          username={participant.displayName}
          className="h-9 w-9 shrink-0 sm:h-10 sm:w-10"
          iconClassName="text-headline-sm"
        />
      );
    case 'guest':
      return (
        <GuestAvatar
          seed={participant.participantId}
          className="h-9 w-9 shrink-0 text-headline-sm sm:h-10 sm:w-10"
        />
      );
    case 'bot':
      // Bots get their own marker design in Phase 4 (BOT-04); until then they
      // ride the track with a distinct muted stone rune so they never look
      // like human participants.
      return (
        <span
          data-testid="track-marker-bot"
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-dwarf-border bg-dwarf-basalt font-display text-headline-sm text-dwarf-parchmentMuted sm:h-10 sm:w-10"
        >
          {'ᛝ'}
        </span>
      );
  }
}

export type TrackMarkerProps = {
  participant: RankedTrackParticipant;
  /** Interpolated progress in [0, 1] — drives the marker position. */
  progress: number;
  isLocal: boolean;
  /** Finish rank (1 = first) when this participant has finished; else null. */
  finishRank: number | null;
  pfpUrl?: string | null;
  messages: Messages;
};

export default function TrackMarker({
  participant,
  progress,
  isLocal,
  finishRank,
  pfpUrl,
  messages,
}: TrackMarkerProps) {
  const isTop3 = participant.rank <= 3;
  const ariaLabel = [
    `${messages['track.rankLabel']} ${participant.rank}`,
    participant.displayName,
    `${Math.round(participant.wpm)} ${messages['race.liveWpmLabel']}`,
    finishRank !== null ? `${messages['track.finishLabel']} ${finishRank}` : null,
  ]
    .filter(Boolean)
    .join(' — ');

  return (
    <div
      data-testid={`track-marker-${participant.participantId}`}
      data-rank={participant.rank}
      data-local={isLocal ? 'true' : 'false'}
      data-top3={isTop3 ? 'true' : 'false'}
      data-finished={participant.finished ? 'true' : 'false'}
      data-progress={progress.toFixed(3)}
      role="group"
      aria-label={ariaLabel}
      className={`absolute bottom-0 w-[3.5rem] [--track-marker-w:3.5rem] sm:w-16 sm:[--track-marker-w:4rem] ${
        isLocal ? 'z-10' : ''
      }`}
      style={
        {
          '--track-progress': progress.toFixed(4),
          left: 'calc(var(--track-progress) * (100% - var(--track-marker-w)))',
        } as CSSProperties
      }
    >
      <div className="flex w-full flex-col items-center gap-0.5">
        <span className="flex h-4 items-start justify-center">
          {finishRank !== null && (
            <span
              data-testid="track-finish-badge"
              className="rounded bg-dwarf-gold px-1 font-mono text-[10px] font-bold leading-4 text-dwarf-abyss"
            >
              {finishRank}
            </span>
          )}
        </span>
        <span
          data-testid="track-wpm-chip"
          className="max-w-full truncate rounded bg-dwarf-slate px-1 font-label-sm text-label-sm text-on-surface"
        >
          {Math.round(participant.wpm)} {messages['race.liveWpmLabel']}
        </span>
        <span
          className={`max-w-full truncate text-center font-body-sm text-body-sm ${
            isTop3 || isLocal ? 'text-dwarf-gold' : 'text-dwarf-parchment'
          }`}
        >
          {participant.displayName}
        </span>
        <span className={`relative rounded ${isLocal ? 'ring-2 ring-dwarf-gold shadow-gold-glow' : ''}`}>
          <MarkerAvatar participant={participant} pfpUrl={pfpUrl} />
          {isLocal && (
            <span
              data-testid="track-you-tag"
              className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-dwarf-gold px-1 font-label-sm text-label-sm font-bold uppercase text-dwarf-abyss"
            >
              {messages['track.youTag']}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
