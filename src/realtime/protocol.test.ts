/**
 * @jest-environment node
 *
 * Zod validation tests for the realtime protocol (TECH-07): every message
 * shape in both directions, the strictness rules and the error-code mapping.
 */

import { defaultRoomConfig } from '../lib/room-config';
import {
  clientMessageSchema,
  errorMessageSchema,
  joinRoomMessageSchema,
  roomSnapshotMessageSchema,
  serverMessageSchema,
  WS_ERROR_CODES,
  type ClientMessage,
  type ServerMessage,
} from './protocol';

const ROOM_PUBLIC_ID = '8f9c2a55-3b4a-4c1e-8a2d-9e7f6a5b4c3d';
const USER_PUBLIC_ID = '1f2e3d4c-5b6a-4978-8c9d-0e1f2a3b4c5d';
const GUEST_TOKEN = '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d';

const validUserMember = {
  kind: 'user',
  publicId: USER_PUBLIC_ID,
  username: 'ada',
  pfpUrl: null,
  role: 'participant',
  joinedAt: '2026-11-07T21:00:00.000Z',
  connected: true,
};

const validGuestMember = {
  kind: 'guest',
  guestToken: GUEST_TOKEN,
  nickname: 'Dwarf42',
  role: 'participant',
  joinedAt: '2026-11-07T21:00:00.000Z',
  connected: true,
};

const validRoom = {
  publicId: ROOM_PUBLIC_ID,
  code: 'DWRF42',
  visibility: 'public',
  status: 'en_attente',
  capacity: 10,
  config: defaultRoomConfig,
  host: { publicId: USER_PUBLIC_ID, username: 'ada' },
  createdAt: '2026-11-07T20:00:00.000Z',
};

describe('client → server messages', () => {
  test('accepts a joinRoom by code', () => {
    const parsed = clientMessageSchema.safeParse({ type: 'joinRoom', code: ' dwrf42 ' });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ type: 'joinRoom', code: 'DWRF42' });
    }
  });

  test('accepts a joinRoom by invitation token, with a guest nickname', () => {
    const parsed = clientMessageSchema.safeParse({
      type: 'joinRoom',
      invitationToken: 'abc123-_',
      nickname: '  Gimli  ',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        type: 'joinRoom',
        invitationToken: 'abc123-_',
        nickname: 'Gimli',
      });
    }
  });

  test('rejects joinRoom with both code and token, or neither', () => {
    expect(
      clientMessageSchema.safeParse({ type: 'joinRoom', code: 'DWRF42', invitationToken: 'x' })
        .success,
    ).toBe(false);
    expect(clientMessageSchema.safeParse({ type: 'joinRoom' }).success).toBe(false);
  });

  test('rejects a code outside the SALLE-02 alphabet and a too-short nickname', () => {
    expect(clientMessageSchema.safeParse({ type: 'joinRoom', code: 'DWRF0O' }).success).toBe(
      false,
    );
    expect(
      clientMessageSchema.safeParse({ type: 'joinRoom', code: 'DWRF42', nickname: 'ab' }).success,
    ).toBe(false);
  });

  test('rejects unknown keys on joinRoom (strict)', () => {
    expect(
      clientMessageSchema.safeParse({ type: 'joinRoom', code: 'DWRF42', role: 'spectator' })
        .success,
    ).toBe(false);
  });

  test('accepts leaveRoom and ping', () => {
    expect(clientMessageSchema.safeParse({ type: 'leaveRoom' }).success).toBe(true);
    expect(clientMessageSchema.safeParse({ type: 'ping' }).success).toBe(true);
  });

  test('rejects an unknown message type and non-object payloads', () => {
    expect(clientMessageSchema.safeParse({ type: 'joinRoomNow' }).success).toBe(false);
    expect(clientMessageSchema.safeParse(null).success).toBe(false);
    expect(clientMessageSchema.safeParse('joinRoom').success).toBe(false);
  });

  test('the inferred client type stays a discriminated union', () => {
    const message: ClientMessage = { type: 'ping' };
    expect(message.type).toBe('ping');
  });

  test('joinRoomMessageSchema requires the type discriminator', () => {
    expect(joinRoomMessageSchema.safeParse({ code: 'DWRF42' }).success).toBe(false);
  });
});

describe('server → client messages', () => {
  test('accepts a full roomSnapshot with user and guest members', () => {
    const parsed = serverMessageSchema.safeParse({
      type: 'roomSnapshot',
      room: validRoom,
      members: [validUserMember, validGuestMember],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const members = (parsed.data as { members: unknown[] }).members;
      expect(members).toHaveLength(2);
    }
  });

  test('accepts a guest member whose nickname is not known yet (no live socket)', () => {
    const parsed = serverMessageSchema.safeParse({
      type: 'roomSnapshot',
      room: validRoom,
      members: [{ ...validGuestMember, nickname: null, connected: false }],
    });

    expect(parsed.success).toBe(true);
  });

  test('accepts memberJoined, memberLeft and memberKicked', () => {
    for (const type of ['memberJoined', 'memberLeft', 'memberKicked'] as const) {
      const parsed = serverMessageSchema.safeParse({
        type,
        roomPublicId: ROOM_PUBLIC_ID,
        member: validUserMember,
      });
      expect(parsed.success).toBe(true);
    }
  });

  test('accepts hostChanged, configUpdated and roomClosed', () => {
    expect(
      serverMessageSchema.safeParse({
        type: 'hostChanged',
        roomPublicId: ROOM_PUBLIC_ID,
        host: { publicId: USER_PUBLIC_ID, username: 'bob' },
      }).success,
    ).toBe(true);
    expect(
      serverMessageSchema.safeParse({
        type: 'configUpdated',
        roomPublicId: ROOM_PUBLIC_ID,
        config: defaultRoomConfig,
      }).success,
    ).toBe(true);
    expect(
      serverMessageSchema.safeParse({ type: 'roomClosed', roomPublicId: ROOM_PUBLIC_ID })
        .success,
    ).toBe(true);
  });

  test('rejects a config that violates the room-config schema (CONF bounds)', () => {
    const invalidConfig = { ...defaultRoomConfig, wordCount: 1 };
    const parsed = serverMessageSchema.safeParse({
      type: 'configUpdated',
      roomPublicId: ROOM_PUBLIC_ID,
      config: invalidConfig,
    });

    expect(parsed.success).toBe(false);
  });

  test('rejects a snapshot with a bad uuid, bad code or a member lacking identity', () => {
    expect(
      roomSnapshotMessageSchema.safeParse({
        type: 'roomSnapshot',
        room: { ...validRoom, publicId: 'not-a-uuid' },
        members: [],
      }).success,
    ).toBe(false);
    expect(
      roomSnapshotMessageSchema.safeParse({
        type: 'roomSnapshot',
        room: { ...validRoom, code: 'BAD0O1' },
        members: [],
      }).success,
    ).toBe(false);
    expect(
      roomSnapshotMessageSchema.safeParse({
        type: 'roomSnapshot',
        room: validRoom,
        members: [{ ...validUserMember, publicId: undefined }],
      }).success,
    ).toBe(false);
  });

  test('rejects a member that is neither user nor guest', () => {
    const parsed = serverMessageSchema.safeParse({
      type: 'roomSnapshot',
      room: validRoom,
      members: [
        { ...validUserMember, kind: 'bot', publicId: undefined, guestToken: GUEST_TOKEN },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  test('accepts pong', () => {
    expect(serverMessageSchema.safeParse({ type: 'pong' }).success).toBe(true);
  });

  test('the inferred server type stays a discriminated union', () => {
    const message: ServerMessage = { type: 'pong' };
    expect(message.type).toBe('pong');
  });
});

describe('error codes', () => {
  test('the code set is exactly the contract of the protocol', () => {
    expect(WS_ERROR_CODES).toEqual([
      'room_not_found',
      'room_full',
      'already_in_room',
      'kicked',
      'invalid_input',
      'private_room',
      'rate_limited',
    ]);
  });

  test('accepts an error with every documented code, with or without a message', () => {
    for (const code of WS_ERROR_CODES) {
      expect(serverMessageSchema.safeParse({ type: 'error', code }).success).toBe(true);
      expect(
        serverMessageSchema.safeParse({ type: 'error', code, message: 'detail' }).success,
      ).toBe(true);
    }
  });

  test('rejects unknown codes and non-string codes', () => {
    expect(serverMessageSchema.safeParse({ type: 'error', code: 'room_lost' }).success).toBe(
      false,
    );
    expect(serverMessageSchema.safeParse({ type: 'error', code: 42 }).success).toBe(false);
  });

  test('rejects an error message longer than the cap', () => {
    const parsed = errorMessageSchema.safeParse({
      type: 'error',
      code: 'invalid_input',
      message: 'x'.repeat(301),
    });

    expect(parsed.success).toBe(false);
  });
});
