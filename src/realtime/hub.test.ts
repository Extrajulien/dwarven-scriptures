/**
 * @jest-environment node
 *
 * Unit tests for the transport-agnostic room hub (SALLE-09/10, TECH-06).
 * The store seam and the connections are fakes; time is faked for the
 * heartbeat.
 */

import { defaultRoomConfig } from '../lib/room-config';
import {
  SlidingWindowRateLimiter,
  ROOM_CODE_JOIN_MAX_ATTEMPTS,
  ROOM_CODE_JOIN_WINDOW_MS,
} from '../lib/rate-limit';
import {
  RoomHub,
  type HubConnection,
  type HubIdentity,
  type HubRoomState,
  type LeaveOutcome,
  type RoomStore,
  type RoomStoreJoinInput,
  type RoomStoreJoinResult,
} from './hub';
import type { ServerMessage } from './protocol';

const ROOM_ID = 42;
const ROOM_PUBLIC_ID = '8f9c2a55-3b4a-4c1e-8a2d-9e7f6a5b4c3d';
const ADA_ID = '1f2e3d4c-5b6a-4978-8c9d-0e1f2a3b4c5d';
const BOB_ID = '2f3e4d5c-6b7a-4987-9c0d-1e2f3a4b5c6d';
const GUEST_TOKEN = '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d';

const ada: HubIdentity = { kind: 'user', userId: 7, publicId: ADA_ID, username: 'ada' };
const bob: HubIdentity = { kind: 'user', userId: 8, publicId: BOB_ID, username: 'bob' };
const gimli: HubIdentity = { kind: 'guest', guestToken: GUEST_TOKEN, nickname: 'Gimli' };

const JOINED_AT = new Date('2026-11-07T21:00:00.000Z');
const CREATED_AT = new Date('2026-11-07T20:00:00.000Z');

function roomState(overrides: Partial<HubRoomState> = {}): HubRoomState {
  return {
    roomId: ROOM_ID,
    publicId: ROOM_PUBLIC_ID,
    code: 'DWRF42',
    visibility: 'public',
    status: 'en_attente',
    capacity: 10,
    config: defaultRoomConfig,
    hostUserId: 7,
    hostPublicId: ADA_ID,
    hostName: 'ada',
    createdAt: CREATED_AT,
    members: [
      {
        role: 'participant',
        userId: 7,
        guestToken: null,
        userPublicId: ADA_ID,
        username: 'ada',
        pfpUrl: null,
        joinedAt: JOINED_AT,
      },
    ],
    ...overrides,
  };
}

class FakeConnection implements HubConnection {
  sent: ServerMessage[] = [];
  closed = false;
  closeCode: number | undefined;
  closeReason: string | undefined;
  terminated = false;
  alive = true;
  pingCount = 0;
  onClose: (() => void) | null = null;

  constructor(
    readonly id: string,
    readonly meta: { ip: string; actor: HubIdentity | null },
  ) {}

  send(message: ServerMessage): void {
    this.sent.push(message);
  }

  close(code?: number, reason?: string): void {
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
    this.onClose?.();
  }

  ping(): void {
    this.pingCount += 1;
    this.alive = false;
  }

  isAlive(): boolean {
    return this.alive;
  }

  terminate(): void {
    this.terminated = true;
    this.closed = true;
    this.onClose?.();
  }

  last<T extends ServerMessage['type']>(type: T): (ServerMessage & { type: T }) | undefined {
    return this.sent.filter((m) => m.type === type).pop() as
      | (ServerMessage & { type: T })
      | undefined;
  }
}

class FakeStore implements RoomStore {
  joinCalls: RoomStoreJoinInput[] = [];
  joinResult: RoomStoreJoinResult = { ok: true, roomId: ROOM_ID, rejoin: false };
  joinImpl: ((input: RoomStoreJoinInput) => RoomStoreJoinResult) | null = null;
  states = new Map<number, HubRoomState>();
  leaveCalls: Array<{ roomId: number; identity: HubIdentity }> = [];
  leaveOutcome: LeaveOutcome = { left: true, hostChangedTo: null, roomClosed: false };
  markAllMembersLeftCalls = 0;

  async joinRoom(input: RoomStoreJoinInput): Promise<RoomStoreJoinResult> {
    this.joinCalls.push(input);
    const result = this.joinImpl ? this.joinImpl(input) : this.joinResult;
    // Like the real store, a successful join inserts the membership row.
    if (result.ok) {
      const state = this.states.get(result.roomId);
      if (state) {
        const row = memberRowFor(input.identity);
        const present = state.members.some(
          (m) => (row.userId !== null ? m.userId === row.userId : m.guestToken === row.guestToken),
        );
        if (!present) {
          state.members.push(row);
        }
      }
    }
    return result;
  }

  async leaveRoom(input: { roomId: number; identity: HubIdentity }): Promise<LeaveOutcome> {
    this.leaveCalls.push(input);
    const state = this.states.get(input.roomId);
    if (state) {
      state.members = state.members.filter(
        (m) => !(input.identity.kind === 'user'
          ? m.userId === input.identity.userId
          : m.guestToken === input.identity.guestToken),
      );
    }
    return this.leaveOutcome;
  }

  async getRoomForJoin(roomId: number): Promise<HubRoomState | null> {
    return this.states.get(roomId) ?? null;
  }

  async markAllMembersLeft(): Promise<void> {
    this.markAllMembersLeftCalls += 1;
  }
}

function memberRowFor(identity: HubIdentity): HubRoomState['members'][number] {
  return identity.kind === 'user'
    ? {
        role: 'participant',
        userId: identity.userId,
        guestToken: null,
        userPublicId: identity.publicId,
        username: identity.username,
        pfpUrl: null,
        joinedAt: JOINED_AT,
      }
    : {
        role: 'participant',
        userId: null,
        guestToken: identity.guestToken,
        userPublicId: null,
        username: null,
        pfpUrl: null,
        joinedAt: JOINED_AT,
      };
}

function makeHub(store: FakeStore): {
  hub: RoomHub;
  store: FakeStore;
  limiter: SlidingWindowRateLimiter;
} {
  const limiter = new SlidingWindowRateLimiter({
    maxAttempts: ROOM_CODE_JOIN_MAX_ATTEMPTS,
    windowMs: ROOM_CODE_JOIN_WINDOW_MS,
    now: () => 1_000_000,
  });
  const hub = new RoomHub({ store, limiter });
  return { hub, store, limiter };
}

function connection(id: string, actor: HubIdentity | null, ip = '10.0.0.1'): FakeConnection {
  return new FakeConnection(id, { ip, actor });
}

describe('join flow', () => {
  test('sends the authoritative snapshot to the joiner and memberJoined to the others', async () => {
    const store = new FakeStore();
    store.states.set(ROOM_ID, roomState());
    const { hub } = makeHub(store);

    const hostConn = connection('c1', ada);
    await hub.handleJoin(hostConn, { type: 'joinRoom', code: 'DWRF42' });

    const snapshot = hostConn.last('roomSnapshot');
    expect(snapshot).toBeDefined();
    expect(snapshot?.room.code).toBe('DWRF42');
    expect(snapshot?.room.config).toEqual(defaultRoomConfig);
    expect(snapshot?.room.host).toEqual({ publicId: ADA_ID, username: 'ada' });
    expect(snapshot?.members).toHaveLength(1);
    expect(snapshot?.members[0]).toEqual({
      kind: 'user',
      publicId: ADA_ID,
      username: 'ada',
      pfpUrl: null,
      role: 'participant',
      joinedAt: JOINED_AT.toISOString(),
      connected: true,
    });

    store.states.set(ROOM_ID, roomState());
    const guestConn = connection('c2', gimli);
    await hub.handleJoin(guestConn, { type: 'joinRoom', code: 'DWRF42' });

    const joined = hostConn.last('memberJoined');
    expect(joined?.type).toBe('memberJoined');
    expect(joined?.member).toEqual({
      kind: 'guest',
      guestToken: GUEST_TOKEN,
      nickname: 'Gimli',
      role: 'participant',
      joinedAt: JOINED_AT.toISOString(),
      connected: true,
    });

    const guestSnapshot = guestConn.last('roomSnapshot');
    expect(guestSnapshot?.members).toHaveLength(2);
    expect(hub.connectionCount()).toBe(2);
    expect(hub.roomCount()).toBe(1);
  });

  test('a guest whose socket is not connected appears with nickname null', async () => {
    const store = new FakeStore();
    store.states.set(
      ROOM_ID,
      roomState({
        members: [
          ...roomState().members,
          {
            role: 'participant',
            userId: null,
            guestToken: GUEST_TOKEN,
            userPublicId: null,
            username: null,
            pfpUrl: null,
            joinedAt: JOINED_AT,
          },
        ],
      }),
    );
    const { hub } = makeHub(store);

    const hostConn = connection('c1', ada);
    await hub.handleJoin(hostConn, { type: 'joinRoom', code: 'DWRF42' });

    const snapshot = hostConn.last('roomSnapshot');
    const guest = snapshot?.members.find((m) => m.kind === 'guest');
    expect(guest).toMatchObject({ nickname: null, connected: false });
  });

  test('maps store failures to protocol errors', async () => {
    for (const [error, message] of [
      ['room_not_found', undefined],
      ['room_full', undefined],
      ['kicked', undefined],
    ] as const) {
      const store = new FakeStore();
      store.joinResult = { ok: false, error };
      const { hub } = makeHub(store);
      const conn = connection('c1', ada);

      await hub.handleJoin(conn, { type: 'joinRoom', code: 'DWRF42' });

      const reply = conn.last('error');
      expect(reply?.code).toBe(error);
      expect(reply?.message).toBe(message);
      expect(hub.connectionCount()).toBe(0);
    }
  });

  test('rejects an anonymous connection (no session and no guest cookie)', async () => {
    const { hub, store } = makeHub(new FakeStore());
    const conn = connection('c1', null);

    await hub.handleJoin(conn, { type: 'joinRoom', code: 'DWRF42' });

    expect(conn.last('error')?.code).toBe('invalid_input');
    expect(store.joinCalls).toHaveLength(0);
  });

  test('rejects a nickname for a user and a mismatching nickname for a guest', async () => {
    const { hub } = makeHub(new FakeStore());

    const userConn = connection('c1', ada);
    await hub.handleJoin(userConn, { type: 'joinRoom', code: 'DWRF42', nickname: 'Troll' });
    expect(userConn.last('error')?.code).toBe('invalid_input');

    const guestConn = connection('c2', gimli);
    await hub.handleJoin(guestConn, { type: 'joinRoom', code: 'DWRF42', nickname: 'Legolas' });
    expect(guestConn.last('error')?.code).toBe('invalid_input');
  });

  test('rate-limits join attempts per IP (SALLE-10) and resets on success', async () => {
    const { hub, store } = makeHub(new FakeStore());
    const conn = connection('c1', ada, '192.0.2.7');

    store.joinResult = { ok: false, error: 'room_not_found' };
    for (let attempt = 0; attempt < ROOM_CODE_JOIN_MAX_ATTEMPTS; attempt += 1) {
      await hub.handleJoin(conn, { type: 'joinRoom', code: 'DWRF42' });
    }
    expect(conn.last('error')?.code).toBe('room_not_found');

    await hub.handleJoin(conn, { type: 'joinRoom', code: 'DWRF42' });
    expect(conn.last('error')?.code).toBe('rate_limited');
  });
});

describe('duplicate connections for one membership', () => {
  test('a second connection replaces the first with an already_in_room error', async () => {
    const store = new FakeStore();
    store.states.set(ROOM_ID, roomState());
    const { hub } = makeHub(store);

    const first = connection('c1', ada);
    await hub.handleJoin(first, { type: 'joinRoom', code: 'DWRF42' });

    const second = connection('c2', ada);
    await hub.handleJoin(second, { type: 'joinRoom', code: 'DWRF42' });

    expect(first.closed).toBe(true);
    expect(first.closeCode).toBe(4001);
    expect(first.last('error')?.code).toBe('already_in_room');
    expect(second.last('roomSnapshot')).toBeDefined();
    expect(hub.connectionCount()).toBe(1);
  });

  test('a second tab that closed first does not produce a duplicate', async () => {
    const store = new FakeStore();
    store.states.set(ROOM_ID, roomState());
    const { hub } = makeHub(store);

    const first = connection('c1', ada);
    await hub.handleJoin(first, { type: 'joinRoom', code: 'DWRF42' });
    first.closed = true;
    await hub.handleDisconnect(first);

    const second = connection('c2', ada);
    await hub.handleJoin(second, { type: 'joinRoom', code: 'DWRF42' });

    expect(second.last('roomSnapshot')).toBeDefined();
    expect(hub.connectionCount()).toBe(1);
    expect(store.leaveCalls).toHaveLength(1);
  });
});

describe('leaving', () => {
  test('broadcasts memberLeft and marks the membership left', async () => {
    const store = new FakeStore();
    const state = roomState({
      members: [
        ...roomState().members,
        {
          role: 'participant',
          userId: 8,
          guestToken: null,
          userPublicId: BOB_ID,
          username: 'bob',
          pfpUrl: null,
          joinedAt: JOINED_AT,
        },
      ],
    });
    store.states.set(ROOM_ID, state);
    const { hub } = makeHub(store);

    const hostConn = connection('c1', ada);
    await hub.handleJoin(hostConn, { type: 'joinRoom', code: 'DWRF42' });
    store.states.set(
      ROOM_ID,
      roomState({
        members: [...roomState().members, state.members[1]],
      }),
    );
    const bobConn = connection('c2', bob);
    await hub.handleJoin(bobConn, { type: 'joinRoom', code: 'DWRF42' });

    await hub.handleLeave(bobConn);

    const left = hostConn.last('memberLeft');
    expect(left?.member).toMatchObject({ kind: 'user', username: 'bob', connected: false });
    expect(store.leaveCalls).toEqual([{ roomId: ROOM_ID, identity: bob }]);
    expect(hub.connectionCount()).toBe(1);
  });

  test('broadcasts hostChanged when the departing host is replaced (SALLE-08)', async () => {
    const store = new FakeStore();
    const state = roomState({
      members: [
        ...roomState().members,
        {
          role: 'participant',
          userId: 8,
          guestToken: null,
          userPublicId: BOB_ID,
          username: 'bob',
          pfpUrl: null,
          joinedAt: JOINED_AT,
        },
      ],
    });
    store.states.set(ROOM_ID, state);
    store.leaveOutcome = {
      left: true,
      hostChangedTo: { publicId: BOB_ID, username: 'bob' },
      roomClosed: false,
    };
    const { hub } = makeHub(store);

    const hostConn = connection('c1', ada);
    await hub.handleJoin(hostConn, { type: 'joinRoom', code: 'DWRF42' });
    const bobConn = connection('c2', bob);
    await hub.handleJoin(bobConn, { type: 'joinRoom', code: 'DWRF42' });

    await hub.handleLeave(hostConn);

    expect(store.leaveCalls[0].identity).toEqual(ada);
    expect(bobConn.last('hostChanged')?.host).toEqual({ publicId: BOB_ID, username: 'bob' });
  });

  test('broadcasts roomClosed and evicts everyone when the host leaves with no successor', async () => {
    const store = new FakeStore();
    const state = roomState({
      members: [
        ...roomState().members,
        {
          role: 'participant',
          userId: 8,
          guestToken: null,
          userPublicId: BOB_ID,
          username: 'bob',
          pfpUrl: null,
          joinedAt: JOINED_AT,
        },
      ],
    });
    store.states.set(ROOM_ID, state);
    store.leaveOutcome = { left: true, hostChangedTo: null, roomClosed: true };
    const { hub } = makeHub(store);

    const hostConn = connection('c1', ada);
    await hub.handleJoin(hostConn, { type: 'joinRoom', code: 'DWRF42' });
    const bobConn = connection('c2', bob);
    await hub.handleJoin(bobConn, { type: 'joinRoom', code: 'DWRF42' });

    await hub.handleLeave(hostConn);

    expect(bobConn.last('roomClosed')).toBeDefined();
    expect(bobConn.closed).toBe(true);
    expect(hub.connectionCount()).toBe(0);
  });

  test('a disconnect applies the same departure path (memberLeft broadcast)', async () => {
    const store = new FakeStore();
    store.states.set(ROOM_ID, roomState());
    const { hub } = makeHub(store);

    const hostConn = connection('c1', ada);
    await hub.handleJoin(hostConn, { type: 'joinRoom', code: 'DWRF42' });
    const guestConn = connection('c2', gimli);
    await hub.handleJoin(guestConn, { type: 'joinRoom', code: 'DWRF42' });

    await hub.handleDisconnect(guestConn);

    expect(hostConn.last('memberLeft')?.member).toMatchObject({
      kind: 'guest',
      guestToken: GUEST_TOKEN,
      connected: false,
    });
    expect(store.leaveCalls).toHaveLength(1);
  });

  test('a disconnect after a hub-initiated close is a no-op', async () => {
    const store = new FakeStore();
    store.states.set(ROOM_ID, roomState());
    const { hub } = makeHub(store);

    const first = connection('c1', ada);
    await hub.handleJoin(first, { type: 'joinRoom', code: 'DWRF42' });
    const second = connection('c2', ada);
    await hub.handleJoin(second, { type: 'joinRoom', code: 'DWRF42' });

    await hub.handleDisconnect(first);
    expect(store.leaveCalls).toHaveLength(0);
  });
});

describe('host action notifications', () => {
  test('notifyMemberKicked sends error(kicked) to the target and memberKicked to the room', async () => {
    const store = new FakeStore();
    const state = roomState({
      members: [
        ...roomState().members,
        {
          role: 'participant',
          userId: 8,
          guestToken: null,
          userPublicId: BOB_ID,
          username: 'bob',
          pfpUrl: null,
          joinedAt: JOINED_AT,
        },
      ],
    });
    store.states.set(ROOM_ID, state);
    const { hub } = makeHub(store);

    const hostConn = connection('c1', ada);
    await hub.handleJoin(hostConn, { type: 'joinRoom', code: 'DWRF42' });
    const bobConn = connection('c2', bob);
    await hub.handleJoin(bobConn, { type: 'joinRoom', code: 'DWRF42' });

    hub.notifyMemberKicked(ROOM_ID, bob);

    expect(bobConn.last('error')?.code).toBe('kicked');
    expect(bobConn.closed).toBe(true);
    const kicked = hostConn.last('memberKicked');
    expect(kicked?.member).toMatchObject({ kind: 'user', username: 'bob' });
    expect(hub.connectionCount()).toBe(1);
  });

  test('notifyHostChanged, notifyConfigUpdated and notifyRoomClosed broadcast to the room', async () => {
    const store = new FakeStore();
    store.states.set(ROOM_ID, roomState());
    const { hub } = makeHub(store);

    const hostConn = connection('c1', ada);
    await hub.handleJoin(hostConn, { type: 'joinRoom', code: 'DWRF42' });
    const guestConn = connection('c2', gimli);
    await hub.handleJoin(guestConn, { type: 'joinRoom', code: 'DWRF42' });

    hub.notifyHostChanged(ROOM_ID, { publicId: BOB_ID, username: 'bob' });
    expect(guestConn.last('hostChanged')?.host.username).toBe('bob');
    expect(hostConn.last('hostChanged')).toBeDefined();

    hub.notifyConfigUpdated(ROOM_ID, defaultRoomConfig);
    expect(guestConn.last('configUpdated')?.config).toEqual(defaultRoomConfig);

    hub.notifyRoomClosed(ROOM_ID);
    expect(guestConn.last('roomClosed')).toBeDefined();
    expect(guestConn.closed).toBe(true);
    expect(hostConn.closed).toBe(true);
    expect(hub.connectionCount()).toBe(0);
  });

  test('notifications to a room without connections are no-ops', () => {
    const { hub } = makeHub(new FakeStore());
    hub.notifyHostChanged(ROOM_ID, { publicId: BOB_ID, username: 'bob' });
    hub.notifyConfigUpdated(ROOM_ID, defaultRoomConfig);
    hub.notifyRoomClosed(ROOM_ID);
    hub.notifyMemberKicked(ROOM_ID, ada);
    expect(hub.connectionCount()).toBe(0);
  });
});

describe('heartbeat and shutdown', () => {
  test('terminates a connection that missed its pong and evicts it (~dead socket)', async () => {
    jest.useFakeTimers();
    try {
      const store = new FakeStore();
      store.states.set(ROOM_ID, roomState());
      const { hub } = makeHub(store);
      const conn = connection('c1', ada);
      conn.onClose = () => {
        void hub.handleDisconnect(conn);
      };
      await hub.handleJoin(conn, { type: 'joinRoom', code: 'DWRF42' });
      hub.startHeartbeat();

      conn.alive = false; // the previous ping was never answered
      jest.advanceTimersByTime(30_000);

      expect(conn.terminated).toBe(true);
      await Promise.resolve();
      expect(store.leaveCalls).toHaveLength(1);
      expect(hub.connectionCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test('pings an alive connection without terminating it', async () => {
    jest.useFakeTimers();
    try {
      const store = new FakeStore();
      store.states.set(ROOM_ID, roomState());
      const { hub } = makeHub(store);
      const conn = connection('c1', ada);
      await hub.handleJoin(conn, { type: 'joinRoom', code: 'DWRF42' });
      hub.startHeartbeat();

      conn.alive = true;
      jest.advanceTimersByTime(30_000);

      expect(conn.pingCount).toBe(1);
      expect(conn.terminated).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test('shutdown closes every connection and marks all memberships left', async () => {
    const store = new FakeStore();
    store.states.set(ROOM_ID, roomState());
    const { hub } = makeHub(store);
    const conn = connection('c1', ada);
    await hub.handleJoin(conn, { type: 'joinRoom', code: 'DWRF42' });

    await hub.shutdown();

    expect(conn.closed).toBe(true);
    expect(conn.closeCode).toBe(1001);
    expect(store.markAllMembersLeftCalls).toBe(1);
    expect(hub.connectionCount()).toBe(0);
  });
});
