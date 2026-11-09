import { cookies } from 'next/headers';
import {
  decodeSessionToken,
  encodeSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  type SessionPayload,
  type SessionUser,
} from './session-token';

/**
 * Stateless session management for authenticated users: the cookie layer on
 * top of the pure token codec in [`session-token.ts`](session-token.ts).
 *
 * The token itself is `base64url(<json body>)` followed by an HMAC-SHA256
 * signature over that body, separated by a `.` — see the codec module for the
 * format and security rationale (ADR-003, `doc/auth.md`). Keep the two files
 * in sync: this module only reads/writes the HttpOnly cookie; code that needs
 * to verify a token outside a Next.js request context (the realtime layer)
 * imports `session-token.ts` directly, never this file.
 *
 * This module is server-only by convention: it is imported only from server
 * actions and server components. Never import it from a client component.
 */

export { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, decodeSessionToken, encodeSessionToken };
export type { SessionPayload, SessionUser };

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is not set in environment variables');
  }
  return secret;
}

/**
 * Writes a signed session cookie. When `remember` is set the cookie persists for
 * `SESSION_TTL_SECONDS`; otherwise it is a browser-session cookie. Must only be
 * called from a Server Function or Route Handler (cookie writes are not allowed
 * during Server Component rendering).
 */
export async function createSession(
  user: SessionUser,
  options: { remember?: boolean } = {},
): Promise<void> {
  const payload: SessionPayload = {
    publicId: user.publicId,
    username: user.username,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  const token = encodeSessionToken(payload, sessionSecret());

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(options.remember ? { maxAge: SESSION_TTL_SECONDS } : {}),
  });
}

/** Reads and verifies the session cookie, returning the user or `null`. */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const payload = decodeSessionToken(token, sessionSecret());
  if (!payload) {
    return null;
  }

  return { publicId: payload.publicId, username: payload.username };
}

/** Deletes the session cookie (for a future logout action). */
export async function deleteSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}
