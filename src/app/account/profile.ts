import type { UserProfileWithStatsInternal } from '../../db/schema';

/**
 * Serializable projection of a user's account, handed to the account screen
 * components. `bigint` and `Date` values are converted to serializable forms
 * here because they cannot cross the server/client boundary, and the internal
 * `id` (plus the raw `totalTimeMs`) is dropped so it can never reach the
 * client ([AGENTS.md](../../AGENTS.md) — internal ids never leave the server).
 *
 * Numbers and dates are emitted *unformatted*: the account components format
 * them with the active locale through `src/i18n/format.ts` (I18N-03).
 */

export type AccountProfile = {
  username: string;
  pfpUrl: string | null;
  /** ISO-8601 instant; formatted with the active locale at render time. */
  createdAt: string;
  racesCompleted: number;
  /** Raw digit string (bigint-safe, no grouping), e.g. `148920`. */
  totalWords: string;
  bestWpm: number;
  avgWpm: number;
  /** Races won (AUTH-06). */
  wins: number;
  /** Correct ÷ total keystrokes × 100, derived at read time (AUTH-06). */
  avgAccuracy: number;
  /** Raw digit string (bigint-safe, no grouping), e.g. `4820`. */
  coins: string;
  gems: number;
  linkedProviders: string[];
};

export function toAccountProfile(
  profile: UserProfileWithStatsInternal,
  linkedProviders: string[],
): AccountProfile {
  return {
    username: profile.username,
    pfpUrl: profile.pfpUrl,
    createdAt: profile.createdAt.toISOString(),
    racesCompleted: profile.racesCompleted,
    totalWords: profile.totalWords.toString(),
    bestWpm: toFiniteNumber(profile.bestWpm),
    avgWpm: profile.avgWpm,
    wins: profile.wins,
    avgAccuracy: profile.avgAccuracy,
    coins: profile.coins.toString(),
    gems: profile.gems,
    linkedProviders,
  };
}

/** `numeric(6,2)` surfaces as a string like `112.00`; parse to a number. */
function toFiniteNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
