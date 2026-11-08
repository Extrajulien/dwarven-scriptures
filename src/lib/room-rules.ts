import { ROOM_CODE_ALPHABET } from '../db/schema';

/**
 * Pure business rules for rooms (SALLE-04/07/08/09, SALLE-02 code generation).
 *
 * Everything here is a deterministic function over plain data: no database, no
 * Next.js, no I/O. The queries in `src/db/queries/rooms.ts` apply these rules
 * inside transactions, but the rules themselves stay unit-testable in
 * isolation.
 */

export const ROOM_JOINABLE_STATUSES = ['en_attente', 'resultats'] as const;

export type JoinableRoomStatus = (typeof ROOM_JOINABLE_STATUSES)[number];

export const HOSTABLE_ROLES = ['participant', 'spectator'] as const;

/**
 * SALLE-09: a room accepts new members only while waiting or on the results
 * screen — never during the countdown or a running race.
 */
export function canJoinRoom(status: string): status is JoinableRoomStatus {
  return (ROOM_JOINABLE_STATUSES as readonly string[]).includes(status);
}

/** Shape every rule below needs from a membership row. */
export type PresentMember = {
  role: string;
  userId: number | null;
  guestToken: string | null;
  kicked: boolean;
  leftAt: Date | null;
  joinedAt: Date;
};

/**
 * SALLE-05: capacity counts participants only. Spectators, kicked members and
 * departed members never consume a slot.
 */
export function countPresentParticipants(members: readonly PresentMember[]): number {
  return members.filter(
    (member) => member.role === 'participant' && !member.kicked && member.leftAt === null,
  ).length;
}

/** A room has a free participant slot when fewer participants are present than `capacity`. */
export function roomHasFreeParticipantSlot(
  presentParticipantCount: number,
  capacity: number,
): boolean {
  return presentParticipantCount < capacity;
}

/**
 * SALLE-07: a person kicked from a room can never join it again. The flag
 * survives on the historical membership row (whose `leftAt` is set by the
 * kick), so the join path must check for any kicked row for this person in
 * this room — the presence indexes alone do not block a rejoin.
 */
export function hasKickHistory(memberships: readonly { kicked: boolean }[]): boolean {
  return memberships.some((membership) => membership.kicked);
}

/**
 * SALLE-08: when the host leaves, the role passes to the human member present
 * the longest. "Human member" means a logged-in user (`userId` set) — guests
 * can never host because `rooms.hostUserId` references `users`. Kicked and
 * departed members are excluded, as is the departing host (whose `leftAt` is
 * already set by the time this runs). Returns `null` when nobody is eligible:
 * the room must then be closed.
 */
export function findHostSuccessor(members: readonly PresentMember[]): PresentMember | null {
  const candidates = members.filter(
    (member) =>
      member.userId !== null &&
      !member.kicked &&
      member.leftAt === null &&
      (HOSTABLE_ROLES as readonly string[]).includes(member.role),
  );

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((earliest, member) =>
    member.joinedAt.getTime() < earliest.joinedAt.getTime() ? member : earliest,
  );
}

/**
 * SALLE-04: kicking a member revokes the invitation links bound to them.
 * A revoked link can never be consumed again, even by its bound member.
 */
export function shouldRevokeMemberInvitations(member: { kicked: boolean }): boolean {
  return member.kicked;
}

/**
 * SALLE-04: closing a room revokes every remaining invitation link. The
 * queries apply this to a `fermee` transition; a room already closed has
 * nothing left to revoke.
 */
export function shouldRevokeRoomInvitations(status: string): boolean {
  return status === 'fermee';
}

export const ROOM_CODE_LENGTH = 6;

/**
 * SALLE-02: draws a 6-character room code from the unambiguous alphabet
 * (`ROOM_CODE_ALPHABET`: no 0/O or 1/I/L). The RNG is injected so tests can
 * seed it deterministically; production callers (`src/db/queries/rooms.ts`)
 * pass a CSPRNG-backed sampler. The alphabet must stay in sync with the
 * `rooms_code_valid` CHECK in `src/db/schema.ts`.
 */
export function generateRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}
