import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';

/**
 * Signed guest session (AUTH-02/03), mirroring `src/lib/session.ts` for users:
 * the same `body.signature` HMAC-SHA256 token, the same HttpOnly cookie
 * options, but its own cookie name and payload.
 *
 * A guest session is deliberately not a user account: it carries a random
 * `guestId` (uuid, generated server-side) and a display nickname, nothing
 * else. The same signing secret as the user session (`SESSION_SECRET`) is
 * reused — the two payloads have disjoint shapes, and a separate secret would
 * add a deployment knob without raising the bar (either secret compromise
 * forges identities anyway).
 *
 * This module is server-only by convention: it is imported only from server
 * actions and server components. Never import it from a client component.
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

/** Raised when `createGuestSession` is given a nickname that violates AUTH-02. */
export class InvalidGuestNicknameError extends Error {
  constructor() {
    super(
      `guest nickname must be ${GUEST_NICKNAME_MIN_LENGTH}-${GUEST_NICKNAME_MAX_LENGTH} characters after trimming`,
    );
    this.name = 'InvalidGuestNicknameError';
  }
}

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

function guestSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is not set in environment variables');
  }
  return secret;
}

/**
 * Creates a guest session for the given nickname and writes the signed
 * HttpOnly `guest` cookie. The nickname is re-validated here with
 * {@link guestNicknameSchema} even though the calling action validates first —
 * the cookie must never be written for an invalid name. Returns the session
 * (random `guestId` + trimmed nickname) so the caller can create the matching
 * `room_members` row. Must only be called from a Server Function or Route
 * Handler (cookie writes are not allowed during Server Component rendering).
 */
export async function createGuestSession(nickname: string): Promise<GuestSession> {
  const parsed = guestNicknameSchema.safeParse(nickname);
  if (!parsed.success) {
    throw new InvalidGuestNicknameError();
  }

  const session: GuestSession = {
    guestId: randomUUID(),
    nickname: parsed.data,
  };
  const payload: GuestSessionPayload = {
    ...session,
    exp: Math.floor(Date.now() / 1000) + GUEST_TTL_SECONDS,
  };

  const token = encodeGuestToken(payload, guestSecret());

  const store = await cookies();
  store.set(GUEST_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: GUEST_TTL_SECONDS,
  });

  return session;
}

/** Reads and verifies the guest cookie, returning the session or `null`. */
export async function getGuestSession(): Promise<GuestSession | null> {
  const store = await cookies();
  const token = store.get(GUEST_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const payload = decodeGuestToken(token, guestSecret());
  if (!payload) {
    return null;
  }

  return { guestId: payload.guestId, nickname: payload.nickname };
}

/** Deletes the guest cookie. */
export async function deleteGuestSession(): Promise<void> {
  const store = await cookies();
  store.delete(GUEST_COOKIE_NAME);
}
