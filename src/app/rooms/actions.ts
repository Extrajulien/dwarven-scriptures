'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createInvitationLinks as createInvitationLinksQuery } from '../../db/queries/invitations';
import {
  AlreadyInRoomError,
  closeRoom as closeRoomQuery,
  createRoom as createRoomQuery,
  findHostSuccessorForRoom,
  getActiveMemberId,
  getActiveRoomOfIdentity,
  getRoomByCode,
  getRoomInternalByPublicId,
  InvalidRoomInputError,
  joinRoom as joinRoomQuery,
  kickMember as kickMemberQuery,
  listPublicRooms,
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
import { rankQuickPlayRooms } from '../../lib/quickplay';
import { getUserFullProfile, getUserPublicInfoById } from '../../db/queries/users';
import {
  publishConfigUpdated,
  publishHostChanged,
  publishMemberKicked,
  publishMemberLeft,
  publishRoomClosed,
} from '../../realtime/events';
import {
  createGuestSession,
  getGuestSession,
  InvalidGuestNicknameError,
} from '../../lib/guest-session';
import {
  createRoomActionSchema,
  createRoomFormDataSchema,
  generateInvitationLinksActionSchema,
  joinRoomByCodeActionSchema,
  kickMemberActionSchema,
  roomActionSchema,
  roomPublicIdSchema,
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
  | JoinRoomByCodeFailure
  | (ActionSuccess & {
      room: {
        publicId: string;
        code: string;
        status: string;
        role: string;
        joinedAt: Date;
      };
    });

/**
 * JOIN-01/SALLE-06: when the join fails with `alreadyInRoom`, the result also
 * carries the public identity of the room the person is currently in, so the
 * UI can offer "view your current room" and "leave it and join this one".
 */
export type JoinRoomByCodeFailure = ActionFailure & {
  currentRoom?: { publicId: string; code: string } | null;
};

export type SetGuestNicknameActionResult =
  | ActionFailure
  | (ActionSuccess & { guest: { guestId: string; nickname: string } });

export type GenerateInvitationLinksActionResult =
  | ActionFailure
  | (ActionSuccess & { tokens: string[] });

export type SimpleActionResult = ActionFailure | ActionSuccess;

/** The acting person: a logged-in user, a guest, or nobody. */
type Actor =
  | { kind: 'user'; internalUserId: number; publicId: string; username: string }
  | { kind: 'guest'; guestToken: string; guestId: string; nickname: string }
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
      return {
        kind: 'user',
        internalUserId: profile.id,
        publicId: session.publicId,
        username: profile.username,
      };
    }
    return { kind: 'none' };
  }

  const guest = await getGuestSession();
  if (guest) {
    return {
      kind: 'guest',
      guestToken: guest.guestId,
      guestId: guest.guestId,
      nickname: guest.nickname,
    };
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

  let actor: Actor = { kind: 'none' };
  try {
    actor = await resolveActor();
    if (actor.kind === 'none') {
      return { ok: false, error: 'identityRequired' };
    }

    const room = await getRoomByCode(parsed.data.code);
    if (!room) {
      return { ok: false, error: 'roomNotFound' };
    }

    // SALLE-03/04: a code alone never admits to a private room, and the
    // answer stays 'roomNotFound' so the code's validity is not leaked.
    if (room.visibility === 'private') {
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
      // SALLE-06: the person is already an active member of this room.
      // Include the current room's public identity so the UI can offer
      // "view your current room" and "leave it and join this one".
      let currentRoom: { publicId: string; code: string } | null = null;
      if (actor.kind !== 'none') {
        currentRoom = await getActiveRoomOfIdentity(
          actor.kind === 'user'
            ? { userId: actor.internalUserId }
            : { guestToken: actor.guestToken },
        );
      }
      return { ok: false, error: 'alreadyInRoom', currentRoom };
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

    // CONF-12: everyone present sees the configuration change immediately.
    publishConfigUpdated(room.roomId, parsed.data.config);

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
    publishRoomClosed(room.roomId);
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
    let targetInternalUserId: number | null = null;
    if (parsed.data.targetUserId !== undefined) {
      const target = await getUserFullProfile({ publicId: parsed.data.targetUserId });
      if (target) {
        targetInternalUserId = target.id;
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

    // SALLE-07: evict the kicked member's socket and notify the room.
    publishMemberKicked(
      room.roomId,
      targetInternalUserId !== null
        ? { userId: targetInternalUserId }
        : { guestToken: parsed.data.targetGuestToken as string },
    );

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
    publishHostChanged(room.roomId, {
      publicId: target.publicId,
      username: target.username,
    });
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
    publishMemberLeft(
      room.id,
      actor.kind === 'user'
        ? { userId: actor.internalUserId }
        : { guestToken: actor.guestToken },
    );

    if (actor.kind === 'user' && room.hostUserId === actor.internalUserId) {
      const successor = await findHostSuccessorForRoom(room.id);
      if (successor && successor.userId !== null) {
        await transferHostQuery(room.id, successor.userId);
        const nextHost = await getUserPublicInfoById(successor.userId);
        if (nextHost) {
          publishHostChanged(room.id, nextHost);
        }
      } else {
        await closeRoomQuery({ roomId: room.id, hostUserId: actor.internalUserId });
        publishRoomClosed(room.id);
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

/**
 * JOIN-03 "Faire une course": joins the joinable public room closest to its
 * capacity (oldest room wins ties) and redirects to it. With no joinable
 * room, signed-in users are sent to the create entry point on the home page
 * and guests to the guest empty state. A guest who has not picked a nickname
 * yet is redirected to the chosen room first — the lobby collects the name
 * (AUTH-02) and then joins by code (public rooms admit direct access).
 *
 * The redirect never returns to the caller: `redirect()` throws. Candidate
 * ranking is the pure `rankQuickPlayRooms` function (unit-tested separately);
 * this action only maps identity and race-lost joins.
 */
export async function quickPlay(): Promise<never> {
  try {
    const actor = await resolveActor();
    const rooms = await listPublicRooms();
    const candidates = rankQuickPlayRooms(rooms);

    if (candidates.length === 0) {
      redirect(actor.kind === 'user' ? '/?notice=noRooms' : '/?notice=noRoomsGuest');
    }

    if (actor.kind === 'none') {
      // Nickname first (AUTH-02): the room page shows the dwarf-name form,
      // then joins by code.
      const best = candidates[0];
      redirect(`/rooms/${best.publicId}?quickplay=1`);
    }

    for (const candidate of candidates) {
      try {
        const room = await getRoomInternalByPublicId(candidate.publicId);
        if (!room) {
          continue;
        }
        await joinRoomQuery({
          roomId: room.id,
          role: 'participant',
          userId: actor.kind === 'user' ? actor.internalUserId : null,
          guestToken: actor.kind === 'guest' ? actor.guestToken : null,
        });
        redirect(`/rooms/${candidate.publicId}`);
      } catch (error) {
        if (error instanceof AlreadyInRoomError) {
          // Already a member of this room (second attempt): go there.
          redirect(`/rooms/${candidate.publicId}`);
        }
        if (error instanceof RoomFullError || error instanceof RoomNotJoinableError) {
          // The room filled up or started between listing and joining:
          // try the next candidate.
          continue;
        }
        if (error instanceof RoomMemberKickedError || error instanceof RoomNotFoundError) {
          continue;
        }
        throw error;
      }
    }

    // Every candidate failed admission between listing and joining.
    redirect(actor.kind === 'user' ? '/?notice=noRooms' : '/?notice=noRoomsGuest');
  } catch (error) {
    // `redirect` throws by design; anything else is a real failure.
    if (isRedirectError(error)) {
      throw error;
    }
    console.error('quickPlay: unexpected failure', error);
    redirect('/?notice=noRooms');
  }
}

/** True for the control-flow error `next/navigation`'s redirect() throws. */
function isRedirectError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    (error as { digest?: unknown }).digest !== undefined &&
    String((error as { digest?: unknown }).digest).startsWith('NEXT_REDIRECT')
  );
}

/** Result of the join-by-code home form (JOIN-01). */
export type JoinByCodeFormResult =
  | { ok: true; roomPublicId: string }
  | { ok: false; error: RoomActionError; currentRoom: { publicId: string; code: string } | null };

/** Result of the home create-room form (SALLE-01/05). */
export type CreateRoomFormResult =
  | { ok: true; roomPublicId: string }
  | { ok: false; error: RoomActionError };

/**
 * Form-action wrapper for the home create-room card (SALLE-01/05, AUTH-03):
 * reads `FormData` (progressive enhancement), validates it with the same
 * 2–30 capacity bounds as `createRoom`, and forwards the typed result. The
 * underlying action still refuses guests server-side (AUTH-03) — this
 * wrapper adds no privilege.
 */
export async function createRoomFormAction(
  _previous: CreateRoomFormResult | null,
  formData: FormData,
): Promise<CreateRoomFormResult> {
  const parsed = createRoomFormDataSchema.safeParse({
    visibility: formData.get('visibility'),
    capacity: formData.get('capacity'),
    hostRole: formData.get('hostRole'),
  });
  if (!parsed.success) {
    return { ok: false, error: 'invalidInput' };
  }

  const result = await createRoom({
    visibility: parsed.data.visibility,
    capacity: parsed.data.capacity,
    hostRole: parsed.data.hostRole,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, roomPublicId: result.room.publicId };
}

/**
 * Form-action wrapper for the home join-by-code form (JOIN-01). Accepts
 * `FormData` so it works with progressive enhancement; a guest who has not
 * picked a nickname yet submits it along with the code and the signed guest
 * cookie is written first (AUTH-02). Never throws — the UI maps the typed
 * result.
 */
export async function joinByCodeFormAction(
  _previous: JoinByCodeFormResult | null,
  formData: FormData,
): Promise<JoinByCodeFormResult> {
  const codeValue = formData.get('code');
  const nicknameValue = formData.get('nickname');

  const parsedCode = joinRoomByCodeActionSchema.safeParse({ code: codeValue });
  if (!parsedCode.success) {
    return { ok: false, error: 'invalidInput', currentRoom: null };
  }

  if (typeof nicknameValue === 'string' && nicknameValue.trim().length > 0) {
    const guest = await setGuestNickname({ nickname: nicknameValue });
    if (!guest.ok) {
      return {
        ok: false,
        error: guest.error === 'invalidNickname' ? 'invalidNickname' : 'unexpected',
        currentRoom: null,
      };
    }
  }

  const result = await joinRoomByCode({ code: parsedCode.data.code });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      currentRoom: result.currentRoom ?? null,
    };
  }
  return { ok: true, roomPublicId: result.room.publicId };
}

/**
 * SALLE-06 leave-and-join: the person is told they are already in a room,
 * and the UI offers "leave my current room and join this one". This wrapper
 * leaves the current room (host handover included, SALLE-08) and then joins
 * the requested code in one submission.
 */
export async function leaveAndJoinFormAction(
  _previous: JoinByCodeFormResult | null,
  formData: FormData,
): Promise<JoinByCodeFormResult> {
  const codeValue = formData.get('code');
  const currentRoomPublicIdValue = formData.get('currentRoomPublicId');

  const parsedCode = joinRoomByCodeActionSchema.safeParse({ code: codeValue });
  if (!parsedCode.success) {
    return { ok: false, error: 'invalidInput', currentRoom: null };
  }

  const currentRoom = roomPublicIdSchema.safeParse(currentRoomPublicIdValue);
  if (currentRoom.success) {
    const left = await leaveRoom({ roomPublicId: currentRoom.data });
    if (!left.ok) {
      return { ok: false, error: left.error, currentRoom: null };
    }
  }

  const result = await joinRoomByCode({ code: parsedCode.data.code });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      currentRoom: result.currentRoom ?? null,
    };
  }
  return { ok: true, roomPublicId: result.room.publicId };
}
