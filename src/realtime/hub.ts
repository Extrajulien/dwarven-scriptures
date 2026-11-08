import {
  RateLimitExceededError,
  roomCodeJoinLimiter,
  SlidingWindowRateLimiter,
} from '../lib/rate-limit';
import type { RoomConfig } from '../db/schema';
import type {
  ConfigUpdatedMessage,
  ErrorMessage,
  HostChangedMessage,
  HostInfo,
  JoinRoomMessage,
  MemberInfo,
  MemberPresenceMessage,
  RoomClosedMessage,
  RoomSnapshotMessage,
  RoomInfo,
  RoomStatus,
  ServerMessage,
  WsErrorCode,
} from './protocol';

/**
 * In-memory room hub — the transport-agnostic heart of the realtime layer.
 *
 * This module must never import `ws` or any transport: it talks to clients
 * through the {@link HubConnection} interface and to PostgreSQL through the
 * {@link RoomStore} seam. The `ws` adapter (`src/realtime/server.ts`) and the
 * race engine (Phase 2) both sit on opposite sides of this module, so game
 * logic imports the hub, never the transport (AGENTS.md).
 *
 * ## Responsibilities
 *
 * - **Room registry** (`roomId → members`) of live connections. A membership
 *   is keyed by the person's identity (`user:<internalUserId>` or
 *   `guest:<guestToken>`); internal ids stay in memory, never on the wire.
 * - **Join flow** (SALLE-05/07/09, SALLE-10): rate-limits the attempt per IP,
 *   delegates admission to the store (which applies the same queries as the
 *   `joinRoomByCode` server action), then sends the authoritative snapshot to
 *   the new connection and `memberJoined` to everyone else.
 * - **One connection per membership:** a second connection for the same
 *   membership replaces the first — the old connection receives an
 *   `error(already_in_room)` and is closed. This is the documented behaviour
 *   for a second tab: the newest tab wins, the previous one is told why.
 * - **Presence:** `memberJoined` / `memberLeft` / `memberKicked` broadcasts,
 *   plus `hostChanged` / `configUpdated` / `roomClosed` helpers called from
 *   server actions through `src/realtime/events.ts` (Decision A: one process,
 *   so the actions reach this instance directly — no NOTIFY bridge).
 * - **Heartbeat:** every ~30 s each connection is pinged; a connection that
 *   failed to answer the previous ping is terminated, which triggers the
 *   normal departure path (dead-socket eviction in ~30–60 s).
 * - **Graceful shutdown:** closes every connection and marks all memberships
 *   left in one statement, so a restart leaves no ghost members behind.
 *
 * ## Phase-1 reconnection model (documented)
 *
 * There is no resume-in-place yet: a dropped connection is marked as left in
 * the database and broadcast as `memberLeft`. The client reconnects by
 * re-joining with the code/invitation token (COURSE-08's 30-second
 * mid-race resume arrives in Phase 2). A person who is still an active
 * member of the same room in the database (e.g. they joined through the
 * server action and open the socket afterwards) re-joins without creating a
 * second membership — the store reports `rejoin: true` and the hub only adds
 * the connection.
 */

export type HubIdentity =
  | { kind: 'user'; userId: number; publicId: string; username: string }
  | { kind: 'guest'; guestToken: string; nickname: string };

export type JoinTarget = { code: string } | { invitationToken: string };

/** Wire-shape room state the store adapts from `getRoomForJoin`. */
export type HubRoomMember = {
  role: string;
  userId: number | null;
  guestToken: string | null;
  userPublicId: string | null;
  username: string | null;
  pfpUrl: string | null;
  joinedAt: Date;
};

export type HubRoomState = {
  roomId: number;
  publicId: string;
  code: string;
  visibility: 'public' | 'code' | 'private';
  status: RoomStatus;
  capacity: number;
  config: RoomConfig;
  hostUserId: number;
  hostPublicId: string;
  hostName: string;
  createdAt: Date;
  members: HubRoomMember[];
};

export type RoomStoreJoinInput = {
  identity: HubIdentity;
  target: JoinTarget;
  ip: string;
};

export type RoomStoreJoinResult =
  | { ok: true; roomId: number; rejoin: boolean }
  | { ok: false; error: WsErrorCode };

/** What a departure changed, so the hub can broadcast the right events. */
export type LeaveOutcome = {
  /** False when the membership was already gone (e.g. the room was closed). */
  left: boolean;
  hostChangedTo: HostInfo | null;
  roomClosed: boolean;
};

/**
 * Database seam for the hub. The real implementation
 * (`src/realtime/room-store.ts`) adapts the queries in
 * `src/db/queries/rooms.ts` / `invitations.ts`; tests use a fake.
 */
export interface RoomStore {
  joinRoom(input: RoomStoreJoinInput): Promise<RoomStoreJoinResult>;
  leaveRoom(input: { roomId: number; identity: HubIdentity }): Promise<LeaveOutcome>;
  getRoomForJoin(roomId: number): Promise<HubRoomState | null>;
  /** Marks every present membership as left (used by graceful shutdown). */
  markAllMembersLeft(): Promise<void>;
}

export interface ConnectionMeta {
  /** Client IP (rate limiting, SALLE-10). */
  ip: string;
  /** Resolved from the signed session/guest cookies at upgrade time. */
  actor: HubIdentity | null;
}

/** Transport-neutral connection the `ws` adapter implements. */
export interface HubConnection {
  readonly id: string;
  readonly meta: ConnectionMeta;
  /** Serializes and sends one server message. */
  send(message: ServerMessage): void;
  /** Starts a graceful close; the transport fires its close handler. */
  close(code?: number, reason?: string): void;
  /** Sends a ws-level ping and marks the connection as pending a pong. */
  ping(): void;
  /** True when the last ping was answered by a pong. */
  isAlive(): boolean;
  /** Destroys the socket immediately (dead-socket eviction). */
  terminate(): void;
}

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

export type RoomHubOptions = {
  store: RoomStore;
  /** Join-attempt limiter (defaults to the shared SALLE-10 limiter). */
  limiter?: SlidingWindowRateLimiter;
  heartbeatIntervalMs?: number;
};

/** Internal registration of one live connection. */
type ConnectedMember = {
  connection: HubConnection;
  identity: HubIdentity;
  /** Pre-built public shape, used for presence events after the join. */
  wire: MemberInfo;
};

function memberKey(identity: HubIdentity): string {
  return identity.kind === 'user' ? `user:${identity.userId}` : `guest:${identity.guestToken}`;
}

function memberKeyFromRow(row: HubRoomMember): string {
  return row.userId !== null ? `user:${row.userId}` : `guest:${row.guestToken as string}`;
}

function normalizeRole(role: string): 'participant' | 'spectator' {
  return role === 'spectator' ? 'spectator' : 'participant';
}

export class RoomHub {
  private readonly store: RoomStore;
  private readonly limiter: SlidingWindowRateLimiter;
  private readonly heartbeatIntervalMs: number;
  private readonly rooms = new Map<number, Map<string, ConnectedMember>>();
  /** roomId → publicId, remembered so broadcasts keep working after a leave. */
  private readonly roomPublicIds = new Map<number, string>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private shuttingDown = false;

  constructor(options: RoomHubOptions) {
    if (!Number.isSafeInteger(options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS) ||
        (options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS) <= 0) {
      throw new Error('heartbeatIntervalMs must be a positive integer');
    }
    this.store = options.store;
    this.limiter = options.limiter ?? roomCodeJoinLimiter;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  }

  /** Number of live connections across all rooms (monitoring + tests). */
  connectionCount(): number {
    let count = 0;
    for (const room of this.rooms.values()) {
      count += room.size;
    }
    return count;
  }

  /** Number of rooms with at least one live connection (tests). */
  roomCount(): number {
    let count = 0;
    for (const room of this.rooms.values()) {
      if (room.size > 0) {
        count += 1;
      }
    }
    return count;
  }

  // ------------------------------------------------------------------ joins

  /**
   * Handles a `joinRoom` client message: rate limit → store admission →
   * registry insert (replacing any previous connection for the same
   * membership) → snapshot to the joiner → `memberJoined` to the room.
   */
  async handleJoin(connection: HubConnection, message: JoinRoomMessage): Promise<void> {
    const actor = connection.meta.actor;
    if (!actor) {
      connection.send(
        this.error('invalid_input', 'sign in or choose a guest nickname before joining (AUTH-02)'),
      );
      return;
    }

    if (message.nickname !== undefined) {
      if (actor.kind !== 'guest') {
        connection.send(this.error('invalid_input', 'nickname is only valid for guests'));
        return;
      }
      if (message.nickname !== actor.nickname) {
        connection.send(
          this.error('invalid_input', 'nickname does not match the signed guest session'),
        );
        return;
      }
    }

    try {
      this.limiter.check(connection.meta.ip);
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        connection.send(this.error('rate_limited'));
        return;
      }
      throw error;
    }

    const target: JoinTarget =
      message.code !== undefined
        ? { code: message.code }
        : { invitationToken: message.invitationToken as string };

    const result = await this.store.joinRoom({
      identity: actor,
      target,
      ip: connection.meta.ip,
    });

    if (!result.ok) {
      connection.send(this.error(result.error));
      return;
    }

    // If the person was present in another room, the store moved them
    // (SALLE-06): tell that room's remaining members.
    const previousRoomId = this.findMembershipRoom(connection);
    if (previousRoomId !== null && previousRoomId !== result.roomId) {
      await this.depart(previousRoomId, connection, { dbLeave: false });
    }

    const state = await this.store.getRoomForJoin(result.roomId);
    if (!state) {
      connection.send(this.error('room_not_found'));
      return;
    }

    const ownRow = state.members.find((row) => memberKeyFromRow(row) === memberKey(actor));
    if (!ownRow) {
      connection.send(
        this.error('invalid_input', 'no active membership found for this identity'),
      );
      return;
    }

    const key = memberKey(actor);
    let room = this.rooms.get(result.roomId);
    if (!room) {
      room = new Map();
      this.rooms.set(result.roomId, room);
    }
    this.roomPublicIds.set(result.roomId, state.publicId);

    // One connection per membership: the newest replaces the oldest.
    const existing = room.get(key);
    if (existing) {
      existing.connection.send(
        this.error(
          'already_in_room',
          'this membership reconnected from another connection; closing this one',
        ),
      );
      room.delete(key);
      existing.connection.close(4001, 'replaced');
    }

    const wire = this.toWireMember(ownRow, state, true, actor);
    room.set(key, { connection, identity: actor, wire });

    connection.send(this.buildSnapshot(state));

    for (const [otherKey, other] of room) {
      if (otherKey !== key) {
        other.connection.send({
          type: 'memberJoined',
          roomPublicId: state.publicId,
          member: wire,
        });
      }
    }

    // The correct code/token is proven knowledge: a fresh window for typos.
    this.limiter.reset(connection.meta.ip);
  }

  // ----------------------------------------------------------------- leaves

  /** Handles a `leaveRoom` client message (voluntary departure). */
  async handleLeave(connection: HubConnection): Promise<void> {
    const roomId = this.findMembershipRoom(connection);
    if (roomId === null) {
      return;
    }
    await this.depart(roomId, connection, { dbLeave: true });
  }

  /**
   * Called by the transport when a socket closes (cleanly or not). Evicts the
   * connection and, when it still held a membership, applies the departure
   * path: `memberLeft` plus `hostChanged`/`roomClosed` when the host left.
   */
  async handleDisconnect(connection: HubConnection): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    const roomId = this.findMembershipRoom(connection);
    if (roomId === null) {
      return;
    }
    await this.depart(roomId, connection, { dbLeave: true });
  }

  /**
   * Removes the connection from `roomId`'s registry. With `dbLeave`, the
   * store applies the departure (SALLE-08 handover included) and the outcome
   * drives the broadcasts; with `dbLeave: false` the store already moved the
   * person during a join and only the `memberLeft` broadcast is needed.
   */
  private async depart(
    roomId: number,
    connection: HubConnection,
    options: { dbLeave: boolean },
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const key = this.keyFor(room, connection);
    if (key === null) {
      return;
    }
    const entry = room.get(key);
    if (!entry) {
      return;
    }
    room.delete(key);
    const publicId = this.roomPublicIds.get(roomId) ?? null;

    if (!options.dbLeave) {
      if (publicId) {
        this.broadcast(room, {
          type: 'memberLeft',
          roomPublicId: publicId,
          member: { ...entry.wire, connected: false },
        });
      }
      return;
    }

    let outcome: LeaveOutcome = { left: false, hostChangedTo: null, roomClosed: false };
    try {
      outcome = await this.store.leaveRoom({ roomId, identity: entry.identity });
    } catch (error) {
      console.error('realtime: leaveRoom failed during departure', error);
      return;
    }

    if (!publicId) {
      return;
    }

    if (outcome.left) {
      this.broadcast(room, {
        type: 'memberLeft',
        roomPublicId: publicId,
        member: { ...entry.wire, connected: false },
      });
    }
    if (outcome.hostChangedTo) {
      this.broadcast(room, {
        type: 'hostChanged',
        roomPublicId: publicId,
        host: outcome.hostChangedTo,
      });
    }
    if (outcome.roomClosed) {
      this.broadcast(room, { type: 'roomClosed', roomPublicId: publicId });
      this.clearRoom(roomId, room);
    }
  }

  // ------------------------------------------- host action notifications

  /**
   * Kicks a present member (SALLE-07): the target receives `error(kicked)`
   * and is closed; the rest of the room receives `memberKicked`. Called from
   * the `kickMember` server action through `src/realtime/events.ts`.
   */
  notifyMemberKicked(roomId: number, identity: HubIdentity): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    const entry = room.get(memberKey(identity));
    if (!entry) {
      return;
    }
    const publicId = this.roomPublicIds.get(roomId);
    entry.connection.send(this.error('kicked', 'you were kicked from the room'));
    room.delete(memberKey(identity));
    entry.connection.close(4003, 'kicked');
    if (publicId) {
      this.broadcast(room, {
        type: 'memberKicked',
        roomPublicId: publicId,
        member: { ...entry.wire, connected: false },
      });
    }
  }

  /** Broadcasts a host change (SALLE-08), from the transferHost action. */
  notifyHostChanged(roomId: number, host: HostInfo): void {
    const room = this.rooms.get(roomId);
    const publicId = this.roomPublicIds.get(roomId);
    if (!room || !publicId) {
      return;
    }
    this.broadcast(room, { type: 'hostChanged', roomPublicId: publicId, host });
  }

  /** Broadcasts a validated config change (CONF-12), from the update action. */
  notifyConfigUpdated(roomId: number, config: RoomConfig): void {
    const room = this.rooms.get(roomId);
    const publicId = this.roomPublicIds.get(roomId);
    if (!room || !publicId) {
      return;
    }
    this.broadcast(room, { type: 'configUpdated', roomPublicId: publicId, config });
  }

  /** Broadcasts the closure and evicts every connection (closeRoom action). */
  notifyRoomClosed(roomId: number): void {
    const room = this.rooms.get(roomId);
    const publicId = this.roomPublicIds.get(roomId);
    if (!room) {
      return;
    }
    if (publicId) {
      this.broadcast(room, { type: 'roomClosed', roomPublicId: publicId });
    }
    this.clearRoom(roomId, room);
  }

  // -------------------------------------------------------------- heartbeat

  startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      this.sweep();
    }, this.heartbeatIntervalMs);
    this.heartbeat.unref?.();
  }

  stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  /**
   * Pings every connection; a connection that did not answer the previous
   * ping is terminated, which surfaces through the transport's close handler
   * and the normal departure path (dead-socket eviction, ~30–60 s).
   */
  private sweep(): void {
    for (const room of this.rooms.values()) {
      for (const entry of room.values()) {
        if (!entry.connection.isAlive()) {
          entry.connection.terminate();
        } else {
          entry.connection.ping();
        }
      }
    }
  }

  // ---------------------------------------------------------------- shutdown

  /**
   * Graceful shutdown: stop the heartbeat, close every connection, clear the
   * registry (so the close events do not re-run departures) and mark every
   * membership left in the database — a restart leaves no ghost members.
   */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    this.stopHeartbeat();
    for (const room of this.rooms.values()) {
      for (const entry of room.values()) {
        entry.connection.close(1001, 'server shutting down');
      }
    }
    this.rooms.clear();
    try {
      await this.store.markAllMembersLeft();
    } catch (error) {
      console.error('realtime: markAllMembersLeft failed during shutdown', error);
    }
  }

  // ---------------------------------------------------------------- helpers

  private error(code: WsErrorCode, message?: string): ErrorMessage {
    return { type: 'error', code, ...(message ? { message } : {}) };
  }

  private findMembershipRoom(connection: HubConnection): number | null {
    for (const [roomId, room] of this.rooms) {
      for (const entry of room.values()) {
        if (entry.connection.id === connection.id) {
          return roomId;
        }
      }
    }
    return null;
  }

  private keyFor(
    room: Map<string, ConnectedMember>,
    connection: HubConnection,
  ): string | null {
    for (const [key, entry] of room) {
      if (entry.connection.id === connection.id) {
        return key;
      }
    }
    return null;
  }

  /**
   * Builds the public member shape for one DB membership row. `joining` is
   * the identity of the connection being admitted (its nickname comes from
   * its own signed cookie); every other guest's nickname is only known while
   * that guest holds a live connection.
   */
  private toWireMember(
    row: HubRoomMember,
    state: HubRoomState,
    connected: boolean,
    joining?: HubIdentity,
  ): MemberInfo {
    const role = normalizeRole(row.role);
    const joinedAt = row.joinedAt.toISOString();

    if (row.userId !== null) {
      if (row.userPublicId === null || row.username === null) {
        throw new Error('corrupt membership: a user member is missing its public identity');
      }
      return {
        kind: 'user',
        publicId: row.userPublicId,
        username: row.username,
        pfpUrl: row.pfpUrl,
        role,
        joinedAt,
        connected,
      };
    }

    const guestToken = row.guestToken;
    if (guestToken === null) {
      throw new Error('corrupt membership: a member is neither user nor guest');
    }
    const live = this.rooms.get(state.roomId)?.get(`guest:${guestToken}`);
    const nickname =
      joining?.kind === 'guest' && joining.guestToken === guestToken
        ? joining.nickname
        : live && live.identity.kind === 'guest'
          ? live.identity.nickname
          : null;
    return { kind: 'guest', guestToken, nickname, role, joinedAt, connected };
  }

  /** Builds the authoritative snapshot sent to a freshly joined connection. */
  private buildSnapshot(state: HubRoomState): RoomSnapshotMessage {
    const roomEntry = this.rooms.get(state.roomId);
    const members: MemberInfo[] = state.members.map((row) => {
      const key = memberKeyFromRow(row);
      const connected = roomEntry?.has(key) ?? false;
      const wire = this.toWireMember(row, state, connected);
      return wire;
    });

    const room: RoomInfo = {
      publicId: state.publicId,
      code: state.code,
      visibility: state.visibility,
      status: state.status,
      capacity: state.capacity,
      config: state.config,
      host: { publicId: state.hostPublicId, username: state.hostName },
      createdAt: state.createdAt.toISOString(),
    };

    return {
      type: 'roomSnapshot',
      room,
      members,
    };
  }

  private broadcast(
    room: Map<string, ConnectedMember>,
    message:
      | MemberPresenceMessage
      | HostChangedMessage
      | ConfigUpdatedMessage
      | RoomClosedMessage,
  ): void {
    for (const entry of room.values()) {
      entry.connection.send(message);
    }
  }

  private clearRoom(roomId: number, room: Map<string, ConnectedMember>): void {
    for (const entry of room.values()) {
      entry.connection.close(4002, 'room closed');
    }
    room.clear();
    this.rooms.delete(roomId);
  }
}
