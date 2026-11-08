import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';

/**
 * Pure token codec for guest sessions — no `next/headers`, no environment
 * reads (mirrors [`session-token.ts`](session-token.ts)).
 *
 * `src/lib/guest-session.ts` re-exports everything from here and adds the
 * cookie layer. The realtime layer imports **this** module (it must decode
 * the guest cookie of a WebSocket upgrade request before the Next server
 * context exists; importing `next/headers` at that point corrupts Next's
 * module graph at boot).
 *
 * A guest session is deliberately not a user account: it carries a random
 * `guestId` (uuid, generated server-side) and a display nickname, nothing
 * else. The same signing secret as the user session (`SESSION_SECRET`) is
 * reused — the two payloads have disjoint shapes (see `session-token.ts`).
 */

export const GUEST_COOKIE_NAME = 'guest';

/** Guest session lifetime in seconds (30 days, like the user session). */
export const GUEST_TTL_SECONDS = 30 * 24 * 60 * 60;

export const GUEST_NICKNAME_MIN_LENGTH = 3;
export const GUEST_NICKNAME_MAX_LENGTH = 20;

/**
 * The nickname rule required by AUTH-02: 3–20 characters after trimming. The
 * module exports the schema itself so callers (the `setGuestNickname` action)
 * validate with exactly the same rule instead of re-typing it.
 */
export const guestNicknameSchema = z
  .string()
  .trim()
  .min(GUEST_NICKNAME_MIN_LENGTH)
  .max(GUEST_NICKNAME_MAX_LENGTH);

export type GuestSessionPayload = {
  guestId: string;
  nickname: string;
  /** Absolute expiry as Unix seconds. */
  exp: number;
};

export type GuestSession = {
  guestId: string;
  nickname: string;
};

function hmac(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

/** Signs a payload into a `body.signature` token. Exported for unit testing. */
export function encodeGuestToken(payload: GuestSessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = hmac(body, secret).toString('base64url');
  return `${body}.${signature}`;
}

/**
 * Verifies a token and returns its payload, or `null` for any malformed,
 * tampered or expired input. Exported for unit testing.
 */
export function decodeGuestToken(token: string, secret: string): GuestSessionPayload | null {
  const separator = token.indexOf('.');
  // Exactly one dot, with a non-empty body and signature on each side.
  if (separator <= 0 || separator === token.length - 1 || token.indexOf('.', separator + 1) !== -1) {
    return null;
  }

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = hmac(body, secret);
    provided = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }

  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!isGuestSessionPayload(parsed)) {
      return null;
    }
    if (parsed.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isGuestSessionPayload(value: unknown): value is GuestSessionPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.guestId === 'string' &&
    typeof record.nickname === 'string' &&
    typeof record.exp === 'number'
  );
}
