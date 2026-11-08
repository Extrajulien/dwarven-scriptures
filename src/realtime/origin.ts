import type { IncomingMessage } from 'node:http';

/**
 * Pure WebSocket Origin validation for the `/ws` upgrade (TECH-06, ADR-010).
 *
 * Extracted from `src/realtime/server.ts` so the matcher can be unit-tested
 * without importing the `ws` adapter's module graph (which reaches the
 * database client at import time). Everything here is a pure function of
 * its arguments — the environment is read by the callers.
 *
 * Semantics (documented in `.env.example`):
 *
 * - Browsers always send an `Origin` header on WebSocket upgrades. Missing
 *   Origin (native clients, smoke scripts) is allowed.
 * - An origin listed in `WS_ALLOWED_ORIGINS` (comma-separated, trimmed) is
 *   accepted — this is how `https://dwarven-scriptures.up.railway.app`
 *   opens sockets in production, where the page and the socket go through
 *   Railway's proxy.
 * - The allowlist is **merged** with same-origin acceptance: an origin that
 *   matches the request's own `Host` header is always accepted, so setting
 *   `WS_ALLOWED_ORIGINS` never locks out the development origin.
 * - Anything else is rejected before the handshake completes.
 */

/**
 * Parses the `WS_ALLOWED_ORIGINS` value (comma-separated origins) into a
 * trimmed, deduplicated, non-empty-entries-only list.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  const origins = (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return [...new Set(origins)];
}

/**
 * Validates the Origin header of an upgrade request. Returns an error
 * string to answer the handshake with, or `null` when the upgrade may
 * proceed.
 */
export function checkOrigin(
  originHeader: string | undefined,
  hostHeader: string | undefined,
  allowedOrigins: string[],
): string | null {
  if (!originHeader) {
    return null;
  }

  if (allowedOrigins.includes(originHeader)) {
    return null;
  }

  if (!hostHeader) {
    return 'missing host header';
  }
  try {
    return new URL(originHeader).host === hostHeader ? null : 'cross-origin request rejected';
  } catch {
    return 'malformed origin header';
  }
}

/** True when the Origin check allows an upgrade for this request. */
export function originAllowed(
  request: IncomingMessage,
  allowedOrigins: string[],
): boolean {
  return checkOrigin(request.headers.origin, request.headers.host, allowedOrigins) === null;
}
