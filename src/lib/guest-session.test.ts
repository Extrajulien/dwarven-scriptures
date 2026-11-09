/**
 * @jest-environment node
 *
 * Unit tests for the signed guest session token and the nickname rule
 * (AUTH-02/03), mirroring `src/lib/session.test.ts`. Only the pure
 * encode/decode functions and the Zod schema are exercised here, so the tests
 * do not mock `next/headers`.
 */

import { createHmac } from 'crypto';
import {
  decodeGuestToken,
  encodeGuestToken,
  guestNicknameSchema,
  GUEST_NICKNAME_MAX_LENGTH,
  GUEST_NICKNAME_MIN_LENGTH,
  GUEST_TTL_SECONDS,
  type GuestSessionPayload,
} from './guest-session';

const secret = 'test-secret';

function payload(overrides: Partial<GuestSessionPayload> = {}): GuestSessionPayload {
  return {
    guestId: '11111111-1111-4111-8111-111111111111',
    nickname: 'Nain Curieux',
    exp: Math.floor(Date.now() / 1000) + GUEST_TTL_SECONDS,
    ...overrides,
  };
}

describe('guest session token', () => {
  test('round-trips an unexpired token', () => {
    const token = encodeGuestToken(payload(), secret);

    expect(decodeGuestToken(token, secret)).toEqual(payload());
  });

  test('rejects a token signed with a different secret', () => {
    const token = encodeGuestToken(payload(), secret);

    expect(decodeGuestToken(token, 'other-secret')).toBeNull();
  });

  test('rejects a tampered payload', () => {
    const token = encodeGuestToken(payload(), secret);
    const [body, signature] = token.split('.');
    const tamperedBody = body.slice(0, -1) + (body.endsWith('A') ? 'B' : 'A');

    expect(decodeGuestToken(`${tamperedBody}.${signature}`, secret)).toBeNull();
  });

  test('rejects an expired token', () => {
    const token = encodeGuestToken(
      payload({ exp: Math.floor(Date.now() / 1000) - 1 }),
      secret,
    );

    expect(decodeGuestToken(token, secret)).toBeNull();
  });

  test('rejects malformed tokens', () => {
    expect(decodeGuestToken('', secret)).toBeNull();
    expect(decodeGuestToken('.', secret)).toBeNull();
    expect(decodeGuestToken('no-dot', secret)).toBeNull();
    expect(decodeGuestToken('a.b.c', secret)).toBeNull();
  });

  test('rejects a well-signed body that is not a guest payload', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }), 'utf8').toString('base64url');
    const signature = createHmac('sha256', secret).update(body).digest('base64url');

    expect(decodeGuestToken(`${body}.${signature}`, secret)).toBeNull();
  });

  test('rejects a well-signed payload missing a field', () => {
    const body = Buffer.from(JSON.stringify({ guestId: 'x' }), 'utf8').toString('base64url');
    const signature = createHmac('sha256', secret).update(body).digest('base64url');

    expect(decodeGuestToken(`${body}.${signature}`, secret)).toBeNull();
  });

  test('a user session token is not a valid guest token', () => {
    const userPayload = {
      publicId: '11111111-1111-4111-8111-111111111111',
      username: 'ada',
      exp: payload().exp,
    };
    const body = Buffer.from(JSON.stringify(userPayload), 'utf8').toString('base64url');
    const signature = createHmac('sha256', secret).update(body).digest('base64url');

    expect(decodeGuestToken(`${body}.${signature}`, secret)).toBeNull();
  });
});

describe('guestNicknameSchema (AUTH-02)', () => {
  test('accepts a nickname within 3–20 characters', () => {
    expect(guestNicknameSchema.safeParse('Ada').success).toBe(true);
    expect(guestNicknameSchema.safeParse('x'.repeat(GUEST_NICKNAME_MAX_LENGTH)).success).toBe(true);
  });

  test('trims surrounding whitespace', () => {
    const result = guestNicknameSchema.safeParse('  Ada  ');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('Ada');
    }
  });

  test('rejects nicknames shorter than 3 characters', () => {
    expect(guestNicknameSchema.safeParse('ab').success).toBe(false);
    expect(guestNicknameSchema.safeParse('  ').success).toBe(false);
    expect(guestNicknameSchema.safeParse('').success).toBe(false);
  });

  test('rejects nicknames longer than 20 characters', () => {
    expect(guestNicknameSchema.safeParse('x'.repeat(GUEST_NICKNAME_MAX_LENGTH + 1)).success).toBe(
      false,
    );
  });

  test('rejects non-string values', () => {
    expect(guestNicknameSchema.safeParse(42).success).toBe(false);
    expect(guestNicknameSchema.safeParse(null).success).toBe(false);
    expect(guestNicknameSchema.safeParse(undefined).success).toBe(false);
  });

  test('exposes the documented bounds', () => {
    expect(GUEST_NICKNAME_MIN_LENGTH).toBe(3);
    expect(GUEST_NICKNAME_MAX_LENGTH).toBe(20);
  });
});
