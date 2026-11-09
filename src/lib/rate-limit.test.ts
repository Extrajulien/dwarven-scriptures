/**
 * @jest-environment node
 *
 * Unit tests for the sliding-window rate limiter (SALLE-10). The clock is
 * injected so time can be advanced deterministically.
 */

import {
  avatarUploadLimiter,
  AVATAR_UPLOAD_MAX_ATTEMPTS,
  AVATAR_UPLOAD_WINDOW_MS,
  RateLimitExceededError,
  roomCodeJoinLimiter,
  ROOM_CODE_JOIN_MAX_ATTEMPTS,
  ROOM_CODE_JOIN_WINDOW_MS,
  SlidingWindowRateLimiter,
} from './rate-limit';

function makeLimiter(
  options: { maxAttempts?: number; windowMs?: number } = {},
): { limiter: SlidingWindowRateLimiter; advance: (ms: number) => void } {
  let now = 1_000_000;
  const limiter = new SlidingWindowRateLimiter({
    maxAttempts: options.maxAttempts ?? ROOM_CODE_JOIN_MAX_ATTEMPTS,
    windowMs: options.windowMs ?? ROOM_CODE_JOIN_WINDOW_MS,
    now: () => now,
  });
  return {
    limiter,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('SlidingWindowRateLimiter', () => {
  test('allows up to maxAttempts attempts within the window', () => {
    const { limiter } = makeLimiter();

    for (let attempt = 0; attempt < ROOM_CODE_JOIN_MAX_ATTEMPTS; attempt += 1) {
      expect(() => limiter.check('10.0.0.1')).not.toThrow();
    }
    expect(limiter.remaining('10.0.0.1')).toBe(0);
  });

  test('rejects the attempt after the cap, with a retry delay', () => {
    const { limiter } = makeLimiter();

    for (let attempt = 0; attempt < ROOM_CODE_JOIN_MAX_ATTEMPTS; attempt += 1) {
      limiter.check('10.0.0.1');
    }

    expect(() => limiter.check('10.0.0.1')).toThrow(RateLimitExceededError);
    try {
      limiter.check('10.0.0.1');
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitExceededError);
      expect((error as RateLimitExceededError).key).toBe('10.0.0.1');
      expect((error as RateLimitExceededError).retryAfterMs).toBe(ROOM_CODE_JOIN_WINDOW_MS);
    }
  });

  test('a rejected attempt is not recorded', () => {
    const { limiter } = makeLimiter({ maxAttempts: 2, windowMs: 60_000 });

    limiter.check('k');
    limiter.check('k');
    expect(() => limiter.check('k')).toThrow(RateLimitExceededError);
    // Two allowed + one rejected = still 0 remaining, not negative.
    expect(limiter.remaining('k')).toBe(0);
  });

  test('tracks each key independently', () => {
    const { limiter } = makeLimiter({ maxAttempts: 2, windowMs: 60_000 });

    limiter.check('a');
    limiter.check('a');
    expect(() => limiter.check('a')).toThrow(RateLimitExceededError);
    expect(() => limiter.check('b')).not.toThrow();
  });

  test('the window slides: an old attempt falls out once it expires', () => {
    const { limiter, advance } = makeLimiter({ maxAttempts: 2, windowMs: 60_000 });

    limiter.check('k');
    advance(30_000);
    limiter.check('k');
    expect(() => limiter.check('k')).toThrow(RateLimitExceededError);

    // 31 s later the first attempt is out of the 60 s window; one slot is free.
    advance(31_000);
    expect(() => limiter.check('k')).not.toThrow();
    expect(limiter.remaining('k')).toBe(0);
  });

  test('a full window frees up entirely after the window elapses', () => {
    const { limiter, advance } = makeLimiter({ maxAttempts: 1, windowMs: 60_000 });

    limiter.check('k');
    expect(() => limiter.check('k')).toThrow(RateLimitExceededError);

    advance(60_000);
    expect(() => limiter.check('k')).not.toThrow();
  });

  test('reset forgets the window of a key', () => {
    const { limiter } = makeLimiter({ maxAttempts: 1, windowMs: 60_000 });

    limiter.check('k');
    expect(() => limiter.check('k')).toThrow(RateLimitExceededError);

    limiter.reset('k');
    expect(() => limiter.check('k')).not.toThrow();
  });

  test('prune drops keys whose attempts have all expired and keeps fresh ones', () => {
    const { limiter, advance } = makeLimiter({ maxAttempts: 2, windowMs: 60_000 });

    limiter.check('dead');
    advance(30_000);
    limiter.check('alive');
    advance(31_000); // t=61s: 'dead' fully expired, 'alive' attempted 31s ago

    expect(limiter.size()).toBe(1);

    advance(30_000); // t=91s: 'alive' fully expired too
    expect(limiter.size()).toBe(0);
  });

  test('size prunes and counts the tracked keys', () => {
    const { limiter } = makeLimiter({ maxAttempts: 2, windowMs: 60_000 });

    expect(limiter.size()).toBe(0);
    limiter.check('a');
    limiter.check('b');
    expect(limiter.size()).toBe(2);
  });

  test('rejects a non-positive configuration', () => {
    expect(() => new SlidingWindowRateLimiter({ maxAttempts: 0, windowMs: 1000 })).toThrow(
      /maxAttempts/,
    );
    expect(() => new SlidingWindowRateLimiter({ maxAttempts: 1, windowMs: 0 })).toThrow(
      /windowMs/,
    );
  });

  test('the shared room-code limiter exists with the SALLE-10 defaults', () => {
    expect(roomCodeJoinLimiter).toBeInstanceOf(SlidingWindowRateLimiter);
    expect(roomCodeJoinLimiter.remaining('127.0.0.1')).toBe(ROOM_CODE_JOIN_MAX_ATTEMPTS);
  });
});

describe('shared defaults (SALLE-10)', () => {
  test('exports the documented cap and window', () => {
    expect(ROOM_CODE_JOIN_MAX_ATTEMPTS).toBe(10);
    expect(ROOM_CODE_JOIN_WINDOW_MS).toBe(60_000);
  });
});

describe('shared avatar-upload limiter (AUTH-04: 5 per 60 s per user)', () => {
  test('exports the documented cap and window', () => {
    expect(AVATAR_UPLOAD_MAX_ATTEMPTS).toBe(5);
    expect(AVATAR_UPLOAD_WINDOW_MS).toBe(60_000);
  });

  test('the shared limiter exists with the AUTH-04 defaults', () => {
    expect(avatarUploadLimiter).toBeInstanceOf(SlidingWindowRateLimiter);
    expect(avatarUploadLimiter.remaining('avatar:some-user')).toBe(AVATAR_UPLOAD_MAX_ATTEMPTS);
  });

  test('tracks upload keys independently from room-code keys', () => {
    expect(avatarUploadLimiter).not.toBe(roomCodeJoinLimiter);
  });
});
