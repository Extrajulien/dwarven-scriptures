import { randomUUID } from 'crypto';
import { cookies } from 'next/headers';
import {
  decodeGuestToken,
  encodeGuestToken,
  GUEST_COOKIE_NAME,
  GUEST_NICKNAME_MAX_LENGTH,
  GUEST_NICKNAME_MIN_LENGTH,
  GUEST_TTL_SECONDS,
  guestNicknameSchema,
  type GuestSession,
  type GuestSessionPayload,
} from './guest-token';

/**
 * Signed guest session (AUTH-02/03): the cookie layer on top of the pure
 * token codec in [`guest-token.ts`](guest-token.ts), mirroring
 * `src/lib/session.ts` for users: the same `body.signature` HMAC-SHA256
 * token, the same HttpOnly cookie options, but its own cookie name and
 * payload.
 *
 * Code that needs to verify a guest token outside a Next.js request context
 * (the realtime layer) imports `guest-token.ts` directly, never this file.
 *
 * This module is server-only by convention: it is imported only from server
 * actions and server components. Never import it from a client component.
 */

export {
  decodeGuestToken,
  encodeGuestToken,
  GUEST_COOKIE_NAME,
  GUEST_NICKNAME_MAX_LENGTH,
  GUEST_NICKNAME_MIN_LENGTH,
  GUEST_TTL_SECONDS,
  guestNicknameSchema,
};
export type { GuestSession, GuestSessionPayload };

/** Raised when `createGuestSession` is given a nickname that violates AUTH-02. */
export class InvalidGuestNicknameError extends Error {
  constructor() {
    super(
      `guest nickname must be ${GUEST_NICKNAME_MIN_LENGTH}-${GUEST_NICKNAME_MAX_LENGTH} characters after trimming`,
    );
    this.name = 'InvalidGuestNicknameError';
  }
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
