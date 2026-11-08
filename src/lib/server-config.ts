/**
 * Pure resolution of the custom-server listen settings (server.ts, ADR-010).
 *
 * Kept free of `process.env` and side effects so the deployment-critical
 * port logic (TECH-05) can be unit-tested without importing the server
 * entry, which starts the whole application when evaluated.
 */

import { isIP } from 'node:net';

export const DEFAULT_PORT = 3000;
/**
 * `::` — the IPv6 any address with Node's default dual-stack behaviour, so
 * the single socket accepts both IPv4 and IPv6 connections. Railway's edge
 * proxy dials containers over their IPv6 ULA address, so an IPv4-only
 * binding answers 502 there (verified via network flow logs, TECH-05).
 */
export const DEFAULT_HOSTNAME = '::';

/**
 * Resolves the listen port: the `PORT` environment variable when it parses
 * as a positive integer, `3000` otherwise. A broken deployment variable
 * (empty, garbage, negative) must never keep the process from binding —
 * Railway injects `PORT` for its own contract, so the fallback exists only
 * for safety.
 */
export function resolvePort(raw: string | undefined): number {
  const parsed = Number(raw ?? '');
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    return DEFAULT_PORT;
  }
  return parsed;
}

/**
 * Resolves the bind address: an explicit `HOSTNAME` that is an IP literal
 * (v4 or v6) is kept, everything else falls back to `::` (all interfaces,
 * both families). Hostnames are deliberately rejected: platforms such as
 * Railway set `HOSTNAME` to the container name, which resolves to one
 * address family only and silently breaks the other (IPv6) side of their
 * proxying.
 */
export function resolveHostname(raw: string | undefined): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return isIP(trimmed) !== 0 ? trimmed : DEFAULT_HOSTNAME;
}
