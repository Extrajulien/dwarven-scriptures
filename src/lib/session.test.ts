/**
 * @jest-environment node
 *
 * Unit tests for the stateless session token. Only the pure encode/decode
 * functions are exercised here, so the tests do not mock `next/headers`.
 */

import { createHmac } from 'crypto';
import {
  decodeSessionToken,
  encodeSessionToken,
  SESSION_TTL_SECONDS,
  type SessionPayload,
} from './session';

const secret = 'test-secret';

function payload(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    publicId: '11111111-1111-4111-8111-111111111111',
    username: 'ada',
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    ...overrides,
  };
}

describe('session token', () => {
  test('round-trips an unexpired token', () => {
    const token = encodeSessionToken(payload(), secret);

    expect(decodeSessionToken(token, secret)).toEqual(payload());
  });

  test('rejects a token signed with a different secret', () => {
    const token = encodeSessionToken(payload(), secret);

    expect(decodeSessionToken(token, 'other-secret')).toBeNull();
  });

  test('rejects a tampered payload', () => {
    const token = encodeSessionToken(payload(), secret);
    const [body, signature] = token.split('.');
    const tamperedBody = body.slice(0, -1) + (body.endsWith('A') ? 'B' : 'A');

    expect(decodeSessionToken(`${tamperedBody}.${signature}`, secret)).toBeNull();
  });

  test('rejects an expired token', () => {
    const token = encodeSessionToken(
      payload({ exp: Math.floor(Date.now() / 1000) - 1 }),
      secret,
    );

    expect(decodeSessionToken(token, secret)).toBeNull();
  });

  test('rejects malformed tokens', () => {
    expect(decodeSessionToken('', secret)).toBeNull();
    expect(decodeSessionToken('.', secret)).toBeNull();
    expect(decodeSessionToken('no-dot', secret)).toBeNull();
    expect(decodeSessionToken('a.b.c', secret)).toBeNull();
  });

  test('rejects a well-signed body that is not a session payload', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }), 'utf8').toString('base64url');
    const signature = createHmac('sha256', secret).update(body).digest('base64url');

    expect(decodeSessionToken(`${body}.${signature}`, secret)).toBeNull();
  });
});
