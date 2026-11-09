import type { RaceTrackParticipant } from '../../realtime/client-types';

/**
 * Pure client-side logic for the progress track (COURSE-05, GAME-2/3):
 * interpolation between the aggregated `raceTick` samples, live ranking and
 * local overtake detection.
 *
 * Everything here is deterministic and free of React, DOM and network I/O —
 * the components in `src/components/race/` render it, and the unit tests
 * cover the boundaries. The server stays authoritative (COURSE-06): these
 * helpers only *display* the server's positions, they never produce
 * competitive values.
 *
 * ## Smoothness (COURSE-05)
 *
 * The server broadcasts `raceTick` at most ~4×/s (`RACE_TICK_BROADCAST_INTERVAL_MS`
 * in `src/realtime/race-engine.ts`). Between two ticks the track re-renders on
 * a ~60 Hz client-clock pulse and {@link interpolatePosition} derives each
 * marker's in-between progress from the client clock, so the perceived update
 * rate is ≥ ~4/s even though the network only carries ~4 samples per second.
 *
 * ## Easing choice (documented)
 *
 * Both `'linear'` and `'ease-out'` are implemented. `'ease-out'` (cubic,
 * `1 - (1 - t)^3`) is the default: right after a tick lands, a marker moves
 * briskly towards the new sample and decelerates as it approaches it, which
 * smooths the ~250 ms quantization steps of the server without ever
 * overshooting. `'linear'` is the honest constant-speed alternative and is
 * what the tests use for exact-boundary assertions.
 */

/** One aggregated server tick as seen by the track (`raceTick` payload). */
export type TrackTick = {
  /** ISO timestamp carried by the tick message (server clock). */
  tickAt: string;
  participants: RaceTrackParticipant[];
};

/** Interpolation mode between two tick samples. */
export type TrackEasing = 'linear' | 'ease-out';

/** Clamps a number into [0, 1]. */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Normalized track progress (0..1) of a raw character position. */
export function positionFraction(position: number, totalLength: number | null): number {
  if (totalLength === null || totalLength <= 0) {
    return 0;
  }
  return clamp01(position / totalLength);
}

/** Cubic ease-out over a 0..1 input: fast start, soft arrival, no overshoot. */
export function easeOutCubic(t: number): number {
  const clamped = clamp01(t);
  return 1 - (1 - clamped) ** 3;
}

/**
 * Interpolates one participant's track progress (0..1) between two
 * consecutive `raceTick` samples using the client clock.
 *
 * @param participant the participant to place — its entry in `nextTick`
 * @param prevTick the previous aggregated tick (`null` on the first tick)
 * @param nextTick the latest aggregated tick (must contain `participant`)
 * @param nowMs client clock (epoch ms)
 * @param totalLength total characters of the race text (spaces included);
 *   `null` before the text is known
 * @param easing `'linear'` or `'ease-out'` (default: `'ease-out'`, see above)
 * @returns a progress in [0, 1], clamped even outside the tick window
 */
export function interpolatePosition(
  participant: RaceTrackParticipant,
  prevTick: TrackTick | null,
  nextTick: TrackTick,
  nowMs: number,
  totalLength: number | null,
  easing: TrackEasing = 'ease-out',
): number {
  const nextProgress = positionFraction(participant.position, totalLength);
  if (prevTick === null) {
    return nextProgress;
  }
  const previous = prevTick.participants.find(
    (candidate) => candidate.participantId === participant.participantId,
  );
  const prevAtMs = Date.parse(prevTick.tickAt);
  const nextAtMs = Date.parse(nextTick.tickAt);
  if (
    previous === undefined ||
    !Number.isFinite(prevAtMs) ||
    !Number.isFinite(nextAtMs) ||
    nextAtMs <= prevAtMs
  ) {
    // First appearance, an invalid clock pair, or a repeated timestamp:
    // there is no meaningful window to interpolate across.
    return nextProgress;
  }
  const prevProgress = positionFraction(previous.position, totalLength);
  if (nextProgress < prevProgress) {
    // The server only ever moves positions forward (COURSE-06 monotonic
    // counters); on a defensive backwards sample, trust the latest value.
    return nextProgress;
  }
  const alpha = clamp01((nowMs - prevAtMs) / (nextAtMs - prevAtMs));
  const eased = easing === 'linear' ? alpha : easeOutCubic(alpha);
  return clamp01(prevProgress + (nextProgress - prevProgress) * eased);
}

/** A participant with its derived 1-based live rank. */
export type RankedTrackParticipant = RaceTrackParticipant & { rank: number };

/**
 * Live ranking of the track (GAME-2 groundwork): finished participants
 * first, ordered by their finish rank when known, then everyone else by
 * position desc, then WPM desc; the participantId is the stable final
 * tie-break, so the ordering is deterministic regardless of input order.
 *
 * Returns fresh objects — the input array is never mutated.
 */
export function deriveRanking(
  participants: RaceTrackParticipant[],
  finishOrder: ReadonlyMap<string, number> = new Map(),
): RankedTrackParticipant[] {
  const sorted = [...participants].sort((a, b) => {
    if (a.finished !== b.finished) {
      return a.finished ? -1 : 1;
    }
    if (a.finished) {
      const aRank = finishOrder.get(a.participantId) ?? null;
      const bRank = finishOrder.get(b.participantId) ?? null;
      if (aRank !== null && bRank !== null && aRank !== bRank) {
        return aRank - bRank;
      }
      if (aRank !== null && bRank === null) {
        return -1;
      }
      if (aRank === null && bRank !== null) {
        return 1;
      }
    }
    if (a.position !== b.position) {
      return b.position - a.position;
    }
    if (a.wpm !== b.wpm) {
      return b.wpm - a.wpm;
    }
    if (a.participantId !== b.participantId) {
      return a.participantId < b.participantId ? -1 : 1;
    }
    return 0;
  });
  return sorted.map((participant, index) => ({ ...participant, rank: index + 1 }));
}

/**
 * A rank change that concerns the local participant (GAME-3).
 *
 * Only the LOCAL participant's changes are reported: `overtook`/`up` when
 * their rank improved (they passed the participant who was directly ahead),
 * `overtaken`/`down` when their rank worsened (the participant now directly
 * ahead passed them). A single tick transition yields at most one event;
 * the indicator component applies a "latest wins" policy when events pile up.
 */
export type RankChangeEvent = {
  type: 'overtook' | 'overtaken';
  /** 'up': the local participant gained a rank; 'down': they lost one. */
  direction: 'up' | 'down';
  /** The directly involved other participant (passed / passer). `kind` lets
   * the UI localize bot display names (BOT-04). */
  other: { participantId: string; displayName: string; kind: RaceTrackParticipant['kind'] };
  /** The local participant's rank after the change (1-based). */
  rank: number;
};

/**
 * Compares two consecutive live rankings and reports the local participant's
 * rank change, if any (GAME-3). Returns an empty array when the local rank
 * is unchanged or the local participant is absent from either ranking.
 */
export function detectRankChanges(
  prevRanking: RankedTrackParticipant[],
  nextRanking: RankedTrackParticipant[],
  localParticipantId: string,
): RankChangeEvent[] {
  const prevLocal = prevRanking.find(
    (candidate) => candidate.participantId === localParticipantId,
  );
  const nextLocal = nextRanking.find(
    (candidate) => candidate.participantId === localParticipantId,
  );
  if (prevLocal === undefined || nextLocal === undefined) {
    return [];
  }

  if (nextLocal.rank < prevLocal.rank) {
    // Improved: report the participant who was directly ahead before.
    const overtaken = prevRanking.find((candidate) => candidate.rank === prevLocal.rank - 1);
    if (overtaken === undefined) {
      return [];
    }
    return [
      {
        type: 'overtook',
        direction: 'up',
        other: {
          participantId: overtaken.participantId,
          displayName: overtaken.displayName,
          kind: overtaken.kind,
        },
        rank: nextLocal.rank,
      },
    ];
  }

  if (nextLocal.rank > prevLocal.rank) {
    // Worsened: report the participant who is directly ahead now.
    const passer = nextRanking.find((candidate) => candidate.rank === nextLocal.rank - 1);
    if (passer === undefined) {
      return [];
    }
    return [
      {
        type: 'overtaken',
        direction: 'down',
        other: {
          participantId: passer.participantId,
          displayName: passer.displayName,
          kind: passer.kind,
        },
        rank: nextLocal.rank,
      },
    ];
  }

  return [];
}
