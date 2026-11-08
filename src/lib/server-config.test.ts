/**
 * Unit tests for the custom-server listen settings (TECH-05, ADR-010): the
 * Railway contract binds `0.0.0.0` and reads `PORT`; the pure resolvers
 * above `server.ts` make that logic testable without starting the server.
 */

import {
  DEFAULT_HOSTNAME,
  DEFAULT_PORT,
  resolveHostname,
  resolvePort,
} from './server-config';

describe('resolvePort (TECH-05)', () => {
  test('uses the PORT environment value when it is a valid port', () => {
    expect(resolvePort('8080')).toBe(8080);
    expect(resolvePort('1')).toBe(1);
    expect(resolvePort('65535')).toBe(65535);
  });

  test('falls back to 3000 when PORT is unset or empty', () => {
    expect(resolvePort(undefined)).toBe(DEFAULT_PORT);
    expect(resolvePort('')).toBe(DEFAULT_PORT);
    expect(resolvePort('   ')).toBe(DEFAULT_PORT);
  });

  test('falls back to 3000 for invalid values instead of binding NaN', () => {
    expect(resolvePort('not-a-number')).toBe(DEFAULT_PORT);
    expect(resolvePort('0')).toBe(DEFAULT_PORT);
    expect(resolvePort('-1')).toBe(DEFAULT_PORT);
    expect(resolvePort('70000')).toBe(DEFAULT_PORT);
    expect(resolvePort('12.5')).toBe(DEFAULT_PORT);
  });
});

describe('resolveHostname (TECH-05)', () => {
  test('defaults to the dual-stack any address so IPv4 and IPv6 both work', () => {
    expect(resolveHostname(undefined)).toBe(DEFAULT_HOSTNAME);
    expect(resolveHostname('')).toBe(DEFAULT_HOSTNAME);
    expect(resolveHostname('   ')).toBe(DEFAULT_HOSTNAME);
    expect(DEFAULT_HOSTNAME).toBe('::');
  });

  test('keeps an explicit IP literal, trimmed', () => {
    expect(resolveHostname('127.0.0.1')).toBe('127.0.0.1');
    expect(resolveHostname('  ::1  ')).toBe('::1');
    expect(resolveHostname('0.0.0.0')).toBe('0.0.0.0');
  });

  test('rejects hostnames (platform container names resolve to one family only)', () => {
    expect(resolveHostname('877fb8a387fa')).toBe(DEFAULT_HOSTNAME);
    expect(resolveHostname('localhost')).toBe(DEFAULT_HOSTNAME);
  });
});
