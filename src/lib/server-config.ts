/**
 * Pure resolution of the custom-server listen settings (server.ts, ADR-010).
 *
 * Kept free of `process.env` and side effects so the deployment-critical
 * port logic (TECH-05) can be unit-tested without importing the server
 * entry, which starts the whole application when evaluated.
 */

export const DEFAULT_PORT = 3000;
export const DEFAULT_HOSTNAME = '0.0.0.0';

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
 * Resolves the bind hostname: `HOSTNAME` env var or `0.0.0.0` (all
 * interfaces), which is what a container platform such as Railway needs to
 * reach the process. An empty value falls back to the default.
 */
export function resolveHostname(raw: string | undefined): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed.length > 0 ? trimmed : DEFAULT_HOSTNAME;
}
