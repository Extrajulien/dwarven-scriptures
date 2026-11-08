import { randomInt } from 'crypto';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import { db } from '..';
import {
  invitationLinks,
  roomMembers,
  rooms,
  users,
  ROOM_CODE_ALPHABET,
  type Room,
  type RoomConfig,
} from '../schema';
import {
  canJoinRoom,
  findHostSuccessor,
  generateRoomCode,
  hasKickHistory,
  ROOM_CODE_LENGTH,
  type PresentMember,
} from '../../lib/room-rules';
import { roomStatusForPhase } from '../../lib/race/start-rules';
import { parseRoomConfig, resolveRoomConfig } from '../../lib/room-config';

/**
 * Data access for rooms and room members (SALLE-01..09).
 *
 * Rules applied here:
 *
 * 1. **Lookups by an external identifier.** Clients pass a `publicId` or a
 *    room `code`; internal ids never reach them (they are resolved
 *    server-side before a mutation).
 * 2. **Mutations are atomic.** Everything that must not partially commit
 *    (create room + host membership, join + previous-membership handover,
 *    kick + link revocation, close + member eviction) runs in one
 *    transaction, and room-level mutations lock the room row with
 *    `FOR UPDATE` so concurrent joins serialize.
 * 3. **SQL-side guards.** Status, capacity, kick history and the one-active-
 *    room rule are enforced where they can be — in the `WHERE`/index — with
 *    the `rooms` CHECK constraints as a last line of defence.
 */

/** Raised when a requested room does not exist. */
export class RoomNotFoundError extends Error {
  constructor(identifier: string) {
    super(`No room matches ${identifier}`);
    this.name = 'RoomNotFoundError';
  }
}

/** Raised for input the database must not be asked to store. */
export class InvalidRoomInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRoomInputError';
  }
}

/** Raised when a room is not accepting new members (SALLE-09). */
export class RoomNotJoinableError extends Error {
  constructor(status: string) {
    super(`room is not joinable (status: ${status})`);
    this.name = 'RoomNotJoinableError';
  }
}

/** Raised when a participant join would exceed the room capacity (SALLE-05). */
export class RoomFullError extends Error {
  constructor(capacity: number) {
    super(`room is full (capacity: ${capacity})`);
    this.name = 'RoomFullError';
  }
}

/** Raised when a kicked person tries to rejoin their room (SALLE-07). */
export class RoomMemberKickedError extends Error {
  constructor() {
    super('this person was kicked from the room and cannot rejoin it');
    this.name = 'RoomMemberKickedError';
  }
}

/** Raised when a person who is already in a room joins it again (second tab). */
export class AlreadyInRoomError extends Error {
  constructor() {
    super('this person is already an active member of this room');
    this.name = 'AlreadyInRoomError';
  }
}

/** Raised when a host-only operation is attempted by someone else (SEC-01). */
export class NotRoomHostError extends Error {
  constructor() {
    super('only the room host may perform this operation');
    this.name = 'NotRoomHostError';
  }
}

/** Raised when a host handover target is not eligible (SALLE-08). */
export class NotHostCandidateError extends Error {
  constructor() {
    super('the host successor must be a present, non-kicked member of the room');
    this.name = 'NotHostCandidateError';
  }
}

/** Raised when a referenced member is not present in the room. */
export class RoomMemberNotFoundError extends Error {
  constructor() {
    super('no such present member in this room');
    this.name = 'RoomMemberNotFoundError';
  }
}

const ROOM_VISIBILITIES = ['public', 'code', 'private'] as const;
export type RoomVisibility = (typeof ROOM_VISIBILITIES)[number];

const MEMBER_ROLES = ['participant', 'spectator'] as const;
export type JoinRole = (typeof MEMBER_ROLES)[number];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ROOM_CODE_PATTERN = new RegExp(`^[A-HJKMNP-Z2-9]{${ROOM_CODE_LENGTH}}$`);

const MAX_ROOM_CODE_ATTEMPTS = 10;
const MAX_JOIN_ATTEMPTS = 3;

const POSTGRES_UNIQUE_VIOLATION = '23505';
const ROOMS_CODE_UNIQUE_CONSTRAINT = 'rooms_code_unique';
const ONE_ACTIVE_USER_INDEX = 'room_members_one_active_user_idx';
const ONE_ACTIVE_GUEST_INDEX = 'room_members_one_active_guest_idx';

/**
 * Public projection of a room: the internal `id` and `hostUserId` are dropped
 * so they cannot leak through an API response or a cached payload.
 */
export type PublicRoom = {
  publicId: string;
  code: string;
  visibility: string;
  status: string;
  capacity: number;
  config: RoomConfig;
  createdAt: Date;
};

/** Public room plus the counts the lobby displays (SALLE-05, JOIN-02). */
export type PublicRoomSummary = PublicRoom & {
  hostName: string;
  participantCount: number;
};

export type CreateRoomParams = {
  hostUserId: number;
  visibility: RoomVisibility;
  capacity?: number;
  config?: unknown;
  /** SALLE-01: the host races (`participant`, default) or only watches. */
  hostRole?: JoinRole;
};

export type JoinRoomParams = {
  /** Internal room id, resolved server-side from a code or publicId. */
  roomId: number;
  role: JoinRole;
  userId?: number | null;
  guestToken?: string | null;
};

export type JoinedRoom = {
  roomPublicId: string;
  /** Internal id of the created membership row (server-side use only). */
  memberId: number;
  role: string;
  joinedAt: Date;
};

type NormalizedIdentity =
  | { userId: number; guestToken: null }
  | { userId: null; guestToken: string };

/**
 * Server-only snapshot for the realtime layer: the room plus its present
 * members. Contains internal ids (`roomId`, `memberId`, `userId`,
 * `hostUserId`) — never serialize this shape to a client. Guests carry only
 * their `guestToken` (cookie id); their nickname lives in the signed cookie,
 * not in the database, so the caller combines the two.
 */
export type RoomJoinState = {
  roomId: number;
  publicId: string;
  code: string;
  visibility: string;
  status: string;
  capacity: number;
  config: RoomConfig;
  createdAt: Date;
  /** Internal host id, used to decide handover on host departure (SALLE-08). */
  hostUserId: number;
  hostPublicId: string;
  hostName: string;
  members: Array<{
    memberId: number;
    role: string;
    userId: number | null;
    guestToken: string | null;
    userPublicId: string | null;
    username: string | null;
    pfpUrl: string | null;
    joinedAt: Date;
  }>;
};

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InvalidRoomInputError(`${field} must be a positive integer`);
  }
}

function normalizeIdentity(identity: {
  userId?: number | null;
  guestToken?: string | null;
}): NormalizedIdentity {
  const hasUserId = identity.userId !== undefined && identity.userId !== null;
  const hasGuestToken =
    identity.guestToken !== undefined && identity.guestToken !== null && identity.guestToken !== '';

  if (hasUserId === hasGuestToken) {
    throw new InvalidRoomInputError('provide exactly one of userId or guestToken');
  }

  if (hasUserId) {
    assertPositiveInteger(identity.userId as number, 'userId');
    return { userId: identity.userId as number, guestToken: null };
  }

  if (!UUID_PATTERN.test(identity.guestToken as string)) {
    throw new InvalidRoomInputError('guestToken must be a UUID');
  }
  return { userId: null, guestToken: identity.guestToken as string };
}

function identityMatch(identity: NormalizedIdentity) {
  return identity.userId !== null
    ? eq(roomMembers.userId, identity.userId)
    : eq(roomMembers.guestToken, identity.guestToken);
}

function toPublicRoom(room: Room): PublicRoom {
  return {
    publicId: room.publicId,
    code: room.code,
    visibility: room.visibility,
    status: room.status,
    capacity: room.capacity,
    config: room.config,
    createdAt: room.createdAt,
  };
}

function isUniqueViolation(error: unknown, constraintNames: readonly string[]): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);

    const { code, constraint } = current as { code?: unknown; constraint?: unknown };
    if (code === POSTGRES_UNIQUE_VIOLATION) {
      return (
        constraint === undefined ||
        (typeof constraint === 'string' && (constraintNames as readonly string[]).includes(constraint))
      );
    }

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

function isRoomsCodeUniqueViolation(error: unknown): boolean {
  return isUniqueViolation(error, [ROOMS_CODE_UNIQUE_CONSTRAINT]);
}

function isOneActiveRoomUniqueViolation(error: unknown): boolean {
  return isUniqueViolation(error, [ONE_ACTIVE_USER_INDEX, ONE_ACTIVE_GUEST_INDEX]);
}

/** CSPRNG-backed sampler for {@link generateRoomCode} (SALLE-02). */
function randomCodeChar(): number {
  return randomInt(0, ROOM_CODE_ALPHABET.length) / ROOM_CODE_ALPHABET.length;
}

/**
 * Creates a room plus its host membership in one transaction (SALLE-01/02).
 *
 * The room code is drawn from the unambiguous alphabet with a CSPRNG and, on
 * the rare collision, the whole insert is retried with a fresh code. The host
 * membership carries the host's chosen role — `participant` by default,
 * `spectator` when the host only watches (SALLE-01); the host itself is
 * identified by `rooms.hostUserId`, never by the role column.
 */
export async function createRoom(params: CreateRoomParams): Promise<PublicRoom> {
  assertPositiveInteger(params.hostUserId, 'hostUserId');

  if (!(ROOM_VISIBILITIES as readonly string[]).includes(params.visibility)) {
    throw new InvalidRoomInputError(
      `visibility must be one of ${ROOM_VISIBILITIES.join(', ')}`,
    );
  }

  const capacity = params.capacity ?? 10;
  if (!Number.isSafeInteger(capacity) || capacity < 2 || capacity > 30) {
    throw new InvalidRoomInputError('capacity must be an integer between 2 and 30');
  }

  const hostRole = params.hostRole ?? 'participant';
  if (!(MEMBER_ROLES as readonly string[]).includes(hostRole)) {
    throw new InvalidRoomInputError(`hostRole must be one of ${MEMBER_ROLES.join(', ')}`);
  }

  const config = resolveRoomConfig(params.config);

  for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
    const code = generateRoomCode(randomCodeChar);
    try {
      return await insertRoom({
        hostUserId: params.hostUserId,
        visibility: params.visibility,
        capacity,
        config,
        code,
        hostRole,
      });
    } catch (error) {
      if (isRoomsCodeUniqueViolation(error)) {
        // Code collision: try the next candidate in a fresh transaction.
        continue;
      }
      if (isOneActiveRoomUniqueViolation(error)) {
        // SALLE-06: the host is already active in another room. Report it
        // clearly instead of surfacing a raw constraint violation.
        throw new AlreadyInRoomError();
      }
      throw error;
    }
  }

  throw new InvalidRoomInputError('could not allocate a unique room code');
}

async function insertRoom(data: {
  hostUserId: number;
  visibility: RoomVisibility;
  capacity: number;
  config: RoomConfig;
  code: string;
  hostRole: JoinRole;
}): Promise<PublicRoom> {
  return db.transaction(async (tx) => {
    // SALLE-06: the host becomes an active member of the new room, so they
    // must not be active anywhere else. Rejecting here (rather than silently
    // abandoning the room they host) keeps the handover logic in control.
    const [active] = await tx
      .select({ id: roomMembers.id })
      .from(roomMembers)
      .where(and(eq(roomMembers.userId, data.hostUserId), isNull(roomMembers.leftAt)))
      .limit(1);

    if (active) {
      throw new AlreadyInRoomError();
    }

    const [created] = await tx
      .insert(rooms)
      .values({
        hostUserId: data.hostUserId,
        visibility: data.visibility,
        capacity: data.capacity,
        config: data.config,
        code: data.code,
      })
      .returning();

    if (!created) {
      throw new Error('failed to create room: the insert returned no row');
    }

    await tx.insert(roomMembers).values({
      roomId: created.id,
      userId: data.hostUserId,
      role: data.hostRole,
    });

    return toPublicRoom(created);
  });
}

/**
 * Loads a room by its join code, normalised to upper case (SALLE-02). Returns
 * the internal row for the server-side join path, or `null` when the code is
 * unknown or not shaped like a room code (the caller reports "room not found"
 * without revealing whether the room exists).
 */
export async function getRoomByCode(code: string): Promise<Room | null> {
  if (typeof code !== 'string') {
    return null;
  }

  const normalised = code.trim().toUpperCase();
  if (!ROOM_CODE_PATTERN.test(normalised)) {
    return null;
  }

  const rows = await db.select().from(rooms).where(eq(rooms.code, normalised)).limit(1);
  return rows[0] ?? null;
}

/**
 * Loads the internal room row by its external id — the server-side bridge
 * between a client-supplied `publicId` and the internal `id` mutations need.
 */
export async function getRoomInternalByPublicId(publicId: string): Promise<Room | null> {
  if (!UUID_PATTERN.test(publicId)) {
    throw new InvalidRoomInputError('publicId must be a UUID');
  }

  const rows = await db.select().from(rooms).where(eq(rooms.publicId, publicId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Public view of one room: host display name and the participant count
 * (spectators excluded, SALLE-05) computed in SQL. Returns `null` when the
 * room does not exist.
 */
export async function getRoomPublic(publicId: string): Promise<PublicRoomSummary | null> {
  if (!UUID_PATTERN.test(publicId)) {
    throw new InvalidRoomInputError('publicId must be a UUID');
  }

  const rows = await db
    .select({
      publicId: rooms.publicId,
      code: rooms.code,
      visibility: rooms.visibility,
      status: rooms.status,
      capacity: rooms.capacity,
      config: rooms.config,
      createdAt: rooms.createdAt,
      hostName: users.username,
      participantCount: sql<number>`count(*) filter (where ${roomMembers.role} = 'participant' and ${roomMembers.leftAt} is null and ${roomMembers.kicked} = false)`,
    })
    .from(rooms)
    .innerJoin(users, eq(rooms.hostUserId, users.id))
    .leftJoin(roomMembers, eq(roomMembers.roomId, rooms.id))
    .where(eq(rooms.publicId, publicId))
    .groupBy(rooms.id, users.username)
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    publicId: row.publicId,
    code: row.code,
    visibility: row.visibility,
    status: row.status,
    capacity: row.capacity,
    config: row.config,
    createdAt: row.createdAt,
    hostName: row.hostName,
    participantCount: Number(row.participantCount),
  };
}

/**
 * Lists public rooms that are waiting for players (SALLE-03, JOIN-02),
 * optionally filtered by the configured text language and complexity. The
 * filters read the `config` jsonb column in SQL.
 */
export async function listPublicRooms(filters: {
  textLanguage?: string;
  textComplexity?: string;
} = {}): Promise<PublicRoomSummary[]> {  const conditions = [eq(rooms.status, 'en_attente'), eq(rooms.visibility, 'public')];

  if (filters.textLanguage !== undefined) {
    if (!['fr', 'en'].includes(filters.textLanguage)) {
      throw new InvalidRoomInputError('textLanguage must be "fr" or "en"');
    }
    conditions.push(sql`${rooms.config}->>'textLanguage' = ${filters.textLanguage}`);
  }

  if (filters.textComplexity !== undefined) {
    if (!['facile', 'moyen', 'difficile'].includes(filters.textComplexity)) {
      throw new InvalidRoomInputError('textComplexity must be facile, moyen or difficile');
    }
    conditions.push(sql`${rooms.config}->>'textComplexity' = ${filters.textComplexity}`);
  }

  const rows = await db
    .select({
      publicId: rooms.publicId,
      code: rooms.code,
      visibility: rooms.visibility,
      status: rooms.status,
      capacity: rooms.capacity,
      config: rooms.config,
      createdAt: rooms.createdAt,
      hostName: users.username,
      participantCount: sql<number>`count(*) filter (where ${roomMembers.role} = 'participant' and ${roomMembers.leftAt} is null and ${roomMembers.kicked} = false)`,
    })
    .from(rooms)
    .innerJoin(users, eq(rooms.hostUserId, users.id))
    .leftJoin(roomMembers, eq(roomMembers.roomId, rooms.id))
    .where(and(...conditions))
    .groupBy(rooms.id, users.username)
    .orderBy(asc(rooms.createdAt));

  return rows.map((row) => ({
    publicId: row.publicId,
    code: row.code,
    visibility: row.visibility,
    status: row.status,
    capacity: row.capacity,
    config: row.config,
    createdAt: row.createdAt,
    hostName: row.hostName,
    participantCount: Number(row.participantCount),
  }));
}

/**
 * Public view of one room for the lobby page (`/rooms/[publicId]`): the
 * display fields, the host's public identity and the participant count
 * (spectators excluded, SALLE-05). Internal ids never appear — the realtime
 * snapshot is the source of truth once the socket is open, this is the page
 * scaffold around it.
 */
export type RoomForPage = {
  publicId: string;
  code: string;
  visibility: string;
  status: string;
  capacity: number;
  config: RoomConfig;
  hostPublicId: string;
  hostName: string;
  participantCount: number;
  createdAt: Date;
};

export async function getRoomForPage(publicId: string): Promise<RoomForPage | null> {
  if (!UUID_PATTERN.test(publicId)) {
    // Defensive, like `getRoomByCode`: a malformed id is "no such room",
    // never an exception — the page maps `null` to notFound(), so a public
    // route can never 500 on a hand-crafted URL segment.
    return null;
  }

  const rows = await db
    .select({
      publicId: rooms.publicId,
      code: rooms.code,
      visibility: rooms.visibility,
      status: rooms.status,
      capacity: rooms.capacity,
      config: rooms.config,
      hostPublicId: users.publicId,
      hostName: users.username,
      createdAt: rooms.createdAt,
      participantCount: sql<number>`count(*) filter (where ${roomMembers.role} = 'participant' and ${roomMembers.leftAt} is null and ${roomMembers.kicked} = false)`,
    })
    .from(rooms)
    .innerJoin(users, eq(rooms.hostUserId, users.id))
    .leftJoin(roomMembers, eq(roomMembers.roomId, rooms.id))
    .where(eq(rooms.publicId, publicId))
    .groupBy(rooms.id, users.id)
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return { ...row, participantCount: Number(row.participantCount) };
}

/**
 * The viewer's active membership in one room, or `null` when they are not a
 * present member. Lets the room page decide between the full lobby and the
 * join gate (SALLE-03: a code room only opens for members or for people who
 * prove the code; a private room opens only through an invitation link).
 */
export async function getViewerMembership(
  publicId: string,
  identity: { userId?: number | null; guestToken?: string | null },
): Promise<{ role: string } | null> {
  if (!UUID_PATTERN.test(publicId)) {
    throw new InvalidRoomInputError('publicId must be a UUID');
  }
  const normalised = normalizeIdentity(identity);

  const rows = await db
    .select({ role: roomMembers.role })
    .from(roomMembers)
    .innerJoin(rooms, eq(roomMembers.roomId, rooms.id))
    .where(
      and(
        eq(rooms.publicId, publicId),
        identityMatch(normalised),
        isNull(roomMembers.leftAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  return row ? { role: row.role } : null;
}

/**
 * Public reference of a room by its internal id — the invitation route
 * (`/i/[token]`) translates the link's internal `roomId` into the public id
 * it redirects to. Internal ids never reach the client.
 */
export async function getRoomPublicRefById(
  roomId: number,
): Promise<{ publicId: string; status: string } | null> {
  assertPositiveInteger(roomId, 'roomId');

  const rows = await db
    .select({ publicId: rooms.publicId, status: rooms.status })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Serialized public row for the room explorer (JOIN-02): the display fields
 * plus the text language and complexity extracted from the config. Plain
 * JSON-safe values only (`createdAt` as ISO string) so server components can
 * hand the rows to client components unchanged. Reuses `listPublicRooms`, so
 * the SQL is the same as everywhere else (public rooms in `en_attente` only).
 */
export type PublicRoomForPage = {
  publicId: string;
  code: string;
  status: string;
  capacity: number;
  hostName: string;
  participantCount: number;
  textLanguage: 'fr' | 'en';
  textComplexity: 'facile' | 'moyen' | 'difficile';
  createdAt: string;
};

export async function listPublicRoomsForPage(filters: {
  textLanguage?: string;
  textComplexity?: string;
} = {}): Promise<PublicRoomForPage[]> {
  const summaries = await listPublicRooms(filters);
  return summaries.map((room) => ({
    publicId: room.publicId,
    code: room.code,
    status: room.status,
    capacity: room.capacity,
    hostName: room.hostName,
    participantCount: room.participantCount,
    textLanguage: room.config.textLanguage,
    textComplexity: room.config.textComplexity,
    createdAt: room.createdAt.toISOString(),
  }));
}

/**
 * Joins a person to a room (SALLE-05/06/07/09).
 *
 * One transaction, with the room row locked, so concurrent joins to the same
 * room serialize. The one-active-room rule (SALLE-06) is handled as follows:
 * joining a **different** room marks the previous active membership as left
 * (`leftAt`), preserving the history, and the partial unique indexes make a
 * conflicting double-join impossible even for a race between two rooms; a
 * join of the **same** room is rejected (second tab). Because the loser of a
 * concurrent unique-index race can safely adopt the winner's outcome, the
 * transaction retries a few times before giving up.
 */
export async function joinRoom(params: JoinRoomParams): Promise<JoinedRoom> {
  assertPositiveInteger(params.roomId, 'roomId');
  if (!(MEMBER_ROLES as readonly string[]).includes(params.role)) {
    throw new InvalidRoomInputError(`role must be one of ${MEMBER_ROLES.join(', ')}`);
  }
  const identity = normalizeIdentity(params);

  for (let attempt = 0; attempt < MAX_JOIN_ATTEMPTS; attempt += 1) {
    try {
      return await db.transaction(async (tx) => {
        const [room] = await tx
          .select({
            id: rooms.id,
            publicId: rooms.publicId,
            status: rooms.status,
            capacity: rooms.capacity,
          })
          .from(rooms)
          .where(eq(rooms.id, params.roomId))
          .for('update');

        if (!room) {
          throw new RoomNotFoundError(`internal id ${params.roomId}`);
        }

        if (!canJoinRoom(room.status)) {
          throw new RoomNotJoinableError(room.status);
        }

        // SALLE-07: a past kick blocks the rejoin, forever.
        const kickedRows = await tx
          .select({ id: roomMembers.id, kicked: roomMembers.kicked })
          .from(roomMembers)
          .where(
            and(
              eq(roomMembers.roomId, params.roomId),
              identityMatch(identity),
              eq(roomMembers.kicked, true),
            ),
          )
          .limit(1);

        if (hasKickHistory(kickedRows)) {
          throw new RoomMemberKickedError();
        }

        // SALLE-05: capacity counts participants only.
        if (params.role === 'participant') {
          const countRows = await tx
            .select({ count: sql<number>`count(*)` })
            .from(roomMembers)
            .where(
              and(
                eq(roomMembers.roomId, params.roomId),
                eq(roomMembers.role, 'participant'),
                isNull(roomMembers.leftAt),
                eq(roomMembers.kicked, false),
              ),
            );

          if (Number(countRows[0]?.count ?? 0) >= room.capacity) {
            throw new RoomFullError(room.capacity);
          }
        }

        // SALLE-06: move the person out of their previous room, but never
        // admit a duplicate membership of the same room.
        const activeRows = await tx
          .select({ id: roomMembers.id, roomId: roomMembers.roomId })
          .from(roomMembers)
          .where(and(identityMatch(identity), isNull(roomMembers.leftAt)))
          .limit(1);

        const previous = activeRows[0];
        if (previous) {
          if (previous.roomId === params.roomId) {
            throw new AlreadyInRoomError();
          }
          await tx
            .update(roomMembers)
            .set({ leftAt: new Date() })
            .where(eq(roomMembers.id, previous.id));
        }

        const [inserted] = await tx
          .insert(roomMembers)
          .values({
            roomId: params.roomId,
            userId: identity.userId,
            guestToken: identity.guestToken,
            role: params.role,
            joinedAt: new Date(),
          })
          .returning();

        if (!inserted) {
          throw new Error('failed to join room: the insert returned no row');
        }

        return {
          roomPublicId: room.publicId,
          memberId: inserted.id,
          role: inserted.role,
          joinedAt: inserted.joinedAt,
        };
      });
    } catch (error) {
      if (!isOneActiveRoomUniqueViolation(error)) {
        throw error;
      }
      // Lost a concurrent join race: retry — the next pass sees the winning
      // membership and moves this person out of that room instead.
    }
  }

  throw new InvalidRoomInputError('could not join: concurrent joins kept colliding');
}

/**
 * Marks a member of a room as left. The active membership is found by
 * identity within the room, so a caller cannot "leave" another person's seat.
 */
export async function leaveRoom(
  roomId: number,
  identity: { userId?: number | null; guestToken?: string | null },
): Promise<void> {
  assertPositiveInteger(roomId, 'roomId');
  const normalised = normalizeIdentity(identity);

  await db
    .update(roomMembers)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(roomMembers.roomId, roomId),
        identityMatch(normalised),
        isNull(roomMembers.leftAt),
      ),
    );
}

/**
 * Low-level departure: sets `leftAt` on one membership row. Intended for the
 * realtime layer, which already holds the internal member id.
 */
export async function markMemberLeft(memberId: number): Promise<void> {
  assertPositiveInteger(memberId, 'memberId');

  await db
    .update(roomMembers)
    .set({ leftAt: new Date() })
    .where(and(eq(roomMembers.id, memberId), isNull(roomMembers.leftAt)));
}

/**
 * Resolves the active membership of a person inside one room to its internal
 * id, or `null` when they are not present. The action layer uses this to
 * translate a client-supplied identity (user publicId / guest token) into the
 * internal member id that `kickMember` and `markMemberLeft` need — internal
 * ids are never accepted from clients.
 */
export async function getActiveMemberId(
  roomId: number,
  identity: { userId?: number | null; guestToken?: string | null },
): Promise<number | null> {
  assertPositiveInteger(roomId, 'roomId');
  const normalised = normalizeIdentity(identity);

  const rows = await db
    .select({ id: roomMembers.id })
    .from(roomMembers)
    .where(
      and(
        eq(roomMembers.roomId, roomId),
        identityMatch(normalised),
        isNull(roomMembers.leftAt),
      ),
    )
    .limit(1);

  return rows[0]?.id ?? null;
}

/**
 * The room a person is currently an active member of, by its public
 * identifiers — used by the join-by-code flow to show "your current room"
 * when the person is already in a room (SALLE-06) without leaking internal
 * ids. Returns `null` when the person is active in no room.
 */
export async function getActiveRoomOfIdentity(
  identity: { userId?: number | null; guestToken?: string | null },
): Promise<{ publicId: string; code: string } | null> {
  const normalised = normalizeIdentity(identity);

  const rows = await db
    .select({ publicId: rooms.publicId, code: rooms.code })
    .from(roomMembers)
    .innerJoin(rooms, eq(roomMembers.roomId, rooms.id))
    .where(and(identityMatch(normalised), isNull(roomMembers.leftAt)))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Loads the present members of a room and applies the SALLE-08 handover rule:
 * the human member present the longest wins the host role, `null` means the
 * room must be closed. Pure decision in `findHostSuccessor`.
 */
export async function findHostSuccessorForRoom(roomId: number): Promise<PresentMember | null> {
  assertPositiveInteger(roomId, 'roomId');

  const rows = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), isNull(roomMembers.leftAt)));

  return findHostSuccessor(rows) ?? null;
}

/**
 * Passes the host role to another member (SALLE-08). The target must be a
 * present, non-kicked human member of the room. The caller (a server action)
 * is responsible for deciding who the successor is — normally via
 * `findHostSuccessorForRoom` — but this query re-verifies eligibility so no
 * caller can hand a room to someone who is not actually there.
 */
export async function transferHost(roomId: number, newHostUserId: number): Promise<void> {
  assertPositiveInteger(roomId, 'roomId');
  assertPositiveInteger(newHostUserId, 'newHostUserId');

  await db.transaction(async (tx) => {
    const [room] = await tx
      .select({ id: rooms.id, hostUserId: rooms.hostUserId })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .for('update');

    if (!room) {
      throw new RoomNotFoundError(`internal id ${roomId}`);
    }
    if (room.hostUserId === newHostUserId) {
      return;
    }

    const [member] = await tx
      .select({
        id: roomMembers.id,
        userId: roomMembers.userId,
        kicked: roomMembers.kicked,
        leftAt: roomMembers.leftAt,
      })
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, newHostUserId)))
      .limit(1);

    if (!member || member.kicked || member.leftAt !== null) {
      throw new NotHostCandidateError();
    }

    await tx
      .update(rooms)
      .set({ hostUserId: newHostUserId, updatedAt: new Date() })
      .where(eq(rooms.id, roomId));
  });
}

export type KickMemberParams = {
  roomId: number;
  hostUserId: number;
  targetMemberId: number;
};

/**
 * Kicks a participant or spectator (SALLE-07). Only the host may kick
 * (SEC-01, verified against the locked room row), the host cannot kick
 * themselves, and the kicked member's invitation links are revoked in the
 * same transaction (SALLE-04) — see `revokeInvitationsForMember` in
 * `invitations.ts` for the standalone variant.
 */
export async function kickMember(params: KickMemberParams): Promise<void> {
  assertPositiveInteger(params.roomId, 'roomId');
  assertPositiveInteger(params.hostUserId, 'hostUserId');
  assertPositiveInteger(params.targetMemberId, 'targetMemberId');

  await db.transaction(async (tx) => {
    const [room] = await tx
      .select({ id: rooms.id, hostUserId: rooms.hostUserId })
      .from(rooms)
      .where(eq(rooms.id, params.roomId))
      .for('update');

    if (!room) {
      throw new RoomNotFoundError(`internal id ${params.roomId}`);
    }
    if (room.hostUserId !== params.hostUserId) {
      throw new NotRoomHostError();
    }

    const [target] = await tx
      .select({
        id: roomMembers.id,
        userId: roomMembers.userId,
        kicked: roomMembers.kicked,
        leftAt: roomMembers.leftAt,
      })
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, params.roomId), eq(roomMembers.id, params.targetMemberId)))
      .for('update');

    if (!target || target.kicked || target.leftAt !== null) {
      throw new RoomMemberNotFoundError();
    }
    if (target.userId === params.hostUserId) {
      throw new InvalidRoomInputError('the host cannot be kicked');
    }

    const now = new Date();
    await tx
      .update(roomMembers)
      .set({ kicked: true, leftAt: now })
      .where(eq(roomMembers.id, target.id));

    // SALLE-04: the expelled member's links are revoked (used or not — the
    // kick itself already blocks any rejoin).
    await tx
      .update(invitationLinks)
      .set({ status: 'revoked', revokedAt: now })
      .where(
        and(
          eq(invitationLinks.boundMemberId, target.id),
          ne(invitationLinks.status, 'revoked'),
        ),
      );
  });
}

export type CloseRoomParams = {
  roomId: number;
  hostUserId: number;
};

/**
 * Closes a room (SALLE-04, COURSE-01): status → `fermee`, `closedAt` set,
 * every remaining invitation link revoked and every present membership marked
 * as left (so members are free to join other rooms). Host-only (SEC-01).
 */
export async function closeRoom(params: CloseRoomParams): Promise<void> {
  assertPositiveInteger(params.roomId, 'roomId');
  assertPositiveInteger(params.hostUserId, 'hostUserId');

  await db.transaction(async (tx) => {
    const [room] = await tx
      .select({ id: rooms.id, hostUserId: rooms.hostUserId })
      .from(rooms)
      .where(eq(rooms.id, params.roomId))
      .for('update');

    if (!room) {
      throw new RoomNotFoundError(`internal id ${params.roomId}`);
    }
    if (room.hostUserId !== params.hostUserId) {
      throw new NotRoomHostError();
    }

    const now = new Date();
    await tx
      .update(rooms)
      .set({ status: 'fermee', closedAt: now, updatedAt: now })
      .where(eq(rooms.id, params.roomId));

    await tx
      .update(invitationLinks)
      .set({ status: 'revoked', revokedAt: now })
      .where(and(eq(invitationLinks.roomId, params.roomId), ne(invitationLinks.status, 'revoked')));

    await tx
      .update(roomMembers)
      .set({ leftAt: now })
      .where(and(eq(roomMembers.roomId, params.roomId), isNull(roomMembers.leftAt)));
  });
}

export type UpdateRoomConfigParams = {
  roomId: number;
  hostUserId: number;
  config: unknown;
};

/**
 * Replaces the host-configurable race settings (CONF-01..12). Host-only
 * (SEC-01); the incoming value is parsed with the Zod schema from
 * `src/lib/room-config.ts`, which throws a `ZodError` on any invalid field —
 * callers map that to a typed validation result.
 */
export async function updateRoomConfig(params: UpdateRoomConfigParams): Promise<void> {
  assertPositiveInteger(params.roomId, 'roomId');
  assertPositiveInteger(params.hostUserId, 'hostUserId');

  const config = parseRoomConfig(params.config);

  await db.transaction(async (tx) => {
    const [room] = await tx
      .select({ id: rooms.id, hostUserId: rooms.hostUserId })
      .from(rooms)
      .where(eq(rooms.id, params.roomId))
      .for('update');

    if (!room) {
      throw new RoomNotFoundError(`internal id ${params.roomId}`);
    }
    if (room.hostUserId !== params.hostUserId) {
      throw new NotRoomHostError();
    }

    await tx
      .update(rooms)
      .set({ config, updatedAt: new Date() })
      .where(eq(rooms.id, params.roomId));
  });
}

/**
 * Moves a room to a race phase (COURSE-01). The status goes through the
 * shared room-status ↔ race-phase mapping (`roomStatusForPhase`), so an
 * unchecked string can never reach the database. Called by the race engine
 * on every phase change: `decompte` at start, `en_course` at the countdown
 * end, `resultats` at the finish, `en_attente` on abort/relaunch.
 */
export async function setRoomStatus(roomId: number, status: string): Promise<void> {
  assertPositiveInteger(roomId, 'roomId');
  const phase = roomStatusForPhase(status);

  await db
    .update(rooms)
    .set({ status: phase, updatedAt: new Date() })
    .where(eq(rooms.id, roomId));
}

/**
 * Loads the join-relevant state of a room for the realtime layer (SP-1B):
 * the room row plus its present members with display names. Server-only —
 * contains internal ids; see {@link RoomJoinState}.
 */
export async function getRoomForJoin(roomId: number): Promise<RoomJoinState | null> {
  assertPositiveInteger(roomId, 'roomId');

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!room) {
    return null;
  }

  // Host public identity: the snapshot carries it so clients can render the
  // host and handover can be announced without leaking the internal id.
  const [host] = await db
    .select({ publicId: users.publicId, username: users.username })
    .from(users)
    .where(eq(users.id, room.hostUserId))
    .limit(1);
  if (!host) {
    throw new Error(`host user ${room.hostUserId} of room ${room.id} does not exist`);
  }

  const members = await db
    .select({
      memberId: roomMembers.id,
      role: roomMembers.role,
      userId: roomMembers.userId,
      guestToken: roomMembers.guestToken,
      userPublicId: users.publicId,
      username: users.username,
      pfpUrl: users.pfpUrl,
      joinedAt: roomMembers.joinedAt,
    })
    .from(roomMembers)
    .leftJoin(users, eq(roomMembers.userId, users.id))
    .where(and(eq(roomMembers.roomId, roomId), isNull(roomMembers.leftAt)));

  return {
    roomId: room.id,
    publicId: room.publicId,
    code: room.code,
    visibility: room.visibility,
    status: room.status,
    capacity: room.capacity,
    config: room.config,
    createdAt: room.createdAt,
    hostUserId: room.hostUserId,
    hostPublicId: host.publicId,
    hostName: host.username,
    members,
  };
}
