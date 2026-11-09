import { isNull } from 'drizzle-orm';
import { db } from '../db';
import { roomMembers } from '../db/schema';
import {
  AlreadyInRoomError,
  closeRoom as closeRoomQuery,
  findHostSuccessorForRoom,
  getActiveMemberId,
  getRoomByCode,
  getRoomForJoin as getRoomForJoinQuery,
  InvalidRoomInputError,
  joinRoom as joinRoomQuery,
  markMemberLeft,
  RoomFullError,
  RoomMemberKickedError,
  RoomNotFoundError,
  RoomNotJoinableError,
  transferHost as transferHostQuery,
  type RoomJoinState,
} from '../db/queries/rooms';
import {
  consumeInvitationToken,
  getBoundMemberIdentity,
  getInvitationByToken,
  InvitationBoundToOtherError,
  InvitationNotFoundError,
  InvitationRevokedError,
} from '../db/queries/invitations';
import { getUserPublicInfoById } from '../db/queries/users';
import type {
  HubIdentity,
  HubRoomMember,
  HubRoomState,
  LeaveOutcome,
  RoomStore,
  RoomStoreJoinInput,
  RoomStoreJoinResult,
} from './hub';
import type { RoomStatus, WsErrorCode } from './protocol';

/**
 * PostgreSQL-backed {@link RoomStore} for the realtime hub: adapts the room
 * queries (which share their admission rules with the server actions) to the
 * hub's seam. Domain errors are mapped to the wire error codes of
 * `src/realtime/protocol.ts`:
 *
 * - `RoomFullError` → `room_full` (SALLE-05)
 * - `RoomMemberKickedError` → `kicked` (SALLE-07)
 * - `RoomNotFoundError`, `RoomNotJoinableError` (SALLE-09) and unknown or
 *   private rooms (SALLE-03: the answer never reveals a code's validity) →
 *   `room_not_found`
 * - an **active member reconnecting** — whatever the room's current status
 *   (COURSE-08: the engine may hold their slot mid-race, while SALLE-09
 *   blocks fresh joins) — reports `rejoin: true`: the membership itself is
 *   the credential, no new membership is created.
 * - anything else → `invalid_input` (logged, never leaked).
 */

function identityFields(identity: HubIdentity): { userId: number | null; guestToken: string | null } {
  return identity.kind === 'user'
    ? { userId: identity.userId, guestToken: null }
    : { userId: null, guestToken: identity.guestToken };
}

function samePerson(
  a: { userId: number | null; guestToken: string | null },
  b: HubIdentity,
): boolean {
  if (a.userId !== null) {
    return b.kind === 'user' && a.userId === b.userId;
  }
  return b.kind === 'guest' && a.guestToken === b.guestToken;
}

function mapJoinError(error: unknown): WsErrorCode {
  if (error instanceof RoomFullError) {
    return 'room_full';
  }
  if (error instanceof RoomMemberKickedError) {
    return 'kicked';
  }
  if (
    error instanceof RoomNotFoundError ||
    error instanceof RoomNotJoinableError ||
    error instanceof InvitationNotFoundError ||
    error instanceof InvitationRevokedError ||
    error instanceof InvitationBoundToOtherError
  ) {
    return 'room_not_found';
  }
  if (error instanceof InvalidRoomInputError) {
    return 'invalid_input';
  }
  console.error('realtime: unexpected join failure', error);
  return 'invalid_input';
}

function adaptMember(row: RoomJoinState['members'][number]): HubRoomMember {
  return {
    role: row.role,
    userId: row.userId,
    guestToken: row.guestToken,
    userPublicId: row.userPublicId,
    username: row.username,
    pfpUrl: row.pfpUrl,
    joinedAt: row.joinedAt,
  };
}

function adaptRoomState(state: RoomJoinState): HubRoomState {
  return {
    roomId: state.roomId,
    publicId: state.publicId,
    code: state.code,
    visibility: state.visibility as HubRoomState['visibility'],
    status: state.status as RoomStatus,
    capacity: state.capacity,
    config: state.config,
    hostUserId: state.hostUserId,
    hostPublicId: state.hostPublicId,
    hostName: state.hostName,
    createdAt: state.createdAt,
    members: state.members.map(adaptMember),
  };
}

export class PostgresRoomStore implements RoomStore {
  async joinRoom(input: RoomStoreJoinInput): Promise<RoomStoreJoinResult> {
    const target = input.target;
    if ('code' in target) {
      return this.joinByCode(input, target.code);
    }
    return this.joinByToken(input, target.invitationToken);
  }

  /**
   * Admission by 6-character code (SALLE-02/03/05/06/07/09). The same query
   * as the `joinRoomByCode` server action, so action and realtime joins can
   * never disagree; the role is always `participant` (spectators join through
   * the action, Phase 1).
   *
   * SALLE-03/04: a code alone never admits to a private room — the answer
   * stays `room_not_found` whether or not the code is real. An *active
   * member* reconnecting a private room is not a join: their membership is
   * the credential (SALLE-06 guarantees one active room per person), so the
   * hub only re-attaches the connection.
   */
  private async joinByCode(
    input: RoomStoreJoinInput,
    code: string,
  ): Promise<RoomStoreJoinResult> {
    const room = await getRoomByCode(code);
    if (!room) {
      return { ok: false, error: 'room_not_found' };
    }

    // COURSE-08/SALLE-03/04: an *active member* reconnecting is not a join —
    // their membership is the credential (the engine may have kept their
    // slot mid-race, and SALLE-09 blocks fresh joins during a race). This
    // check runs before admission, so a reconnect works whatever the
    // room's current status is.
    const memberId = await getActiveMemberId(room.id, identityFields(input.identity));
    if (memberId !== null) {
      return { ok: true, roomId: room.id, rejoin: true };
    }

    if (room.visibility === 'private') {
      return { ok: false, error: 'room_not_found' };
    }

    try {
      await joinRoomQuery({ roomId: room.id, role: 'participant', ...identityFields(input.identity) });
      return { ok: true, roomId: room.id, rejoin: false };
    } catch (error) {
      if (error instanceof AlreadyInRoomError) {
        return { ok: true, roomId: room.id, rejoin: true };
      }
      return { ok: false, error: mapJoinError(error) };
    }
  }

  /**
   * Admission by invitation token (SALLE-04). A used link bound to someone
   * else is refused *before* the membership is created (the pre-check reads
   * the bound identity), so the refusal never has to roll a join back; the
   * `consumeInvitationToken` transaction remains the authoritative check.
   */
  private async joinByToken(
    input: RoomStoreJoinInput,
    invitationToken: string,
  ): Promise<RoomStoreJoinResult> {
    const link = await getInvitationByToken(invitationToken);
    if (!link || link.status === 'revoked') {
      return { ok: false, error: 'room_not_found' };
    }

    // COURSE-08: an active member reconnecting mid-race is not a join
    // (same rule as `joinByCode`; SALLE-09 blocks fresh joins in flight).
    const activeMemberId = await getActiveMemberId(link.roomId, identityFields(input.identity));
    if (activeMemberId !== null) {
      return { ok: true, roomId: link.roomId, rejoin: true };
    }

    if (link.status === 'used') {
      if (link.boundMemberId === null) {
        return { ok: false, error: 'room_not_found' };
      }
      const bound = await getBoundMemberIdentity(link.boundMemberId);
      if (!bound || !samePerson(bound, input.identity)) {
        return { ok: false, error: 'room_not_found' };
      }
    }

    try {
      const joined = await joinRoomQuery({
        roomId: link.roomId,
        role: 'participant',
        ...identityFields(input.identity),
      });

      try {
        await consumeInvitationToken({
          token: link.token,
          memberId: joined.memberId,
          ip: input.ip,
        });
      } catch (error) {
        if (
          error instanceof InvitationBoundToOtherError ||
          error instanceof InvitationRevokedError ||
          error instanceof InvitationNotFoundError
        ) {
          // Defensive rollback: the pre-check above makes this near-impossible.
          await markMemberLeft(joined.memberId);
          return { ok: false, error: 'room_not_found' };
        }
        throw error;
      }

      return { ok: true, roomId: link.roomId, rejoin: false };
    } catch (error) {
      if (error instanceof AlreadyInRoomError) {
        return { ok: true, roomId: link.roomId, rejoin: true };
      }
      return { ok: false, error: mapJoinError(error) };
    }
  }

  /**
   * Applies a departure with the SALLE-08 host rule, exactly like the
   * `leaveRoom` server action: the membership is marked left; when the
   * departing member was the host, the role passes to the human member
   * present the longest, or the room is closed when nobody is left to host.
   */
  async leaveRoom(input: { roomId: number; identity: HubIdentity }): Promise<LeaveOutcome> {
    const memberId = await getActiveMemberId(input.roomId, input.identity);
    if (memberId === null) {
      return { left: false, hostChangedTo: null, roomClosed: false };
    }

    await markMemberLeft(memberId);

    const state = await getRoomForJoinQuery(input.roomId);
    if (!state) {
      return { left: true, hostChangedTo: null, roomClosed: false };
    }
    if (input.identity.kind !== 'user' || state.hostUserId !== input.identity.userId) {
      return { left: true, hostChangedTo: null, roomClosed: false };
    }

    const successor = await findHostSuccessorForRoom(input.roomId);
    if (successor && successor.userId !== null) {
      await transferHostQuery(input.roomId, successor.userId);
      const host = await getUserPublicInfoById(successor.userId);
      return { left: true, hostChangedTo: host, roomClosed: false };
    }

    await closeRoomQuery({ roomId: input.roomId, hostUserId: input.identity.userId });
    return { left: true, hostChangedTo: null, roomClosed: true };
  }

  async getRoomForJoin(roomId: number): Promise<HubRoomState | null> {
    const state = await getRoomForJoinQuery(roomId);
    return state ? adaptRoomState(state) : null;
  }

  /** One statement: every present membership ends (graceful shutdown). */
  async markAllMembersLeft(): Promise<void> {
    await db.update(roomMembers).set({ leftAt: new Date() }).where(isNull(roomMembers.leftAt));
  }
}
