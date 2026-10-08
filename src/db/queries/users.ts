import { and, eq, sql } from 'drizzle-orm';
import { db } from '..';
import {
  userResources,
  userStats,
  users,
  type User,
  type UserProfileWithStatsInternal,
} from '../schema';

/**
 * Data access for the user tables.
 *
 * Two rules drive everything here:
 *
 * 1. **Lookups by an external identifier.** Callers pass a `publicId` or a
 *    `username`, never an internal `users.id`, so row ids stay inside the
 *    database.
 * 2. **Mutations are atomic.** Counters move with SQL expressions (or an
 *    upsert) inside a single statement, so two concurrent races can never
 *    clobber each other through a read-modify-write in JavaScript.
 */

/** Raised when a requested user does not exist. */
export class UserNotFoundError extends Error {
  constructor(identifier: string) {
    super(`No user matches ${identifier}`);
    this.name = 'UserNotFoundError';
  }
}

/** Raised for input the database must not be asked to store. */
export class InvalidUserInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUserInputError';
  }
}

/** Raised when spending coins would take the balance below zero. */
export class InsufficientCoinsError extends Error {
  constructor(internalUserId: number) {
    super(`User ${internalUserId} does not have enough coins for this operation`);
    this.name = 'InsufficientCoinsError';
  }
}

/** Raised when a race report moves stats backwards. */
export class InvalidRaceReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRaceReportError';
  }
}

const USERNAME_MAX_LENGTH = 32;

export type NewUserParams = {
  username: string;
  passwordHash: string;
  pfpUrl?: string | null;
};

export type UserIdentifier = {
  publicId?: string;
  username?: string;
};

export type RecordCompletedRaceParams = {
  internalUserId: number;
  wordsTyped: number;
  timeMs: number;
  wpm: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertNonEmptyString(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidUserInputError(`${field} must be a non-empty string`);
  }
}

/**
 * Creates a user plus its `user_stats` and `user_resources` rows.
 *
 * All three inserts share one transaction: a user without its child rows would
 * break every read path, so a partial write is never allowed to commit.
 */
export async function createUserWithProfiles(data: NewUserParams): Promise<User> {
  const username = data.username?.trim();

  assertNonEmptyString(username, 'username');
  if (username.length > USERNAME_MAX_LENGTH) {
    throw new InvalidUserInputError(
      `username must be at most ${USERNAME_MAX_LENGTH} characters`,
    );
  }
  assertNonEmptyString(data.passwordHash, 'passwordHash');

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        username,
        passwordHash: data.passwordHash,
        pfpUrl: data.pfpUrl ?? null,
      })
      .returning();

    if (!created) {
      throw new Error('Failed to create user: the insert returned no row');
    }

    const now = new Date();
    await tx.insert(userStats).values({ userId: created.id, updatedAt: now });
    await tx.insert(userResources).values({ userId: created.id, updatedAt: now });

    return created;
  });
}

/**
 * Loads a profile by `publicId` or `username` slug.
 *
 * Returns `null` when nothing matches, so HTTP layers can answer 404 without
 * catching an exception. The returned row carries the internal `id` for
 * follow-up writes but never `passwordHash`; use the `UserProfileWithStats`
 * type when serialising a response.
 */
export async function getUserFullProfile(
  identifier: UserIdentifier,
): Promise<UserProfileWithStatsInternal | null> {
  const match = buildIdentifierMatch(identifier);

  const rows = await db
    .select({
      id: users.id,
      publicId: users.publicId,
      username: users.username,
      passwordHash: users.passwordHash,
      pfpUrl: users.pfpUrl,
      createdAt: users.createdAt,
      racesCompleted: userStats.racesCompleted,
      totalWords: userStats.totalWords,
      totalTimeMs: userStats.totalTimeMs,
      bestWpm: userStats.bestWpm,
      coins: userResources.coins,
      gems: userResources.gems,
    })
    .from(users)
    .leftJoin(userStats, eq(userStats.userId, users.id))
    .leftJoin(userResources, eq(userResources.userId, users.id))
    .where(match)
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  // The password hash is read only to keep the column list explicit; it must
  // never leave this function.
  const { passwordHash: _passwordHash, ...profile } = row;
  void _passwordHash;

  return {
    ...profile,
    racesCompleted: profile.racesCompleted ?? 0,
    totalWords: profile.totalWords ?? 0n,
    totalTimeMs: profile.totalTimeMs ?? 0n,
    bestWpm: profile.bestWpm ?? '0.00',
    coins: profile.coins ?? 0n,
    gems: profile.gems ?? 0,
    avgWpm: computeAverageWpm(profile.totalWords ?? 0n, profile.totalTimeMs ?? 0n),
  };
}

/**
 * Folds a finished race into the user's lifetime stats.
 *
 * The row is upserted so a user created outside this module (or one whose stats
 * row is missing) still gets a correct row, and every counter is incremented in
 * the database so concurrent finishes cannot lose writes.
 */
export async function recordCompletedRace(
  params: RecordCompletedRaceParams,
): Promise<void> {
  const { internalUserId, wordsTyped, timeMs, wpm } = params;

  if (!Number.isSafeInteger(internalUserId) || internalUserId <= 0) {
    throw new InvalidRaceReportError('internalUserId must be a positive integer');
  }
  if (!Number.isFinite(wordsTyped) || wordsTyped < 0) {
    throw new InvalidRaceReportError('wordsTyped must be zero or greater');
  }
  if (!Number.isFinite(timeMs) || timeMs < 0) {
    throw new InvalidRaceReportError('timeMs must be zero or greater');
  }
  if (!Number.isFinite(wpm) || wpm < 0) {
    throw new InvalidRaceReportError('wpm must be zero or greater');
  }

  await db
    .insert(userStats)
    .values({
      userId: internalUserId,
      racesCompleted: 1,
      totalWords: BigInt(Math.trunc(wordsTyped)),
      totalTimeMs: BigInt(Math.trunc(timeMs)),
      bestWpm: wpm.toFixed(2),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userStats.userId,
      set: {
        racesCompleted: sql`${userStats.racesCompleted} + 1`,
        totalWords: sql`${userStats.totalWords} + ${BigInt(Math.trunc(wordsTyped))}`,
        totalTimeMs: sql`${userStats.totalTimeMs} + ${BigInt(Math.trunc(timeMs))}`,
        // GREATEST keeps a personal best: replaying a slower race must never
        // lower it.
        bestWpm: sql`GREATEST(${userStats.bestWpm}, ${wpm.toFixed(2)})`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Applies a signed coin delta atomically.
 *
 * The non-negative condition lives in the `WHERE` clause, so two concurrent
 * spends cannot both observe the same balance and overdraw it. A zero-row
 * result therefore means "insufficient funds"; a missing user is reported
 * separately by one follow-up existence check.
 */
export async function adjustUserCoins(
  internalUserId: number,
  deltaAmount: bigint,
): Promise<void> {
  if (!Number.isSafeInteger(internalUserId) || internalUserId <= 0) {
    throw new InvalidUserInputError('internalUserId must be a positive integer');
  }

  const updated = await db
    .update(userResources)
    .set({
      coins: sql`${userResources.coins} + ${deltaAmount}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userResources.userId, internalUserId),
        sql`(${userResources.coins} + ${deltaAmount}) >= 0`,
      ),
    )
    .returning({ coins: userResources.coins });

  if (updated.length > 0) {
    return;
  }

  const existing = await db
    .select({ userId: userResources.userId })
    .from(userResources)
    .where(eq(userResources.userId, internalUserId))
    .limit(1);

  if (existing.length === 0) {
    throw new UserNotFoundError(`internal id ${internalUserId}`);
  }

  throw new InsufficientCoinsError(internalUserId);
}

/**
 * `totalWords / (totalTimeMs / 60000)`, or `0` when no time is recorded yet.
 */
function computeAverageWpm(totalWords: bigint, totalTimeMs: bigint): number {
  if (totalTimeMs <= 0n) {
    return 0;
  }

  return Number(totalWords) / (Number(totalTimeMs) / 60_000);
}

function buildIdentifierMatch(identifier: UserIdentifier) {
  if (identifier.publicId) {
    if (!UUID_PATTERN.test(identifier.publicId)) {
      throw new InvalidUserInputError('publicId must be a UUID');
    }

    return eq(users.publicId, identifier.publicId);
  }

  if (identifier.username) {
    return eq(users.username, identifier.username.trim());
  }

  throw new InvalidUserInputError('Provide either publicId or username');
}
