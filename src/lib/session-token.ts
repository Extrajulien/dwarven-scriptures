import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Pure token codec for user sessions — no `next/headers`, no environment
 * reads: `encodeSessionToken` / `decodeSessionToken` are deterministic
 * functions over `(payload, secret)`.
 *
 * `src/lib/session.ts` re-exports everything from here and adds the cookie
 * layer (`createSession` / `getSession`). The realtime layer imports **this**
 * module (it must decode the session cookie of a WebSocket upgrade request
 * before the Next server context exists; importing `next/headers` at that
 * point corrupts Next's module graph at boot).
 *
 * Token format (ADR-003): `base64url(<json body>).base64url(HMAC-SHA256)`,
 * verified with `timingSafeEqual`; the body holds only public identifiers
 * plus an absolute expiry. Nothing sensitive ever lives in the token.
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
