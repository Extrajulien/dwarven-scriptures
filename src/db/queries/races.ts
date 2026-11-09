import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '..';
import type { RaceResultsPayload } from '../../realtime/race-engine';
import { raceParticipants, races, users } from '../schema';
import { recordCompletedRace } from './users';

/**
 * Persistence and history of finished races (RES-05, HIST-01/02).
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
 *
 * ## History pagination (HIST-01)
 *
 * `listUserRaces` uses **LIMIT/OFFSET** rather than a keyset cursor: the
 * history page needs a total count for its page numbers, the per-user row
 * count stays modest (one page of 10 races each), and the partial unique
 * index `race_participants_user_id_idx` keeps the OFFSET scan cheap. The
 * trade-off — deep pages re-scan the prefix — is acceptable here and
 * documented; a keyset cursor can replace it if the history grows.
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
  textLanguage: 'fr' | 'en';
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

/** Column capacity of `numeric(8,2)` (`wpm`, `rawWpm`, `bestWpm`). */
const MAX_PERSISTED_WPM = 999_999.99;

/**
 * Clamps a persisted WPM to the representable, meaningful range. A race that
 * ends milliseconds after the typing start yields an astronomic Annexe-A WPM
 * (or `Infinity` at 0 ms): rather than failing the whole race write, the
 * value is bounded to the column capacity and non-finite values land at 0
 * (`GREATEST` then keeps the previous personal best). Humans never hit this
 * boundary — it is a storage-level defence behind the engine's rules.
 */
export function clampPersistedWpm(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(round2(value), 0), MAX_PERSISTED_WPM);
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
      wpm: clampPersistedWpm(result.wpm),
      rawWpm: clampPersistedWpm(result.rawWpm),
      accuracy: clampPersistedWpm(result.accuracy),
      errors: Math.trunc(result.errors),
      correctKeystrokes: Math.trunc(result.correctKeystrokes),
      totalKeystrokes: Math.trunc(result.totalKeystrokes),
      status: result.status,
      finishedAtMs: Math.trunc(result.endedAtMs),
      rank: result.rank,
      bonusesReceived: Math.max(0, Math.trunc(result.bonusesReceived)),
      wpmSeries: result.wpmSeries.map((point) => ({
        elapsedMs: Math.trunc(point.elapsedMs),
        wpm: clampPersistedWpm(point.wpm),
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

// ------------------------------------------------------------------ history

/** Rows shown per history page (HIST-01). */
export const HISTORY_PAGE_SIZE = 10;

/** One history row: the race plus the user's own participant line. */
export type UserRaceHistoryEntry = {
  /** Race public id — the link target of the replay page (HIST-02). */
  publicId: string;
  /** ISO 639-1 code of the race text (`fr` | `en`). */
  textLanguage: string;
  finishedAt: Date;
  durationMs: number;
  /** The user's own result in this race. */
  rank: number;
  wpm: number;
  accuracy: number;
  status: 'finished' | 'timeout' | 'quit';
  finishedAtMs: number;
};

export type RaceHistoryPage = {
  entries: UserRaceHistoryEntry[];
  /** Total number of finished races the user took part in. */
  totalCount: number;
  /** 1-based page actually returned (clamped into range). */
  page: number;
  pageSize: number;
  totalPages: number;
};

/** `numeric` columns surface as strings; parse them back to numbers. */
function toFiniteNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Paginated race history of a connected user (HIST-01), newest first.
 * `page` starts at 1; out-of-range pages clamp to the last page. The
 * internal user id never leaves this module.
 */
export async function listUserRaces(
  internalUserId: number,
  options: { page?: number; pageSize?: number } = {},
): Promise<RaceHistoryPage> {
  if (!Number.isSafeInteger(internalUserId) || internalUserId <= 0) {
    throw new InvalidRacePersistenceError('internalUserId must be a positive integer');
  }
  const pageSize = Math.min(
    Math.max(1, options.pageSize ?? HISTORY_PAGE_SIZE),
    50,
  );
  const page = Math.max(1, options.page ?? 1);

  const [total] = await db
    .select({ value: count() })
    .from(raceParticipants)
    .where(eq(raceParticipants.userId, internalUserId));
  const totalCount = total?.value ?? 0;
  const totalPages = Math.max(0, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, Math.max(1, totalPages));

  const rows = await db
    .select({
      publicId: races.publicId,
      textLanguage: races.textLanguage,
      finishedAt: races.finishedAt,
      durationMs: races.durationMs,
      rank: raceParticipants.rank,
      wpm: raceParticipants.wpm,
      accuracy: raceParticipants.accuracy,
      status: raceParticipants.status,
      finishedAtMs: raceParticipants.finishedAtMs,
    })
    .from(raceParticipants)
    .innerJoin(races, eq(raceParticipants.raceId, races.id))
    .where(eq(raceParticipants.userId, internalUserId))
    .orderBy(desc(races.finishedAt), desc(raceParticipants.rank))
    .limit(pageSize)
    .offset((safePage - 1) * pageSize);

  return {
    entries: rows.map((row) => ({
      publicId: row.publicId,
      textLanguage: row.textLanguage,
      finishedAt: row.finishedAt,
      durationMs: row.durationMs,
      rank: row.rank,
      wpm: toFiniteNumber(row.wpm),
      accuracy: toFiniteNumber(row.accuracy),
      status: row.status,
      finishedAtMs: row.finishedAtMs,
    })),
    totalCount,
    page: safePage,
    pageSize,
    totalPages,
  };
}

/**
 * The user's most recent races, oldest first — the WPM-progression series
 * of the account charts (AUTH-06, STAT-3).
 */
export async function listRecentUserRaces(
  internalUserId: number,
  limit: number,
): Promise<UserRaceHistoryEntry[]> {
  if (!Number.isSafeInteger(internalUserId) || internalUserId <= 0) {
    throw new InvalidRacePersistenceError('internalUserId must be a positive integer');
  }
  const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), 50);

  const rows = await db
    .select({
      publicId: races.publicId,
      textLanguage: races.textLanguage,
      finishedAt: races.finishedAt,
      durationMs: races.durationMs,
      rank: raceParticipants.rank,
      wpm: raceParticipants.wpm,
      accuracy: raceParticipants.accuracy,
      status: raceParticipants.status,
      finishedAtMs: raceParticipants.finishedAtMs,
    })
    .from(raceParticipants)
    .innerJoin(races, eq(raceParticipants.raceId, races.id))
    .where(eq(raceParticipants.userId, internalUserId))
    .orderBy(desc(races.finishedAt))
    .limit(safeLimit);

  const newestFirst = rows.map((row) => ({
    publicId: row.publicId,
    textLanguage: row.textLanguage,
    finishedAt: row.finishedAt,
    durationMs: row.durationMs,
    rank: row.rank,
    wpm: toFiniteNumber(row.wpm),
    accuracy: toFiniteNumber(row.accuracy),
    status: row.status,
    finishedAtMs: row.finishedAtMs,
  }));

  // Chart order: chronological, oldest at the left.
  return newestFirst.reverse();
}

export type RaceCountPerDay = {
  /** `YYYY-MM-DD` in UTC. */
  day: string;
  count: number;
};

/**
 * Finished races per UTC day for the account "races" bar chart (STAT-3).
 * Only the last `days` calendar days are aggregated, in SQL.
 */
export async function countUserRacesPerDay(
  internalUserId: number,
  options: { days?: number; now?: Date } = {},
): Promise<RaceCountPerDay[]> {
  if (!Number.isSafeInteger(internalUserId) || internalUserId <= 0) {
    throw new InvalidRacePersistenceError('internalUserId must be a positive integer');
  }
  const days = Math.min(Math.max(1, Math.trunc(options.days ?? 6)), 30);
  const now = options.now ?? new Date();
  const windowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1_000);

  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${races.finishedAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      value: count(),
    })
    .from(raceParticipants)
    .innerJoin(races, eq(raceParticipants.raceId, races.id))
    .where(
      and(
        eq(raceParticipants.userId, internalUserId),
        sql`${races.finishedAt} >= ${windowStart}`,
      ),
    )
    .groupBy(sql`date_trunc('day', ${races.finishedAt} at time zone 'UTC')`);

  return rows.map((row) => ({ day: row.day, count: row.value }));
}

// ------------------------------------------------------------------- replay

/** One participant line of the public replay view (HIST-02). */
export type RaceReplayParticipant = {
  /** Wire identity (user public id or guest token), like `raceFinished`. */
  participantId: string;
  displayName: string;
  kind: 'user' | 'guest' | 'bot';
  /** Profile picture for user participants; `null` for guests/bots. */
  pfpUrl: string | null;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  errors: number;
  status: 'finished' | 'timeout' | 'quit';
  finishedAtMs: number;
  rank: number;
  bonusesReceived: number;
  wpmSeries: Array<{ elapsedMs: number; wpm: number }>;
};

/** The public, client-safe replay view of a persisted race (HIST-02). */
export type RaceReplayView = {
  publicId: string;
  textBody: string;
  textLanguage: string;
  status: 'finished' | 'aborted';
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  results: RaceReplayParticipant[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Loads a persisted race by its public id for the replay page (HIST-02).
 * Returns `null` when absent so the page can answer 404. Internal ids never
 * leave this module: participants are keyed by their wire identity (user
 * public id or guest token).
 */
export async function getRaceForReplay(publicId: string): Promise<RaceReplayView | null> {
  if (typeof publicId !== 'string' || !UUID_PATTERN.test(publicId)) {
    return null;
  }

  const [race] = await db
    .select()
    .from(races)
    .where(eq(races.publicId, publicId))
    .limit(1);
  if (!race) {
    return null;
  }

  const rows = await db
    .select({
      kind: raceParticipants.kind,
      userId: raceParticipants.userId,
      guestToken: raceParticipants.guestToken,
      displayName: raceParticipants.displayName,
      wpm: raceParticipants.wpm,
      rawWpm: raceParticipants.rawWpm,
      accuracy: raceParticipants.accuracy,
      errors: raceParticipants.errors,
      status: raceParticipants.status,
      finishedAtMs: raceParticipants.finishedAtMs,
      rank: raceParticipants.rank,
      bonusesReceived: raceParticipants.bonusesReceived,
      wpmSeries: raceParticipants.wpmSeries,
      userPublicId: users.publicId,
      pfpUrl: users.pfpUrl,
    })
    .from(raceParticipants)
    .leftJoin(users, eq(raceParticipants.userId, users.id))
    .where(eq(raceParticipants.raceId, race.id))
    .orderBy(asc(raceParticipants.rank));

  return {
    publicId: race.publicId,
    textBody: race.textBody,
    textLanguage: race.textLanguage,
    status: race.status,
    startedAt: race.startedAt,
    finishedAt: race.finishedAt,
    durationMs: race.durationMs,
    results: rows.map((row) => ({
      // Bots carry no persisted identity (kind 'bot'), so the replay id is
      // derived from the unique rank: `bot-<rank>` is stable and unique
      // within the race (the live race's synthetic UUID is not persisted).
      participantId:
        row.kind === 'bot'
          ? `bot-${row.rank}`
          : ((row.kind === 'user' ? row.userPublicId : row.guestToken) ?? ''),
      displayName: row.displayName,
      kind: row.kind,
      pfpUrl: row.kind === 'user' ? row.pfpUrl : null,
      wpm: toFiniteNumber(row.wpm),
      rawWpm: toFiniteNumber(row.rawWpm),
      accuracy: toFiniteNumber(row.accuracy),
      errors: row.errors,
      status: row.status,
      finishedAtMs: row.finishedAtMs,
      rank: row.rank,
      bonusesReceived: row.bonusesReceived,
      wpmSeries: row.wpmSeries,
    })),
  };
}
