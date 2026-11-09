/**
 * In-memory sliding-window rate limiter (SALLE-10).
 *
 * SALLE-10 wants brute-force protection on room-code joins: by default at most
 * `ROOM_CODE_JOIN_MAX_ATTEMPTS` attempts per IP per
 * `ROOM_CODE_JOIN_WINDOW_MS`. Each key (an IP address) keeps the timestamps of
 * its recent attempts; an attempt is allowed only when fewer than the cap fall
 * inside the current window. Old timestamps are pruned lazily, so memory stays
 * proportional to recent traffic.
 *
 * **Single-instance assumption:** the state lives in this process's memory. If
 * the realtime layer later runs Next.js and a WebSocket server as separate
 * processes, each would keep its own window — an attacker spreading attempts
 * across instances could exceed the cap. This is acceptable for the current
 * single-instance deployment (documented in `doc/database.md`); a shared store
 * (Redis/PostgreSQL) is the upgrade path if multi-process serving becomes
 * real. The limiter is deliberately a small class so that swap is local.
 */

export const ROOM_CODE_JOIN_MAX_ATTEMPTS = 10;
export const ROOM_CODE_JOIN_WINDOW_MS = 60_000;

/**
 * Avatar uploads are throttled per authenticated user (AUTH-04): at most 5
 * uploads per minute per user. The key is the session `publicId`, never an
 * IP, so the cap follows the account; each upload writes up to 2 MB into
 * PostgreSQL, so the limit also keeps storage writes bounded (SEC-01).
 */
export const AVATAR_UPLOAD_MAX_ATTEMPTS = 5;
export const AVATAR_UPLOAD_WINDOW_MS = 60_000;

/** Raised when an attempt would exceed the window's cap. */
export class RateLimitExceededError extends Error {
  constructor(
    readonly key: string,
    readonly retryAfterMs: number,
  ) {
    super(`rate limit exceeded for ${key}; retry in ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = 'RateLimitExceededError';
  }
}

export type SlidingWindowLimiterOptions = {
  maxAttempts: number;
  windowMs: number;
  /** Injectable clock for tests (milliseconds since the Unix epoch). */
  now?: () => number;
};

/**
 * Sliding-window limiter keyed by an arbitrary string (usually an IP). Not
 * thread-safe by itself, but Node runs JavaScript handlers sequentially per
 * process, which is enough for server actions.
 */
export class SlidingWindowRateLimiter {
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly attempts: Map<string, number[]> = new Map();

  constructor(options: SlidingWindowLimiterOptions) {
    if (!Number.isSafeInteger(options.maxAttempts) || options.maxAttempts <= 0) {
      throw new Error('maxAttempts must be a positive integer');
    }
    if (!Number.isSafeInteger(options.windowMs) || options.windowMs <= 0) {
      throw new Error('windowMs must be a positive integer');
    }
    this.maxAttempts = options.maxAttempts;
    this.windowMs = options.windowMs;
    this.now = options.now ?? Date.now;
  }

  /**
   * Records one attempt for `key`. When the window already holds
   * `maxAttempts` attempts, throws `RateLimitExceededError` (with the time
   * until the oldest attempt expires) and records nothing.
   */
  check(key: string): void {
    const current = this.now();
    const recent = this.pruneKey(key, current);

    if (recent.length >= this.maxAttempts) {
      const retryAfterMs = Math.max(0, this.windowMs - (current - recent[0]));
      throw new RateLimitExceededError(key, retryAfterMs);
    }

    recent.push(current);
    this.attempts.set(key, recent);
  }

  /** Attempts still available for `key` inside the current window. */
  remaining(key: string): number {
    const recent = this.pruneKey(key, this.now());
    return Math.max(0, this.maxAttempts - recent.length);
  }

  /** Forgets the window of one key (used by tests; useful after a successful join). */
  reset(key: string): void {
    this.attempts.delete(key);
  }

  /**
   * Number of keys currently tracked after pruning fully-expired windows.
   * Exposed for monitoring and tests.
   */
  size(): number {
    this.prune();
    return this.attempts.size;
  }

  /**
   * Removes every key whose last attempt has fully expired, so a long-running
   * process does not accumulate dead windows. Called from `check`/`remaining`
   * for a single key; call explicitly from a timer when traffic is heavy and
   * key turnover matters.
   */
  prune(): void {
    const current = this.now();
    for (const [key, timestamps] of this.attempts) {
      if (timestamps.every((timestamp) => current - timestamp >= this.windowMs)) {
        this.attempts.delete(key);
      }
    }
  }

  /** Drops the expired attempts of `key` and returns the fresh window. */
  private pruneKey(key: string, current: number): number[] {
    const stored = this.attempts.get(key) ?? [];
    const recent = stored.filter((timestamp) => current - timestamp < this.windowMs);
    this.attempts.set(key, recent);
    return recent;
  }
}

/** Shared limiter for room-code join attempts (SALLE-10: 10 per 60 s per IP). */
export const roomCodeJoinLimiter = new SlidingWindowRateLimiter({
  maxAttempts: ROOM_CODE_JOIN_MAX_ATTEMPTS,
  windowMs: ROOM_CODE_JOIN_WINDOW_MS,
});

/**
 * Shared limiter for avatar uploads, keyed by the authenticated user's
 * `publicId` (AUTH-04: 5 per 60 s per user). Same single-instance assumption
 * as the room-code limiter above; `src/app/account/actions.ts` maps a
 * `RateLimitExceededError` to the typed `rateLimited` result.
 */
export const avatarUploadLimiter = new SlidingWindowRateLimiter({
  maxAttempts: AVATAR_UPLOAD_MAX_ATTEMPTS,
  windowMs: AVATAR_UPLOAD_WINDOW_MS,
});
