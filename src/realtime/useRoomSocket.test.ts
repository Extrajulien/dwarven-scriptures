/**
 * @jest-environment node
 *
 * Unit tests for the client hook's pure logic (GAME-4 groundwork): reconnect
 * backoff, ws URL building, server-frame validation and the state reducer.
 * The hook itself only wires these functions to React/WebSocket, which is
 * exercised by the live smoke test and will be covered by component tests
 * when SP-1C builds the room UI.
 */

import { defaultRoomConfig } from '../lib/room-config';
import {
  isFatalErrorCode,
  type RoomSocketState,
} from './client-types';
import {
  applyServerMessage,
  buildWsUrl,
  computeReconnectDelay,
  memberIdentity,
  parseServerMessage,
  shouldReconnect,
} from './useRoomSocket';

const ROOM_PUBLIC_ID = '8f9c2a55-3b4a-4c1e-8a2d-9e7f6a5b4c3d';
const ADA_ID = '1f2e3d4c-5b6a-4978-8c9d-0e1f2a3b4c5d';
const BOB_ID = '2f3e4d5c-6b7a-4987-9c0d-1e2f3a4b5c6d';
const GUEST_TOKEN = '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d';
const JOINED_AT = '2026-11-07T21:00:00.000Z';

const snapshotState: RoomSocketState = {
  status: 'open',
  snapshot: {
    room: {
      publicId: ROOM_PUBLIC_ID,
      code: 'DWRF42',
      visibility: 'public',
      status: 'en_attente',
      capacity: 10,
      config: defaultRoomConfig,
      host: { publicId: ADA_ID, username: 'ada' },
      createdAt: '2026-11-07T20:00:00.000Z',
    },
    members: [
      {
        kind: 'user',
        publicId: ADA_ID,
        username: 'ada',
        pfpUrl: null,
        role: 'participant',
        joinedAt: JOINED_AT,
        connected: true,
      },
    ],
  },
  error: null,
};

describe('computeReconnectDelay', () => {
  test('grows exponentially and caps at maxMs', () => {
    expect(computeReconnectDelay(0, { baseMs: 1000, maxMs: 8000, jitter: 0 })).toBe(1000);
    expect(computeReconnectDelay(1, { baseMs: 1000, maxMs: 8000, jitter: 0 })).toBe(2000);
    expect(computeReconnectDelay(2, { baseMs: 1000, maxMs: 8000, jitter: 0 })).toBe(4000);
    expect(computeReconnectDelay(3, { baseMs: 1000, maxMs: 8000, jitter: 0 })).toBe(8000);
    expect(computeReconnectDelay(20, { baseMs: 1000, maxMs: 8000, jitter: 0 })).toBe(8000);
  });

  test('applies bounded jitter', () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const delay = computeReconnectDelay(attempt, { baseMs: 1000, maxMs: 8000, jitter: 0.3 });
      const expected = Math.min(8000, 1000 * 2 ** attempt);
      expect(delay).toBeGreaterThanOrEqual(Math.round(expected * 0.7));
      expect(delay).toBeLessThanOrEqual(Math.round(expected * 1.3));
    }
  });
});

describe('buildWsUrl', () => {
  test('derives the same-origin ws URL from the page location', () => {
    expect(buildWsUrl({ protocol: 'http:', host: 'localhost:3000' }, undefined)).toBe(
      'ws://localhost:3000/ws',
    );
    expect(buildWsUrl({ protocol: 'https:', host: 'race.example.com' }, undefined)).toBe(
      'wss://race.example.com/ws',
    );
  });

  test('honours the NEXT_PUBLIC_WS_URL override', () => {
    expect(
      buildWsUrl({ protocol: 'https:', host: 'race.example.com' }, 'wss://ws.example.com:3001/ws'),
    ).toBe('wss://ws.example.com:3001/ws');
  });
});

describe('parseServerMessage (never trust raw server data)', () => {
  test('accepts protocol-valid messages', () => {
    expect(parseServerMessage({ type: 'pong' })).toEqual({ type: 'pong' });
    expect(parseServerMessage({ type: 'roomSnapshot', room: snapshotState.snapshot!.room, members: [] }))
      .not.toBeNull();
  });

  test('rejects malformed frames before they can reach state', () => {
    expect(parseServerMessage(null)).toBeNull();
    expect(parseServerMessage({ type: 'pong', extra: 1 })).toBeNull();
    expect(parseServerMessage({ type: 'unknownType' })).toBeNull();
    expect(
      parseServerMessage({
        type: 'roomSnapshot',
        room: { ...snapshotState.snapshot!.room, config: { wordCount: -5 } },
        members: [],
      }),
    ).toBeNull();
  });
});

describe('applyServerMessage', () => {
  test('roomSnapshot replaces the state and opens it', () => {
    const next = applyServerMessage({ status: 'connecting', snapshot: null, error: null }, {
      type: 'roomSnapshot',
      room: snapshotState.snapshot!.room,
      members: snapshotState.snapshot!.members,
    });

    expect(next.status).toBe('open');
    expect(next.snapshot?.room.code).toBe('DWRF42');
    expect(next.snapshot?.members).toHaveLength(1);
  });

  test('memberJoined adds or replaces the member by identity', () => {
    const guest = {
      kind: 'guest' as const,
      guestToken: GUEST_TOKEN,
      nickname: 'Gimli',
      role: 'participant' as const,
      joinedAt: JOINED_AT,
      connected: true,
    };
    const joined = applyServerMessage(snapshotState, {
      type: 'memberJoined',
      roomPublicId: ROOM_PUBLIC_ID,
      member: guest,
    });
    expect(joined.snapshot?.members).toHaveLength(2);

    // The same member joining again replaces, never duplicates.
    const replayed = applyServerMessage(joined, {
      type: 'memberJoined',
      roomPublicId: ROOM_PUBLIC_ID,
      member: { ...guest, nickname: 'Gimli2' },
    });
    expect(replayed.snapshot?.members).toHaveLength(2);
    const guestMember = replayed.snapshot?.members.find((m) => m.kind === 'guest');
    expect(guestMember?.nickname).toBe('Gimli2');
  });

  test('memberLeft and memberKicked remove the member by identity', () => {
    const stateWithGuest = applyServerMessage(snapshotState, {
      type: 'memberJoined',
      roomPublicId: ROOM_PUBLIC_ID,
      member: {
        kind: 'guest',
        guestToken: GUEST_TOKEN,
        nickname: 'Gimli',
        role: 'participant',
        joinedAt: JOINED_AT,
        connected: true,
      },
    });

    const left = applyServerMessage(stateWithGuest, {
      type: 'memberLeft',
      roomPublicId: ROOM_PUBLIC_ID,
      member: {
        kind: 'guest',
        guestToken: GUEST_TOKEN,
        nickname: 'Gimli',
        role: 'participant',
        joinedAt: JOINED_AT,
        connected: false,
      },
    });
    expect(left.snapshot?.members).toHaveLength(1);
  });

  test('hostChanged and configUpdated update the snapshot in place', () => {
    const hostChanged = applyServerMessage(snapshotState, {
      type: 'hostChanged',
      roomPublicId: ROOM_PUBLIC_ID,
      host: { publicId: BOB_ID, username: 'bob' },
    });
    expect(hostChanged.snapshot?.room.host.username).toBe('bob');

    const configUpdated = applyServerMessage(snapshotState, {
      type: 'configUpdated',
      roomPublicId: ROOM_PUBLIC_ID,
      config: { ...defaultRoomConfig, wordCount: 120 },
    });
    expect(configUpdated.snapshot?.room.config.wordCount).toBe(120);
  });

  test('roomClosed clears the state', () => {
    const next = applyServerMessage(snapshotState, {
      type: 'roomClosed',
      roomPublicId: ROOM_PUBLIC_ID,
    });
    expect(next.status).toBe('closed');
    expect(next.snapshot).toBeNull();
  });

  test('shouldReconnect refuses closed and fatally rejected states', () => {
    const closed = applyServerMessage(snapshotState, {
      type: 'roomClosed',
      roomPublicId: ROOM_PUBLIC_ID,
    });
    expect(shouldReconnect(closed)).toBe(false);

    const kicked = applyServerMessage(snapshotState, { type: 'error', code: 'kicked' });
    expect(shouldReconnect(kicked)).toBe(false);

    expect(shouldReconnect({ status: 'open', snapshot: null, error: null })).toBe(true);
    expect(
      shouldReconnect({
        status: 'reconnecting',
        snapshot: null,
        error: { message: 'invalid frame', fatal: false },
      }),
    ).toBe(true);
  });

  test('error sets the fatal flag from the code', () => {
    const kicked = applyServerMessage(snapshotState, { type: 'error', code: 'kicked' });
    expect(kicked.error?.fatal).toBe(true);

    const transient = applyServerMessage(snapshotState, { type: 'error', code: 'rate_limited' });
    expect(transient.error?.fatal).toBe(true);

    const invalid = applyServerMessage(snapshotState, { type: 'error', code: 'invalid_input' });
    expect(invalid.error?.fatal).toBe(true);
  });

  test('pong leaves the state untouched', () => {
    expect(applyServerMessage(snapshotState, { type: 'pong' })).toEqual(snapshotState);
  });
});

describe('isFatalErrorCode', () => {
  test('classifies terminal join errors', () => {
    for (const code of [
      'kicked',
      'room_not_found',
      'room_full',
      'rate_limited',
      'invalid_input',
      'private_room',
      'already_in_room',
    ] as const) {
      expect(isFatalErrorCode(code)).toBe(true);
    }
  });
});

describe('memberIdentity', () => {
  test('is stable across presence messages', () => {
    expect(memberIdentity({ kind: 'user', publicId: ADA_ID })).toBe(`user:${ADA_ID}`);
    expect(memberIdentity({ kind: 'guest', guestToken: GUEST_TOKEN })).toBe(
      `guest:${GUEST_TOKEN}`,
    );
  });
});
