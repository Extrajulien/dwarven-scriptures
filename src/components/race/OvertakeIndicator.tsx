'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Messages } from '../../i18n/messages';
import {
  deriveRanking,
  detectRankChanges,
  type RankChangeEvent,
  type RankedTrackParticipant,
} from '../../lib/race/track';
import type { RaceTrackParticipant } from '../../realtime/client-types';
import Icon from '../Icon';

/**
 * Peripheral overtake warning for the local player (GAME-3): when
 * {@link detectRankChanges} emits an event, a brief dwarf-styled strip shows
 * a rune-tile chevron (up: green rune, down: magma) plus the other player's
 * name and the local rank, and auto-dismisses after ~2.5 s. Rapid events
 * apply a "latest wins" policy — the newest event replaces the previous one
 * and restarts the dismiss timer, so panels never stack or spam. An
 * `aria-live="assertive"` region announces each event for screen readers.
 */

/** How long an overtake warning stays visible before it dismisses itself. */
export const OVERTAKE_DISMISS_MS = 2_500;

export type OvertakeIndicatorProps = {
  participants: RaceTrackParticipant[];
  localParticipantId: string;
  finishRanks: Record<string, number>;
  messages: Messages;
};

function sameEvent(current: RankChangeEvent | null, candidate: RankChangeEvent): boolean {
  return (
    current !== null &&
    current.type === candidate.type &&
    current.rank === candidate.rank &&
    current.other.participantId === candidate.other.participantId
  );
}

export default function OvertakeIndicator({
  participants,
  localParticipantId,
  finishRanks,
  messages,
}: OvertakeIndicatorProps) {
  const finishOrder = useMemo(
    () => new Map(Object.entries(finishRanks).map(([key, rank]) => [key, rank] as const)),
    [finishRanks],
  );
  const ranking = useMemo(() => deriveRanking(participants, finishOrder), [participants, finishOrder]);

  const [event, setEvent] = useState<RankChangeEvent | null>(null);
  const [prevRanking, setPrevRanking] = useState<RankedTrackParticipant[]>(ranking);

  // Detect rank changes *during render* (React's documented "adjust state
  // when props change" pattern): the previous ranking is state, not a ref, so
  // the newest event is visible on the same commit as the tick that caused
  // it and no effect has to mirror props into state.
  if (prevRanking !== ranking) {
    const events = detectRankChanges(prevRanking, ranking, localParticipantId);
    setPrevRanking(ranking);
    const latest = events[events.length - 1];
    if (latest !== undefined && !sameEvent(event, latest)) {
      setEvent(latest);
    }
  }

  // Auto-dismiss: every new event restarts the timer ("latest wins").
  useEffect(() => {
    if (event === null) {
      return;
    }
    const id = setTimeout(() => setEvent(null), OVERTAKE_DISMISS_MS);
    return () => clearTimeout(id);
  }, [event]);

  const announce =
    event === null
      ? ''
      : event.type === 'overtook'
        ? `${messages['overtake.ariaUp']} ${event.other.displayName} — ${messages['track.rankLabel']} ${event.rank}`
        : `${messages['overtake.ariaDown']} ${event.other.displayName} — ${messages['track.rankLabel']} ${event.rank}`;

  return (
    <>
      <span aria-live="assertive" data-testid="overtake-announcer" className="sr-only">
        {announce}
      </span>
      {event !== null && (
        <div
          data-testid="overtake-panel"
          data-direction={event.direction}
          className={`flex w-full min-w-0 items-center justify-center gap-space-sm rounded border px-space-md py-space-sm shadow-stone-inner ${
            event.type === 'overtook'
              ? 'border-dwarf-rune-bright/60 bg-dwarf-rune-badge text-dwarf-rune-bright'
              : 'border-dwarf-magma/60 bg-dwarf-basalt text-dwarf-magma'
          }`}
        >
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-current font-mono"
          >
            <Icon name={event.type === 'overtook' ? 'arrow_upward' : 'arrow_downward'} />
          </span>
          <p className="min-w-0 truncate font-label-md text-label-md">
            {event.type === 'overtook'
              ? `${messages['overtake.overtookPrefix']} ${event.other.displayName}`
              : `${event.other.displayName} ${messages['overtake.overtakenBySuffix']}`}
          </p>
          <span
            data-testid="overtake-rank"
            className="shrink-0 rounded bg-dwarf-slate px-space-xs py-0.5 font-label-sm text-label-sm text-dwarf-parchment"
          >
            {messages['track.rankLabel']} {event.rank}
          </span>
        </div>
      )}
    </>
  );
}
