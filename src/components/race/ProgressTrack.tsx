'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Messages } from '../../i18n/messages';
import {
  deriveRanking,
  interpolatePosition,
  positionFraction,
  type TrackTick,
} from '../../lib/race/track';
import type { RaceTrackParticipant } from '../../realtime/client-types';
import SpriteTile from '../../sprites/SpriteTile';
import TrackMarker from './TrackMarker';

/**
 * The dwarf-cave progress track — the signature element (DES-04, COURSE-05):
 * a stone tunnel lane (theme tokens + the sprite system: `terrain.wall-west`
 * entrance and `terrain.wall-east` exit tiles, a gold finish line, no
 * gradients, no emojis) with one marker per participant.
 *
 * Smoothness (COURSE-05): the server broadcasts `raceTick` at most ~4×/s;
 * this component keeps the previous tick and re-renders on a ~60 Hz
 * client-clock pulse, deriving each marker's in-between progress with
 * {@link interpolatePosition} — so the perceived update rate is ≥ ~4/s
 * between server ticks. The clock is a 16 ms interval rather than
 * `requestAnimationFrame` so Jest fake timers can advance the interpolation
 * deterministically (the jsdom rAF shim recurses at 0 ms and would spin under
 * fake timers); in a real browser a 16 ms interval tracks the display
 * refresh closely enough for identical smoothness.
 *
 * BONUS-04 coherence: every marker's percentage is derived from the
 * participant's OWN effective total length (`raceTick.totalLength`), so a
 * bonus-adjusted text never distorts the track. A bonus flash (BONUS-03)
 * briefly glows the targeted marker via {@link TrackMarker}'s `bonusFlash`.
 *
 * Accessibility: markers are labelled groups, the local marker carries an
 * i18n "you" tag, and a visually-hidden `aria-live="polite"` region
 * announces the local participant's rank changes (GAME-3 tie-in).
 *
 * Responsive 360 px (DES-06): the lane is full-width inside a `min-w-0`
 * container, markers compress (name truncation, small chips) and their
 * position math keeps them inside the lane, so the page never overflows
 * horizontally.
 */

/** Client-clock pulse period driving the interpolation (≈60 Hz). */
export const TRACK_CLOCK_INTERVAL_MS = 16;

export type ProgressTrackProps = {
  /** Participants from the latest `raceTick` (COURSE-05 aggregated view). */
  participants: RaceTrackParticipant[];
  /** `tickAt` of the latest tick, used as the interpolation window's end. */
  lastTickAt: string | null;
  /** The viewer's participant id, for the local highlight and announcements. */
  localParticipantId: string;
  /** participantId → finish rank, from `participantFinished` (finish badges). */
  finishRanks: Record<string, number>;
  /** participantId → profile picture URL for user participants (optional). */
  pfpUrls?: Record<string, string | null>;
  /** The participant a bonus just hit (BONUS-03): its marker glows ~2 s. */
  flashParticipantId?: string | null;
  messages: Messages;
};

export default function ProgressTrack({
  participants,
  lastTickAt,
  localParticipantId,
  finishRanks,
  pfpUrls = {},
  flashParticipantId = null,
  messages,
}: ProgressTrackProps) {
  // Client-clock pulse: while markers exist, re-render ~60×/s so the
  // interpolation between server ticks is visible (COURSE-05).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (participants.length === 0) {
      return;
    }
    const id = setInterval(() => setNowMs(Date.now()), TRACK_CLOCK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [participants.length]);

  // Previous tick, so two consecutive samples can be interpolated. The latest
  // tick is always derived from the props; the pair is adjusted *during
  // render* (React's documented "adjust state when props change" pattern) so
  // the previous tick is available on the same render that shows the new one
  // and no effect has to mirror props into state.
  const [tickPair, setTickPair] = useState<{ prev: TrackTick | null; current: TrackTick } | null>(
    null,
  );
  const nextPair: { prev: TrackTick | null; current: TrackTick } | null =
    lastTickAt === null
      ? null
      : (() => {
          const current: TrackTick = { tickAt: lastTickAt, participants };
          if (tickPair === null) {
            return { prev: null, current };
          }
          if (tickPair.current.tickAt === current.tickAt) {
            // Same tick (e.g. a `participantFinished` refresh): keep the pair.
            return { prev: tickPair.prev, current };
          }
          return { prev: tickPair.current, current };
        })();
  if (
    nextPair === null
      ? tickPair !== null
      : tickPair === null ||
        tickPair.current.tickAt !== nextPair.current.tickAt ||
        tickPair.current.participants !== nextPair.current.participants
  ) {
    setTickPair(nextPair);
  }

  const finishOrder = useMemo(
    () => new Map(Object.entries(finishRanks).map(([key, rank]) => [key, rank] as const)),
    [finishRanks],
  );
  const ranking = useMemo(() => deriveRanking(participants, finishOrder), [participants, finishOrder]);

  const currentTick = tickPair?.current ?? null;
  const prevTick = tickPair?.prev ?? null;
  const localRank =
    ranking.find((candidate) => candidate.participantId === localParticipantId)?.rank ?? null;

  if (participants.length === 0) {
    return null;
  }

  return (
    <section
      data-testid="progress-track"
      aria-label={messages['track.title']}
      className="flex w-full min-w-0 flex-col gap-space-sm rounded bg-surface-container-lowest p-space-md shadow-xl"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-space-xs">
        <h2 className="font-label-md text-label-md uppercase text-dwarf-gold">
          {messages['track.title']}
        </h2>
        <span className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted">
          {messages['track.liveHint']}
        </span>
      </div>

      <div className="relative h-28 w-full min-w-0">
        {/* The stone tunnel lane: sprite-tile gates + gold finish line. */}
        <div
          data-testid="track-lane"
          className="absolute inset-x-0 bottom-0 h-8 overflow-hidden rounded-sm border border-dwarf-border bg-dwarf-track shadow-stone-inner"
        >
          <SpriteTile
            spriteKey="terrain.wall-west"
            scale={1}
            className="absolute left-0 top-0 h-8 w-8"
          />
          <SpriteTile
            spriteKey="terrain.wall-east"
            scale={1}
            className="absolute right-0 top-0 h-8 w-8"
          />
          <span
            data-testid="track-finish-line"
            aria-hidden="true"
            className="absolute right-8 top-0 h-full w-0.5 bg-dwarf-gold"
          />
        </div>

        {ranking.map((entry) => {
          // BONUS-04: every marker's percentage comes from the participant's
          // OWN effective total length (bonus-adjusted), never the shared
          // base length — interpolated positions use the same per-participant
          // denominators inside `interpolatePosition`.
          const progress =
            currentTick !== null
              ? interpolatePosition(entry, prevTick, currentTick, nowMs)
              : positionFraction(entry.position, entry.totalLength);
          return (
            <TrackMarker
              key={entry.participantId}
              participant={entry}
              progress={progress}
              isLocal={entry.participantId === localParticipantId}
              finishRank={finishRanks[entry.participantId] ?? null}
              pfpUrl={pfpUrls[entry.participantId]}
              bonusFlash={entry.participantId === flashParticipantId}
              messages={messages}
            />
          );
        })}
      </div>

      {/* GAME-3 tie-in: the local rank changes are announced to screen readers. */}
      <span aria-live="polite" data-testid="track-rank-announcer" className="sr-only">
        {localRank !== null ? `${messages['track.rankLabel']} ${localRank}` : ''}
      </span>
    </section>
  );
}
