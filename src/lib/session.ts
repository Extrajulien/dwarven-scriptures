import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

/**
 * Stateless session management for authenticated users.
 *
 * A session is a small, self-describing token stored in an HttpOnly cookie.
 * The token is `base64url(<json body>)` followed by an HMAC-SHA256 signature
 * over that body, separated by a `.`. Node's built-in `crypto` provides the
 * HMAC, so this carries no dependency — the same reasoning used for scrypt in
 * [`password.ts`](password.ts) and documented in
 * [`doc/auth.md`](../../doc/auth.md).
 *
 * The body holds only public identifiers (`publicId`, `username`) plus an
 * absolute expiry (`exp`, in Unix seconds). Nothing sensitive is ever placed in
 * the token, and the signature is verified with `timingSafeEqual` so tampering
 * and forgery are both rejected.
 *
 * This module is server-only by convention: it is imported only from server
 * actions and server components. Never import it from a client component.
 */

export const SESSION_COOKIE_NAME = 'session';

/** Session lifetime in seconds. "Remember me" stores the cookie for the same span. */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export type SessionPayload = {
  publicId: string;
  username: string;
  /** Absolute expiry as Unix seconds. */
  exp: number;
};

export type SessionUser = {
  publicId: string;
  username: string;
};

function hmac(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

/** Signs a payload into a `body.signature` token. Exported for unit testing. */
export function encodeSessionToken(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = hmac(body, secret).toString('base64url');
  return `${body}.${signature}`;
}

/**
 * Verifies a token and returns its payload, or `null` for any malformed,
 * tampered or expired input. Exported for unit testing.
 */
export function decodeSessionToken(token: string, secret: string): SessionPayload | null {
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
    if (!isSessionPayload(parsed)) {
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

function isSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.publicId === 'string' &&
    typeof record.username === 'string' &&
    typeof record.exp === 'number'
  );
}

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
