import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { getRoomForJoin, setRoomStatus } from '../db/queries/rooms';
import { persistRaceResult } from '../db/queries/races';
import { getUserFullProfile } from '../db/queries/users';
// Pure token codecs — the realtime server runs before the Next request
// context exists, so it must never import `next/headers` here.
import { decodeGuestToken, GUEST_COOKIE_NAME } from '../lib/guest-token';
import { decodeSessionToken, SESSION_COOKIE_NAME } from '../lib/session-token';
import {
  hubKeyForIdentity,
  RoomHub,
  type ConnectionMeta,
  type HubConnection,
  type HubIdentity,
  type RoomStore,
} from './hub';
import { checkOrigin } from './origin';
import { clientMessageSchema, type ServerMessage } from './protocol';
import { PostgresRoomStore } from './room-store';
import { setRaceEngine, setRealtimeHub } from './events';
import { RaceEngine, type RaceEngineMember } from './race-engine';
import { pickRaceText } from './race-text-provider';

/**
 * `ws` adapter for the room hub (ADR-010, Decision A): a `WebSocketServer`
 * (`noServer: true`) on the same `node:http` server that hosts Next.js.
 * Upgrades are filtered by path, so Next's own upgrade listener keeps
 * handling dev HMR and proxied routes untouched — the coexistence pattern
 * documented in Next's `router-server.js` ("if there's no matched output, we
 * don't handle the request as user's custom WS server may be listening on
 * the same path").
 *
 * Every socket is bound to a {@link HubConnection}; authentication is read
 * from the signed `session`/`guest` cookies of the upgrade request, the
 * Origin is checked (same-origin always accepted, `WS_ALLOWED_ORIGINS`
 * entries merged on top — see `src/realtime/origin.ts`), and every message
 * is validated with the Zod protocol schemas before it reaches the hub
 * (TECH-07).
 */

export const REALTIME_WS_PATH = '/ws';

export type RealtimeServerOptions = {
  store?: RoomStore;
  /** Explicit allowlist from `WS_ALLOWED_ORIGINS`; same-origin when unset. */
  allowedOrigins?: string[];
};

export type RealtimeServer = {
  hub: RoomHub;
  /** Closes every socket and marks all memberships left. */
  close(): Promise<void>;
};

/** Parses `key=value; key2=value2` into a record (RFC 6265 tolerant). */
function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) {
    return cookies;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) {
      cookies[key] = value;
    }
  }
  return cookies;
}

/**
 * Resolves the connection's identity from the signed cookies: the user
 * session first (its public id is translated to the internal id the store
 * needs), then the guest session. Returns `null` for anonymous sockets —
 * the hub rejects their joins with `invalid_input`.
 */
async function resolveActor(request: IncomingMessage): Promise<HubIdentity | null> {
  const secret = process.env.SESSION_SECRET;
  if (secret) {
    const cookies = parseCookies(request.headers.cookie);

    const sessionToken = cookies[SESSION_COOKIE_NAME];
    if (sessionToken) {
      const payload = decodeSessionToken(sessionToken, secret);
      if (payload) {
        const profile = await getUserFullProfile({ publicId: payload.publicId });
        if (profile) {
          return {
            kind: 'user',
            userId: profile.id,
            publicId: profile.publicId,
            username: profile.username,
          };
        }
      }
    }

    const guestToken = cookies[GUEST_COOKIE_NAME];
    if (guestToken) {
      const payload = decodeGuestToken(guestToken, secret);
      if (payload) {
        return { kind: 'guest', guestToken: payload.guestId, nickname: payload.nickname };
      }
    }
  }
  return null;
}

/** Client IP for rate limiting, mirroring the actions' `clientIp`. */
function clientIpOf(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]?.trim() ?? '';
    if (first.length > 0 && first.length <= 45) {
      return first;
    }
  }
  return request.socket.remoteAddress ?? 'local';
}

function upgradePathname(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? '/', 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

/**
 * Builds the production {@link RaceEngine} over the room queries and the
 * hub: room snapshots come from `getRoomForJoin` (guests' display names from
 * the hub's live identities, since nicknames live in the signed cookie),
 * texts from the corpus/dictionary picker, status persistence through
 * `setRoomStatus` and broadcasts through the hub's room fan-out. `getHub`
 * defers the hub reference so hub ↔ engine wiring can be circular.
 */
function createRaceEngine(getHub: () => RoomHub): RaceEngine {
  return new RaceEngine({
    now: () => new Date(),
    async loadRoom(roomId) {
      const state = await getRoomForJoin(roomId);
      if (!state) {
        return null;
      }
      const members: RaceEngineMember[] = state.members.map((row) => {
        const isUser = row.userId !== null;
        const key = isUser ? `user:${row.userId}` : `guest:${row.guestToken as string}`;
        return {
          memberId: row.memberId,
          role: row.role,
          userId: row.userId,
          guestToken: row.guestToken,
          publicId: (isUser ? row.userPublicId : row.guestToken) as string,
          displayName: isUser
            ? (row.username ?? 'player')
            : (getHub().nicknameFor(state.roomId, key) ?? 'Guest'),
          hubKey: key,
        };
      });
      return {
        publicId: state.publicId,
        config: state.config,
        hostUserId: state.hostUserId,
        members,
      };
    },
    pickText: pickRaceText,
    persistStatus: (roomId, status) => setRoomStatus(roomId, status),
    // RES-05: the engine hands over the finished race exactly once; the
    // persistence layer writes race + participants + user stats in one
    // transaction. Failures are logged by the engine, not thrown here.
    persistResults: (payload) => persistRaceResult(payload),
    broadcast: (roomId, message) => getHub().sendToRoom(roomId, message),
    randomSeed: () => Math.floor(Math.random() * 0x1_0000_0000),
  });
}

/** `ws` socket wrapped as a transport-neutral {@link HubConnection}. */
class WsConnection implements HubConnection {
  readonly id: string;
  readonly meta: ConnectionMeta;
  private alive = true;
  /** Frames received before the cookie→identity lookup finished. */
  private readonly pending: unknown[] = [];
  private actorResolved = false;

  constructor(
    private readonly socket: WebSocket,
    ip: string,
  ) {
    this.id = randomUUID();
    this.meta = { ip, actor: null };
  }

  /**
   * Sets the resolved identity and flushes the frames that arrived while the
   * lookup was in flight — attaching ws listeners only after the lookup made
   * the client's first `joinRoom` (sent immediately on open) disappear.
   */
  resolveActor(actor: HubIdentity | null): unknown[] {
    this.meta.actor = actor;
    this.actorResolved = true;
    return this.pending.splice(0);
  }

  isActorResolved(): boolean {
    return this.actorResolved;
  }

  bufferFrame(data: unknown): void {
    this.pending.push(data);
  }

  send(message: ServerMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  close(code?: number, reason?: string): void {
    this.socket.close(code, reason);
  }

  ping(): void {
    this.alive = false;
    this.socket.ping();
  }

  isAlive(): boolean {
    return this.alive;
  }

  terminate(): void {
    this.socket.terminate();
  }

  markPong(): void {
    this.alive = true;
  }
}

export function createRealtimeServer(
  httpServer: HttpServer,
  options: RealtimeServerOptions = {},
): RealtimeServer {
  const store = options.store ?? new PostgresRoomStore();
  // The engine and the hub reference each other (engine deps broadcast
  // through the hub; the hub's race hooks call back into the engine), so
  // the engine resolves the hub through a late-bound holder: `getHub` is
  // only invoked at race time, after the assignment below.
  const hubHolder: { current: RoomHub | null } = { current: null };
  const engine = createRaceEngine(() => hubHolder.current as RoomHub);
  const hub = new RoomHub({ store, raceHooks: engine });
  hubHolder.current = hub;
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    if (upgradePathname(request) !== REALTIME_WS_PATH) {
      // Not ours — Next's own upgrade listener handles dev HMR and proxied
      // routes; touching the socket here would break them (ADR-010).
      return;
    }

    const originError = checkOrigin(
      request.headers.origin,
      request.headers.host,
      options.allowedOrigins ?? [],
    );
    if (originError) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    const connection = new WsConnection(ws, clientIpOf(request));

    // Listeners are attached synchronously: the client typically sends its
    // first `joinRoom` right after the handshake, before the asynchronous
    // cookie→identity lookup can finish. Frames received in that window are
    // buffered and dispatched once the identity is known.
    ws.on('pong', () => {
      connection.markPong();
    });

    ws.on('message', (data) => {
      if (!connection.isActorResolved()) {
        connection.bufferFrame(data);
        return;
      }
      void dispatchMessage(hub, engine, connection, data).catch((error: unknown) => {
        console.error('realtime: message handling failed', error);
      });
    });

    ws.on('close', () => {
      void hub.handleDisconnect(connection).catch((error: unknown) => {
        console.error('realtime: disconnect handling failed', error);
      });
    });

    ws.on('error', (error: unknown) => {
      console.error('realtime: socket error', error);
    });

    void resolveActor(request)
      .then((actor) => {
        const pending = connection.resolveActor(actor);
        for (const frame of pending) {
          void dispatchMessage(hub, engine, connection, frame).catch((error: unknown) => {
            console.error('realtime: buffered message handling failed', error);
          });
        }
      })
      .catch((error: unknown) => {
        console.error('realtime: identity resolution failed', error);
        connection.close(1011, 'identity resolution failed');
      });
  });

  hub.startHeartbeat();
  setRealtimeHub(hub);
  setRaceEngine(engine);
  engine.start();

  return {
    hub,
    async close(): Promise<void> {
      engine.stop();
      setRaceEngine(null);
      setRealtimeHub(null);
      await hub.shutdown();
      wss.close();
    },
  };
}

/** Parses one raw ws frame, validates it and dispatches it to the hub/engine. */
async function dispatchMessage(
  hub: RoomHub,
  engine: RaceEngine,
  connection: HubConnection,
  data: unknown,
): Promise<void> {
  const text =
    typeof data === 'string' ? data : Buffer.isBuffer(data) ? data.toString('utf8') : '';

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    connection.send({ type: 'error', code: 'invalid_input', message: 'not valid JSON' });
    return;
  }

  const parsed = clientMessageSchema.safeParse(raw);
  if (!parsed.success) {
    connection.send({ type: 'error', code: 'invalid_input' });
    return;
  }

  switch (parsed.data.type) {
    case 'joinRoom':
      await hub.handleJoin(connection, parsed.data);
      // COURSE-11 replay (RES-05): a joiner arriving while the room shows
      // the results screen receives the last finished race re-broadcast to
      // this connection only, in the exact `raceFinished` shape the other
      // members already received. `null` when the engine has no payload
      // (never raced, relaunched, or server restarted).
      {
        const membership = hub.membershipOf(connection);
        if (membership) {
          const replayed = engine.raceFinishedReplay(membership.roomId);
          if (replayed) {
            connection.send(replayed);
          }
        }
      }
      break;
    case 'leaveRoom':
      await hub.handleLeave(connection);
      break;
    case 'ping':
      connection.send({ type: 'pong' });
      break;
    case 'startRace': {
      const membership = hub.membershipOf(connection);
      if (!membership) {
        connection.send({ type: 'error', code: 'invalid_input' });
        break;
      }
      const outcome = await engine.startRace(membership.roomId, membership.key);
      if (!outcome.ok) {
        connection.send({
          type: 'error',
          code: outcome.code,
          ...(outcome.message !== undefined ? { message: outcome.message } : {}),
        });
      }
      break;
    }
    case 'raceProgress': {
      const membership = hub.membershipOf(connection);
      if (!membership) {
        connection.send({ type: 'error', code: 'invalid_input' });
        break;
      }
      const outcome = engine.handleRaceProgress(membership.roomId, membership.key, {
        validatedChars: parsed.data.validatedChars,
        correctKeystrokes: parsed.data.correctKeystrokes,
        totalKeystrokes: parsed.data.totalKeystrokes,
      });
      if (!outcome.ok) {
        connection.send({ type: 'error', code: outcome.code });
      }
      break;
    }
    case 'quitRace': {
      const membership = hub.membershipOf(connection);
      if (!membership) {
        connection.send({ type: 'error', code: 'invalid_input' });
        break;
      }
      const outcome = engine.quitRace(membership.roomId, membership.key);
      if (!outcome.ok) {
        connection.send({ type: 'error', code: outcome.code });
      }
      break;
    }
    case 'rejoinRace': {
      const membership = hub.membershipOf(connection);
      if (!membership) {
        connection.send({ type: 'error', code: 'invalid_input' });
        break;
      }
      const outcome = engine.rejoinRace(membership.roomId, membership.key);
      if (!outcome.ok) {
        connection.send({ type: 'error', code: outcome.code });
        break;
      }
      // COURSE-08: answer with the full resume snapshot (phase, text, own
      // counters) so the client re-applies its race state.
      const snapshot = engine.raceSnapshotFor(membership.roomId, membership.key);
      if (snapshot) {
        connection.send(snapshot);
      }
      break;
    }
  }
}
