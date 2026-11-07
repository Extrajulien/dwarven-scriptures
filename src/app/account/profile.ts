import type { UserProfileWithStatsInternal } from '../../db/schema';

/**
 * Serializable projection of a user's account, handed to the account screen
 * components. `bigint` and `Date` values are converted to strings here because
 * they cannot cross the server/client boundary, and the internal `id` (plus the
 * raw `totalTimeMs`) is dropped so it can never reach the client
 * ([AGENTS.md](../../AGENTS.md) — internal ids never leave the server).
 */

export type AccountProfile = {
  username: string;
  pfpUrl: string | null;
  /** Formatted as `YYYY-MM-DD` (UTC). */
  createdAt: string;
  racesCompleted: number;
  /** Locale-free thousands-grouped string, e.g. `148,920`. */
  totalWords: string;
  /** Trimmed numeric string, e.g. `112` for `112.00`. */
  bestWpm: string;
  /** One-decimal string, e.g. `84.6`. */
  avgWpm: string;
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
    createdAt: formatDate(profile.createdAt),
    racesCompleted: profile.racesCompleted,
    totalWords: formatCount(profile.totalWords),
    bestWpm: formatBestWpm(profile.bestWpm),
    avgWpm: profile.avgWpm.toFixed(1),
    coins: formatCount(profile.coins),
    gems: profile.gems,
    linkedProviders,
  };
}

/** Groups a `bigint` with thousands separators without relying on ICU/locale. */
function formatCount(value: bigint): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return negative ? `-${grouped}` : grouped;
}

/** `numeric(6,2)` surfaces as a string like `112.00`; trim trailing zeros. */
function formatBestWpm(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toString() : '0';
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
