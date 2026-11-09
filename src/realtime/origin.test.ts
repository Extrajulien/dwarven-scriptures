/**
 * @jest-environment node
 *
 * Unit tests for the WebSocket Origin matcher (TECH-06, ADR-010): the
 * public Railway origin must be accepted, the `WS_ALLOWED_ORIGINS`
 * allowlist must merge with same-origin acceptance (it never locks out the
 * host that serves the page), and everything else is refused.
 */

import { checkOrigin, originAllowed, parseAllowedOrigins } from './origin';
import type { IncomingMessage } from 'node:http';

const PUBLIC_ORIGIN = 'https://dwarven-scriptures.up.railway.app';
const LOCAL_ORIGIN = 'http://localhost:3000';

function request(headers: Record<string, string | undefined>): IncomingMessage {
  return { headers } as IncomingMessage;
}

describe('parseAllowedOrigins', () => {
  test('splits, trims and drops empty entries', () => {
    expect(
      parseAllowedOrigins(`  ${PUBLIC_ORIGIN} , ${LOCAL_ORIGIN} ,, ,`),
    ).toEqual([PUBLIC_ORIGIN, LOCAL_ORIGIN]);
  });

  test('returns an empty list for an unset or empty value', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
    expect(parseAllowedOrigins('  , , ')).toEqual([]);
  });

  test('deduplicates repeated entries', () => {
    expect(parseAllowedOrigins(`${PUBLIC_ORIGIN},${PUBLIC_ORIGIN}`)).toEqual([
      PUBLIC_ORIGIN,
    ]);
  });
});

describe('checkOrigin', () => {
  test('allows missing Origin headers (native clients, smoke scripts)', () => {
    expect(checkOrigin(undefined, 'example.com', [])).toBeNull();
  });

  test('allows the exact public Railway origin through the allowlist', () => {
    expect(checkOrigin(PUBLIC_ORIGIN, 'railway.internal:3000', [PUBLIC_ORIGIN])).toBeNull();
    expect(checkOrigin(PUBLIC_ORIGIN, PUBLIC_ORIGIN.replace('https://', ''), [PUBLIC_ORIGIN])).toBeNull();
  });

  test('allowlist matches the origin exactly, not a lookalike', () => {
    expect(checkOrigin('https://evil.example', PUBLIC_ORIGIN.replace('https://', ''), [PUBLIC_ORIGIN])).toBe(
      'cross-origin request rejected',
    );
  });

  test('merges allowlist with same-origin: the host origin stays accepted', () => {
    expect(
      checkOrigin(LOCAL_ORIGIN, 'localhost:3000', [PUBLIC_ORIGIN]),
    ).toBeNull();
  });

  test('rejects a cross-origin browser request without an allowlist', () => {
    expect(checkOrigin(PUBLIC_ORIGIN, 'localhost:3000', [])).toBe(
      'cross-origin request rejected',
    );
  });

  test('rejects an unlisted cross-origin request even when an allowlist is configured', () => {
    expect(
      checkOrigin('https://evil.example', 'dwarven-scriptures.up.railway.app', [PUBLIC_ORIGIN]),
    ).toBe('cross-origin request rejected');
  });

  test('an unlisted origin is still accepted when it matches the Host (merged semantics)', () => {
    expect(checkOrigin('https://evil.example', 'evil.example', [PUBLIC_ORIGIN])).toBeNull();
  });

  test('reports a missing Host header', () => {
    expect(checkOrigin(PUBLIC_ORIGIN, undefined, [])).toBe('missing host header');
  });

  test('reports a malformed Origin header', () => {
    expect(checkOrigin('not a url', 'localhost:3000', [])).toBe('malformed origin header');
  });
});

describe('originAllowed (request adapter)', () => {
  test('accepts the production request shape', () => {
    expect(
      originAllowed(
        request({
          origin: PUBLIC_ORIGIN,
          host: 'dwarven-scriptures.up.railway.app',
        }),
        [PUBLIC_ORIGIN],
      ),
    ).toBe(true);
  });

  test('refuses a foreign origin', () => {
    expect(
      originAllowed(
        request({ origin: 'https://evil.example', host: 'dwarven-scriptures.up.railway.app' }),
        [PUBLIC_ORIGIN],
      ),
    ).toBe(false);
  });
});
