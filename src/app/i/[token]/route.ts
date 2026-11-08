import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  consumeInvitationToken,
  getBoundMemberIdentity,
  getInvitationByToken,
  InvitationBoundToOtherError,
  InvitationNotFoundError,
  InvitationRevokedError,
} from '../../../db/queries/invitations';
import {
  AlreadyInRoomError,
  getActiveMemberId,
  getRoomPublicRefById,
  joinRoom,
  markMemberLeft,
  RoomFullError,
  RoomMemberKickedError,
  RoomNotFoundError,
  RoomNotJoinableError,
} from '../../../db/queries/rooms';
import { getUserFullProfile } from '../../../db/queries/users';
import { getGuestSession } from '../../../lib/guest-session';
import { getSession } from '../../../lib/session';

/**
 * SALLE-03/04: the invitation-link join endpoint.
 *
 * The link's token is consumed server-side with the existing invitation
 * queries: unknown/revoked links and links bound to someone else end on a
 * friendly error page; a bound member may reuse their own link. For a guest
 * with no nickname yet, nothing is joined here — the room page collects the
 * name (AUTH-02) and the lobby joins by token over the realtime channel,
 * which is where the link gets bound. Private rooms are thereby joinable
 * without a code.
 */

export type InvitationJoinOutcome =
  | { kind: 'join'; roomPublicId: string; token: string }
  | {
      kind: 'error';
      reason: 'unknown' | 'revoked' | 'used' | 'full' | 'kicked' | 'notJoinable' | 'unexpected';
    };

type Identity = { userId: number; guestToken: null } | { userId: null; guestToken: string };

function samePerson(a: { userId: number | null; guestToken: string | null }, b: Identity): boolean {
  if (a.userId !== null) {
    return b.userId !== null && a.userId === b.userId;
  }
  return b.guestToken !== null && a.guestToken === b.guestToken;
}

async function clientIp(): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get('x-forwarded-for');
  if (!forwarded) {
    return 'local';
  }
  const first = forwarded.split(',')[0]?.trim() ?? '';
  return first.length > 0 && first.length <= 45 ? first : 'local';
}

/**
 * Resolves where an invitation token should lead. Extracted from the route
 * handler so the decision is unit-testable with mocked queries; the handler
 * only turns the outcome into a redirect.
 */
export async function resolveInvitationJoin(token: string): Promise<InvitationJoinOutcome> {
  const trimmed = typeof token === 'string' ? token.trim() : '';
  if (trimmed.length === 0 || trimmed.length > 256) {
    return { kind: 'error', reason: 'unknown' };
  }

  try {
    const link = await getInvitationByToken(trimmed);
    if (!link) {
      return { kind: 'error', reason: 'unknown' };
    }
    if (link.status === 'revoked') {
      return { kind: 'error', reason: 'revoked' };
    }

    const roomRef = await getRoomPublicRefById(link.roomId);
    if (!roomRef) {
      return { kind: 'error', reason: 'unknown' };
    }

    const session = await getSession();
    const guest = await getGuestSession();
    let identity: Identity | null = null;
    if (session) {
      const profile = await getUserFullProfile({ publicId: session.publicId });
      if (profile) {
        identity = { userId: profile.id, guestToken: null };
      }
    } else if (guest) {
      identity = { userId: null, guestToken: guest.guestId };
    }

    // A used link only opens for its bound member (SALLE-04).
    if (link.status === 'used') {
      if (link.boundMemberId === null) {
        return { kind: 'error', reason: 'unknown' };
      }
      const bound = await getBoundMemberIdentity(link.boundMemberId);
      if (!bound || identity === null || !samePerson(bound, identity)) {
        return { kind: 'error', reason: 'used' };
      }
    }

    // No identity yet: a guest must pick a nickname first (AUTH-02). The room
    // page shows the dwarf-name form, then the lobby joins by token.
    if (identity === null) {
      return { kind: 'join', roomPublicId: roomRef.publicId, token: trimmed };
    }

    let memberId: number | null = null;
    let freshMemberId: number | null = null;
    try {
      const joined = await joinRoom({
        roomId: link.roomId,
        role: 'participant',
        ...identity,
      });
      memberId = joined.memberId;
      freshMemberId = joined.memberId;
    } catch (error) {
      if (error instanceof AlreadyInRoomError) {
        // Bound-member reconnect: already an active member of this room.
        memberId = await getActiveMemberId(link.roomId, identity);
      } else if (error instanceof RoomFullError) {
        return { kind: 'error', reason: 'full' };
      } else if (error instanceof RoomMemberKickedError) {
        return { kind: 'error', reason: 'kicked' };
      } else if (error instanceof RoomNotJoinableError || error instanceof RoomNotFoundError) {
        return { kind: 'error', reason: 'notJoinable' };
      } else {
        throw error;
      }
    }

    if (memberId === null) {
      return { kind: 'error', reason: 'unexpected' };
    }

    try {
      // First use binds the link to the membership and IP; reuse is
      // re-verified against the bound identity (SALLE-04).
      await consumeInvitationToken({ token: trimmed, memberId, ip: await clientIp() });
    } catch (error) {
      // Defensive rollback: a fresh membership must not survive a refused link.
      if (freshMemberId !== null) {
        try {
          await markMemberLeft(freshMemberId);
        } catch {
          // The rollback is best-effort; the refusal below still stands.
        }
      }
      if (error instanceof InvitationBoundToOtherError) {
        return { kind: 'error', reason: 'used' };
      }
      if (error instanceof InvitationRevokedError) {
        return { kind: 'error', reason: 'revoked' };
      }
      if (error instanceof InvitationNotFoundError) {
        return { kind: 'error', reason: 'unknown' };
      }
      throw error;
    }

    return { kind: 'join', roomPublicId: roomRef.publicId, token: trimmed };
  } catch (error) {
    console.error('invitation join: unexpected failure', error);
    return { kind: 'error', reason: 'unexpected' };
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<never> {
  const { token } = await context.params;
  const outcome = await resolveInvitationJoin(token);

  if (outcome.kind === 'error') {
    redirect(`/i/error?reason=${outcome.reason}`);
  }
  redirect(`/rooms/${outcome.roomPublicId}?invitation=${encodeURIComponent(outcome.token)}`);
}
