import { db } from '..';
import type { RaceResultsPayload } from '../../realtime/race-engine';
import { raceParticipants, races } from '../schema';
import { recordCompletedRace } from './users';

/**
 * Persistence of finished races (RES-05, HIST-01/02).
 *
 * One race is persisted exactly once, at the `en_course → resultats`
 * transition, from the in-memory `RaceResultsPayload` the engine keeps
 * (`RaceEngine.takeResults`). The mapping engine payload → rows is a pure
 * function ({@link mapEngineResultsToPersistence}) so it is unit-tested
 * without a database; `persistRaceResult` then writes everything in one
 * transaction: race row, participant rows (bounded batch) and the SQL-side
 * `user_stats` increments for every human user participant.
 *
 * Guests and bots never touch `user_stats` (AUTH-03): only
 * `kind === 'user'` rows feed {@link recordCompletedRace}.
 */

/**
 * Annexe A word size: a "word" is 5 typed characters (spaces included), so
 * `totalWords += floor(totalKeystrokes / 5)` — the same convention the
 * engine's WPM formulas use.
 */
export const KEYSTROKES_PER_WORD = 5;

/**
 * Upper bound of a persistence batch. A room holds at most 30 participants
 * (SALLE-05) and bots do not race yet (Phase 4); the bound rejects an
 * oversized batch before it reaches the database.
 */
export const MAX_RACE_PARTICIPANTS = 30;

/** Raised when an engine payload cannot be persisted as-is. */
export class InvalidRacePersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRacePersistenceError';
  }
}

/** One participant row as the persistence layer wants it. */
export type PersistRaceParticipant = {
  kind: 'user' | 'guest' | 'bot';
  userId: number | null;
  guestToken: string | null;
  displayName: string;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  errors: number;
  /** Cumulative correct keystrokes at the participant's end (stats only). */
  correctKeystrokes: number;
  /** Cumulative total keystrokes at the participant's end (stats only). */
  totalKeystrokes: number;
  status: 'finished' | 'timeout' | 'quit';
  finishedAtMs: number;
  rank: number;
  bonusesReceived: number;
  wpmSeries: Array<{ elapsedMs: number; wpm: number }>;
};

/** The race row as the persistence layer wants it. */
export type PersistRace = {
  roomId: number;
  roomPublicId: string;
  textBody: string;
  textLanguage: string;
  config: RaceResultsPayload['config'];
  /** Only finished races are persisted today (see the aborted-races decision). */
  status: 'finished';
  durationMs: number;
  startedAt: Date;
  finishedAt: Date;
};

export type RacePersistenceInput = {
  race: PersistRace;
  participants: PersistRaceParticipant[];
};

/** `123.456` → `123.46` — what `numeric(8,2)`/`numeric(5,2)` will store. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Maps the engine's in-memory results payload to the persistence input
 * (pure, unit-tested). Numeric fields are rounded to the column scale and
 * the keystroke counters ride along so `user_stats` can be incremented
 * without a read.
 */
export function mapEngineResultsToPersistence(
  payload: RaceResultsPayload,
): RacePersistenceInput {
  return {
    race: {
      roomId: payload.roomId,
      roomPublicId: payload.roomPublicId,
      textBody: payload.textBody,
      textLanguage: payload.textLanguage,
      config: payload.config,
      status: 'finished',
      durationMs: Math.trunc(payload.durationMs),
      startedAt: payload.startedAt,
      finishedAt: payload.finishedAt,
    },
    participants: payload.results.map((result) => ({
      kind: result.kind,
      userId: result.userId,
      guestToken: result.guestToken,
      displayName: result.displayName,
      wpm: round2(result.wpm),
      rawWpm: round2(result.rawWpm),
      accuracy: round2(result.accuracy),
      errors: Math.trunc(result.errors),
      correctKeystrokes: Math.trunc(result.correctKeystrokes),
      totalKeystrokes: Math.trunc(result.totalKeystrokes),
      status: result.status,
      finishedAtMs: Math.trunc(result.endedAtMs),
      rank: result.rank,
      bonusesReceived: 0, // BONUS-01..04 arrive in Phase 4.
      wpmSeries: result.wpmSeries.map((point) => ({
        elapsedMs: Math.trunc(point.elapsedMs),
        wpm: round2(point.wpm),
      })),
    })),
  };
}

/**
 * Last line of defence before the writes: the batch bound and the
 * identity/kind coherence the database CHECK mirrors (AUTH-03). The CHECK
 * constraints remain the final guarantee; this raises a typed error first.
 */
export function validateRacePersistence(input: RacePersistenceInput): void {
  if (input.participants.length === 0) {
    throw new InvalidRacePersistenceError('a race must have at least one participant');
  }
  if (input.participants.length > MAX_RACE_PARTICIPANTS) {
    throw new InvalidRacePersistenceError(
      `a race cannot persist more than ${MAX_RACE_PARTICIPANTS} participants`,
    );
  }

  for (const participant of input.participants) {
    if (participant.kind === 'user' && (participant.userId === null || participant.guestToken !== null)) {
      throw new InvalidRacePersistenceError('a user participant must carry exactly a userId');
    }
    if (participant.kind === 'guest' && (participant.guestToken === null || participant.userId !== null)) {
      throw new InvalidRacePersistenceError('a guest participant must carry exactly a guestToken');
    }
    if (participant.kind === 'bot' && (participant.userId !== null || participant.guestToken !== null)) {
      throw new InvalidRacePersistenceError('a bot participant carries no identity');
    }
    if (!Number.isFinite(participant.wpm) || participant.wpm < 0) {
      throw new InvalidRacePersistenceError('participant wpm must be zero or greater');
    }
    if (!Number.isFinite(participant.accuracy) || participant.accuracy < 0 || participant.accuracy > 100) {
      throw new InvalidRacePersistenceError('participant accuracy must be between 0 and 100');
    }
    if (!Number.isSafeInteger(participant.rank) || participant.rank < 1) {
      throw new InvalidRacePersistenceError('participant rank must be a positive integer');
    }
  }
}

/**
 * Persists a finished race and its participants in ONE transaction, then
 * folds every human user participant into `user_stats` (RES-05, HIST-01).
 * All counters move inside the database (`recordCompletedRace`), so no
 * JavaScript read-modify-write can lose a concurrent finish.
 */
export async function persistRaceResult(payload: RaceResultsPayload): Promise<void> {
  const mapped = mapEngineResultsToPersistence(payload);
  validateRacePersistence(mapped);

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(races)
      .values({
        roomId: mapped.race.roomId,
        roomPublicId: mapped.race.roomPublicId,
        textBody: mapped.race.textBody,
        textLanguage: mapped.race.textLanguage,
        config: mapped.race.config,
        status: mapped.race.status,
        durationMs: mapped.race.durationMs,
        startedAt: mapped.race.startedAt,
        finishedAt: mapped.race.finishedAt,
      })
      .returning({ id: races.id });

    if (!created) {
      throw new Error('persistRaceResult: the race insert returned no row');
    }

    await tx.insert(raceParticipants).values(
      mapped.participants.map((participant) => ({
        raceId: created.id,
        kind: participant.kind,
        userId: participant.userId,
        guestToken: participant.guestToken,
        displayName: participant.displayName,
        // `numeric` columns are written as strings so no precision is lost.
        wpm: participant.wpm.toFixed(2),
        rawWpm: participant.rawWpm.toFixed(2),
        accuracy: participant.accuracy.toFixed(2),
        errors: participant.errors,
        status: participant.status,
        finishedAtMs: participant.finishedAtMs,
        rank: participant.rank,
        bonusesReceived: participant.bonusesReceived,
        wpmSeries: participant.wpmSeries,
      })),
    );

    for (const participant of mapped.participants) {
      // Guests and bots never touch user_stats (AUTH-03).
      if (participant.kind !== 'user' || participant.userId === null) {
        continue;
      }
      await recordCompletedRace(
        {
          internalUserId: participant.userId,
          wordsTyped: Math.floor(participant.totalKeystrokes / KEYSTROKES_PER_WORD),
          timeMs: participant.finishedAtMs,
          wpm: participant.wpm,
          // COURSE-10 ranks quits last: in a race everyone abandoned, the
          // rank-1 line is a quit and nobody is credited with a win.
          winsIncrement: participant.rank === 1 && participant.status !== 'quit' ? 1 : 0,
          correctKeystrokes: participant.correctKeystrokes,
          totalKeystrokes: participant.totalKeystrokes,
        },
        tx,
      );
    }
  });
}
