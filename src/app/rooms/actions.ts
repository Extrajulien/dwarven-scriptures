'use server';

import { headers } from 'next/headers';
import { createInvitationLinks as createInvitationLinksQuery } from '../../db/queries/invitations';
import {
  AlreadyInRoomError,
  closeRoom as closeRoomQuery,
  createRoom as createRoomQuery,
  findHostSuccessorForRoom,
  getActiveMemberId,
  getRoomByCode,
  getRoomInternalByPublicId,
  InvalidRoomInputError,
  joinRoom as joinRoomQuery,
  kickMember as kickMemberQuery,
  markMemberLeft,
  NotHostCandidateError,
  NotRoomHostError,
  RoomFullError,
  RoomMemberKickedError,
  RoomMemberNotFoundError,
  RoomNotFoundError,
  RoomNotJoinableError,
  transferHost as transferHostQuery,
  updateRoomConfig as updateRoomConfigQuery,
  type PublicRoom,
} from '../../db/queries/rooms';
import { getUserFullProfile } from '../../db/queries/users';
import {
  createGuestSession,
  getGuestSession,
  InvalidGuestNicknameError,
} from '../../lib/guest-session';
import {
  createRoomActionSchema,
  generateInvitationLinksActionSchema,
  joinRoomByCodeActionSchema,
  kickMemberActionSchema,
  roomActionSchema,
  setGuestNicknameActionSchema,
  transferHostActionSchema,
  updateRoomConfigActionSchema,
  type CreateRoomActionInput,
  type GenerateInvitationLinksActionInput,
  type JoinRoomByCodeActionInput,
  type KickMemberActionInput,
  type RoomActionInput,
  type SetGuestNicknameActionInput,
  type TransferHostActionInput,
  type UpdateRoomConfigActionInput,
} from '../../lib/room-action-validation';
import { RateLimitExceededError, roomCodeJoinLimiter } from '../../lib/rate-limit';
import { getSession } from '../../lib/session';

/**
 * Server actions for rooms (SEC-01, TECH-07).
 *
 * Every action follows the same discipline:
 *
 * 1. inputs are parsed with the Zod schemas in
 *    `src/lib/room-action-validation.ts` (strict — unknown keys are rejected);
 * 2. identity comes from the server-side session (`session` cookie) or the
 *    signed guest cookie — never from the client;
 * 3. authorization is re-verified server-side (host-only operations compare
 *    against `rooms.hostUserId` inside the queries);
 * 4. every failure maps to a typed `{ ok: false, error }` result — an action
 *    never throws to the client.
 *
 * The realtime join itself (WebSocket presence) arrives in a later unit;
 * `joinRoomByCode` here covers the admission decision and the queries expose
 * `getRoomForJoin` so the future ws layer reuses the same path.
 */

export type RoomActionError =
  | 'authRequired'
  | 'unexpected'
  | 'invalidInput'
  | 'invalidConfig'
  | 'invalidNickname'
  | 'identityRequired'
  | 'rateLimited'
  | 'notHost'
  | 'roomNotFound'
  | 'roomNotJoinable'
  | 'roomFull'
  | 'kicked'
  | 'alreadyInRoom'
  | 'targetNotFound'
  | 'notHostCandidate';

export type ActionFailure = { ok: false; error: RoomActionError };
export type ActionSuccess = { ok: true };

export type CreateRoomActionResult =
  | ActionFailure
  | (ActionSuccess & { room: PublicRoom });

export type JoinRoomByCodeActionResult =
  | ActionFailure
  | (ActionSuccess & {
      room: {
        publicId: string;
        code: string;
        status: string;
        role: string;
        joinedAt: Date;
      };
    });

export type SetGuestNicknameActionResult =
  | ActionFailure
  | (ActionSuccess & { guest: { guestId: string; nickname: string } });

export type GenerateInvitationLinksActionResult =
  | ActionFailure
  | (ActionSuccess & { tokens: string[] });

export type SimpleActionResult = ActionFailure | ActionSuccess;

/** The acting person: a logged-in user, a guest, or nobody. */
type Actor =
  | { kind: 'user'; internalUserId: number; publicId: string }
  | { kind: 'guest'; guestToken: string; guestId: string }
  | { kind: 'none' };

/**
 * Resolves the acting person from the signed cookies. The session is trusted
 * (HMAC-verified); the profile lookup translates the public id into the
 * internal id the queries need.
 */
async function resolveActor(): Promise<Actor> {
  const session = await getSession();
  if (session) {
    const profile = await getUserFullProfile({ publicId: session.publicId });
    if (profile) {
      return { kind: 'user', internalUserId: profile.id, publicId: session.publicId };
    }
    return { kind: 'none' };
  }

  const guest = await getGuestSession();
  if (guest) {
    return { kind: 'guest', guestToken: guest.guestId, guestId: guest.guestId };
  }

  return { kind: 'none' };
}

/** The client IP for rate limiting, from the trusted proxy header. */
async function clientIp(): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get('x-forwarded-for');
  if (!forwarded) {
    return 'local';
  }
  const first = forwarded.split(',')[0]?.trim() ?? '';
  return first.length > 0 && first.length <= 45 ? first : 'local';
}

function isZodValidationError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    (error as { name?: unknown }).name === 'ZodError'
  );
}

/**
 * Creates a room and its host membership (SALLE-01). Logged-in users only
 * (AUTH-03): a guest can never host. The config, when provided, is validated
 * by the same Zod schema the query re-applies before storing.
 */
export async function createRoom(input: CreateRoomActionInput): Promise<CreateRoomActionResult> {
  const parsed = createRoomActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalidInput' };
  }

  try {
    const actor = await resolveActor();
    if (actor.kind !== 'user') {
      return { ok: false, error: 'authRequired' };
    }

    const room = await createRoomQuery({
      hostUserId: actor.internalUserId,
      visibility: parsed.data.visibility,
      capacity: parsed.data.capacity,
      hostRole: parsed.data.hostRole,
      config: parsed.data.config,
    });

    return { ok: true, room };
  } catch (error) {
    if (isZodValidationError(error)) {
      return { ok: false, error: 'invalidConfig' };
    }
    if (error instanceof AlreadyInRoomError) {
      return { ok: false, error: 'alreadyInRoom' };
    }
    console.error('createRoom: unexpected failure', error);
    return { ok: false, error: 'unexpected' };
  }
}

/**
 * Joins a room by its 6-character code (SALLE-02/09/10, JOIN-01). Works for
 * logged-in users and guests; the attempt is rate-limited per IP. Admission
 * (status, capacity, kick history, one-active-room) is enforced inside
 * `joinRoom` under a room lock — this action only maps the outcomes.
 */
export async function joinRoomByCode(
  input: JoinRoomByCodeActionInput,
): Promise<JoinRoomByCodeActionResult> {
  const parsed = joinRoomByCodeActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalidInput' };
  }

  const ip = await clientIp();
  try {
    roomCodeJoinLimiter.check(ip);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return { ok: false, error: 'rateLimited' };
    }
    console.error('joinRoomByCode: rate limiter failed', error);
    return { ok: false, error: 'unexpected' };
  }

  try {
    const actor = await resolveActor();
    if (actor.kind === 'none') {
      return { ok: false, error: 'identityRequired' };
    }

    const room = await getRoomByCode(parsed.data.code);
    if (!room) {
      return { ok: false, error: 'roomNotFound' };
    }

    const joined = await joinRoomQuery({
      roomId: room.id,
      role: parsed.data.role ?? 'participant',
      userId: actor.kind === 'user' ? actor.internalUserId : null,
      guestToken: actor.kind === 'guest' ? actor.guestToken : null,
    });

    // A correct code is proven knowledge: the successful attempt earns a
    // fresh window for honest typos afterwards.
    roomCodeJoinLimiter.reset(ip);

    return {
      ok: true,
      room: {
        publicId: joined.roomPublicId,
        code: room.code,
        status: room.status,
        role: joined.role,
        joinedAt: joined.joinedAt,
      },
    };
  } catch (error) {
    if (error instanceof RoomNotFoundError) {
      return { ok: false, error: 'roomNotFound' };
    }
    if (error instanceof RoomNotJoinableError) {
      return { ok: false, error: 'roomNotJoinable' };
    }
    if (error instanceof RoomFullError) {
      return { ok: false, error: 'roomFull' };
    }
    if (error instanceof RoomMemberKickedError) {
      return { ok: false, error: 'kicked' };
    }
    if (error instanceof AlreadyInRoomError) {
      return { ok: false, error: 'alreadyInRoom' };
    }
    if (error instanceof InvalidRoomInputError) {
      return { ok: false, error: 'invalidInput' };
    }
    console.error('joinRoomByCode: unexpected failure', error);
    return { ok: false, error: 'unexpected' };
  }
}

/** Resolves a room id for the host-only actions, checking the caller is the host. */
async function requireHostRoom(
  actor: Actor,
  roomPublicId: string,
): Promise<{ roomId: number; hostUserId: number } | { error: RoomActionError }> {
  if (actor.kind !== 'user') {
    return { error: 'authRequired' };
  }

  const room = await getRoomInternalByPublicId(roomPublicId);
  if (!room) {
    return { error: 'roomNotFound' };
  }
  if (room.hostUserId !== actor.internalUserId) {
    return { error: 'notHost' };
  }

  return { roomId: room.id, hostUserId: actor.internalUserId };
}

/** Updates the host-configurable race settings (CONF-01..12, SEC-01). */
export async function updateRoomConfig(
  input: UpdateRoomConfigActionInput,
): Promise<SimpleActionResult> {
  const parsed = updateRoomConfigActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalidInput' };
  }

  try {
    const actor = await resolveActor();
    const room = await requireHostRoom(actor, parsed.data.roomPublicId);
    if ('error' in room) {
      return { ok: false, error: room.error };
    }

    await updateRoomConfigQuery({
      roomId: room.roomId,
      hostUserId: room.hostUserId,
      config: parsed.data.config,
    });

    return { ok: true };
  } catch (error) {
    if (isZodValidationError(error)) {
      return { ok: false, error: 'invalidConfig' };
    }
    console.error('updateRoomConfig: unexpected failure', error);
    return { ok: false, error: 'unexpected' };
  }
}

/** Closes the room (SALLE-04, COURSE-01, SEC-01). */
export async function closeRoom(input: RoomActionInput): Promise<SimpleActionResult> {
  const parsed = roomActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalidInput' };
  }

  try {
    const actor = await resolveActor();
    const room = await requireHostRoom(actor, parsed.data.roomPublicId);
    if ('error' in room) {
      return { ok: false, error: room.error };
    }

    await closeRoomQuery({ roomId: room.roomId, hostUserId: room.hostUserId });
    return { ok: true };
  } catch (error) {
    console.error('closeRoom: unexpected failure', error);
    return { ok: false, error: 'unexpected' };
  }
}

/**
 * Kicks a participant or spectator (SALLE-04/07, SEC-01). The target is
 * identified by its public identity (user publicId or guest token) — the
 * internal membership id is resolved server-side and never accepted from the
 * client.
 */
export async function kickMember(input: KickMemberActionInput): Promise<SimpleActionResult> {
  const parsed = kickMemberActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalidInput' };
  }

  try {
    const actor = await resolveActor();
    const room = await requireHostRoom(actor, parsed.data.roomPublicId);
    if ('error' in room) {
      return { ok: false, error: room.error };
    }

    let targetId: number | null = null;
    if (parsed.data.targetUserId !== undefined) {
      const target = await getUserFullProfile({ publicId: parsed.data.targetUserId });
      if (target) {
        targetId = await getActiveMemberId(room.roomId, { userId: target.id });
      }
    } else if (parsed.data.targetGuestToken !== undefined) {
      targetId = await getActiveMemberId(room.roomId, {
        guestToken: parsed.data.targetGuestToken,
      });
    }

    if (targetId === null) {
      return { ok: false, error: 'targetNotFound' };
    }

    await kickMemberQuery({
      roomId: room.roomId,
      hostUserId: room.hostUserId,
      targetMemberId: targetId,
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof RoomMemberNotFoundError || error instanceof InvalidRoomInputError) {
      return { ok: false, error: 'targetNotFound' };
    }
    if (error instanceof NotRoomHostError) {
      return { ok: false, error: 'notHost' };
    }
    console.error('kickMember: unexpected failure', error);
    return { ok: false, error: 'unexpected' };
  }
}

/** Hands the host role to another human member (SALLE-08, SEC-01). */
export async function transferHost(input: TransferHostActionInput): Promise<SimpleActionResult> {
  const parsed = transferHostActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalidInput' };
  }

  try {
    const actor = await resolveActor();
    const room = await requireHostRoom(actor, parsed.data.roomPublicId);
    if ('error' in room) {
      return { ok: false, error: room.error };
    }

    const target = await getUserFullProfile({ publicId: parsed.data.targetUserId });
    if (!target) {
      return { ok: false, error: 'targetNotFound' };
    }

    await transferHostQuery(room.roomId, target.id);
    return { ok: true };
  } catch (error) {
    if (error instanceof NotHostCandidateError) {
      return { ok: false, error: 'notHostCandidate' };
    }
    if (error instanceof NotRoomHostError) {
      return { ok: false, error: 'notHost' };
    }
    console.error('transferHost: unexpected failure', error);
    return { ok: false, error: 'unexpected' };
  }
}

/**
 * Leaves a room. When the departing member is the host, SALLE-08 applies
 * automatically: the role passes to the human member present the longest, or
 * the room closes when nobody is left to host it.
 */
export async function leaveRoom(input: RoomActionInput): Promise<SimpleActionResult> {
  const parsed = roomActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalidInput' };
  }

  try {
    const actor = await resolveActor();
    if (actor.kind === 'none') {
      return { ok: false, error: 'identityRequired' };
    }

    const room = await getRoomInternalByPublicId(parsed.data.roomPublicId);
    if (!room) {
      return { ok: false, error: 'roomNotFound' };
    }

    const memberId = await getActiveMemberId(room.id, {
      userId: actor.kind === 'user' ? actor.internalUserId : null,
      guestToken: actor.kind === 'guest' ? actor.guestToken : null,
    });
    if (memberId === null) {
      return { ok: false, error: 'targetNotFound' };
    }

    await markMemberLeft(memberId);

    if (actor.kind === 'user' && room.hostUserId === actor.internalUserId) {
      const successor = await findHostSuccessorForRoom(room.id);
      if (successor && successor.userId !== null) {
        await transferHostQuery(room.id, successor.userId);
      } else {
        await closeRoomQuery({ roomId: room.id, hostUserId: actor.internalUserId });
      }
    }

    return { ok: true };
  } catch (error) {
    if (error instanceof InvalidRoomInputError) {
      return { ok: false, error: 'invalidInput' };
    }
    console.error('leaveRoom: unexpected failure', error);
    return { ok: false, error: 'unexpected' };
  }
}

/** Generates invitation links (SALLE-04, SEC-01). */
export async function generateInvitationLinks(
  input: GenerateInvitationLinksActionInput,
): Promise<GenerateInvitationLinksActionResult> {
  const parsed = generateInvitationLinksActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalidInput' };
  }

  try {
    const actor = await resolveActor();
    const room = await requireHostRoom(actor, parsed.data.roomPublicId);
    if ('error' in room) {
      return { ok: false, error: room.error };
    }

    const tokens = await createInvitationLinksQuery({
      roomId: room.roomId,
      hostUserId: room.hostUserId,
      count: parsed.data.count,
    });

    return { ok: true, tokens };
  } catch (error) {
    if (error instanceof NotRoomHostError) {
      return { ok: false, error: 'notHost' };
    }
    if (error instanceof RoomNotFoundError) {
      return { ok: false, error: 'roomNotFound' };
    }
    console.error('generateInvitationLinks: unexpected failure', error);
    return { ok: false, error: 'unexpected' };
  }
}

/**
 * Picks a guest nickname and writes the signed guest cookie server-side
 * (AUTH-02). The nickname is validated by the same exported schema used by
 * `createGuestSession`, which validates once more before writing the cookie.
 */
export async function setGuestNickname(
  input: SetGuestNicknameActionInput,
): Promise<SetGuestNicknameActionResult> {
  const parsed = setGuestNicknameActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalidNickname' };
  }

  try {
    const guest = await createGuestSession(parsed.data.nickname);
    return { ok: true, guest };
  } catch (error) {
    if (error instanceof InvalidGuestNicknameError) {
      return { ok: false, error: 'invalidNickname' };
    }
    console.error('setGuestNickname: unexpected failure', error);
    return { ok: false, error: 'unexpected' };
  }
}
