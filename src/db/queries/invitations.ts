import { randomBytes } from 'crypto';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '..';
import { invitationLinks, roomMembers, rooms, type InvitationLink } from '../schema';
import { NotRoomHostError, RoomNotFoundError } from './rooms';

/**
 * Data access for invitation links (SALLE-04).
 *
 * A link is a row carrying a cryptographically random token (>= 128 bits of
 * entropy — 24 random bytes, base64url). Links are single-use: the first
 * consumption binds the link to an IP address and to the consuming member,
 * and from then on only that member (same user, or same guest identity) may
 * reuse it — a different person is refused. Kicking a member or closing the
 * room revokes links; a revoked link can never be consumed again.
 */

/** Raised for input the database must not be asked to store. */
export class InvalidInvitationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInvitationInputError';
  }
}

/** Raised when a token does not exist. */
export class InvitationNotFoundError extends Error {
  constructor() {
    super('no invitation link matches this token');
    this.name = 'InvitationNotFoundError';
  }
}

/** Raised when a revoked link is used (SALLE-04). */
export class InvitationRevokedError extends Error {
  constructor() {
    super('this invitation link has been revoked');
    this.name = 'InvitationRevokedError';
  }
}

/** Raised when a link bound to someone else is used. */
export class InvitationBoundToOtherError extends Error {
  constructor() {
    super('this invitation link is bound to a different person');
    this.name = 'InvitationBoundToOtherError';
  }
}

/** Token entropy: 24 random bytes → 192 bits ≥ the 128-bit floor (SALLE-04). */
const TOKEN_BYTES = 24;

const MAX_LINKS_PER_BATCH = 100;

const IP_PATTERN = /^[0-9a-fA-F.:]+$/;

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InvalidInvitationInputError(`${field} must be a positive integer`);
  }
}

function assertToken(token: string): void {
  if (typeof token !== 'string' || token.trim().length === 0 || token.length > 256) {
    throw new InvalidInvitationInputError('token must be a non-empty string of at most 256 characters');
  }
}

function assertIp(ip: string): void {
  if (typeof ip !== 'string' || ip.trim().length === 0 || ip.length > 45) {
    throw new InvalidInvitationInputError('ip must be a non-empty string of at most 45 characters');
  }
  if (!IP_PATTERN.test(ip.trim())) {
    throw new InvalidInvitationInputError('ip is not a valid IPv4/IPv6 address');
  }
}

/** True when two memberships belong to the same person (user or guest). */
function samePerson(
  a: { userId: number | null; guestToken: string | null },
  b: { userId: number | null; guestToken: string | null },
): boolean {
  if (a.userId !== null && b.userId !== null) {
    return a.userId === b.userId;
  }
  if (a.guestToken !== null && b.guestToken !== null) {
    return a.guestToken === b.guestToken;
  }
  return false;
}

export type CreateInvitationLinksParams = {
  roomId: number;
  hostUserId: number;
  count: number;
};

/**
 * Generates `count` invitation links for a room (SALLE-04). Host-only
 * (SEC-01): the caller's id is checked against `rooms.hostUserId`. Tokens are
 * 24 random bytes base64url (192 bits) and unique within the batch.
 */
export async function createInvitationLinks(
  params: CreateInvitationLinksParams,
): Promise<string[]> {
  assertPositiveInteger(params.roomId, 'roomId');
  assertPositiveInteger(params.hostUserId, 'hostUserId');
  if (!Number.isSafeInteger(params.count) || params.count < 1 || params.count > MAX_LINKS_PER_BATCH) {
    throw new InvalidInvitationInputError(
      `count must be an integer between 1 and ${MAX_LINKS_PER_BATCH}`,
    );
  }

  const [room] = await db
    .select({ hostUserId: rooms.hostUserId })
    .from(rooms)
    .where(eq(rooms.id, params.roomId))
    .limit(1);

  if (!room) {
    throw new RoomNotFoundError(`internal id ${params.roomId}`);
  }
  if (room.hostUserId !== params.hostUserId) {
    throw new NotRoomHostError();
  }

  const tokens: string[] = [];
  const seen = new Set<string>();
  while (tokens.length < params.count) {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    if (!seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
  }

  await db
    .insert(invitationLinks)
    .values(tokens.map((token) => ({ roomId: params.roomId, token, status: 'unused' })));

  return tokens;
}

/**
 * Loads a link by token for the server-side join path. Returns `null` when no
 * link matches — the caller reports "invalid link" without revealing whether
 * the token exists.
 */
export async function getInvitationByToken(token: string): Promise<InvitationLink | null> {
  if (typeof token !== 'string' || token.length === 0) {
    return null;
  }

  const rows = await db
    .select()
    .from(invitationLinks)
    .where(eq(invitationLinks.token, token))
    .limit(1);

  return rows[0] ?? null;
}

export type ConsumeInvitationParams = {
  token: string;
  /** Internal id of the membership created by the join step. */
  memberId: number;
  /** Client IP (from `x-forwarded-for`), bound on first use. */
  ip: string;
};

export type ConsumeInvitationResult = {
  /** Internal id of the room the link grants access to. */
  roomId: number;
  /** True when the link was already bound to this same person (reconnect). */
  alreadyBound: boolean;
};

/**
 * Consumes an invitation link (SALLE-04).
 *
 * One transaction with the link row locked:
 *
 * - unknown token → {@link InvitationNotFoundError};
 * - revoked → {@link InvitationRevokedError};
 * - already used → allowed only for the **bound member** (same user or guest
 *   identity), which is what lets a disconnected guest or user reconnect.
 *   The IP is *not* re-checked for the bound member, because a legitimate
 *   reconnect can come from another network; anyone else is refused
 *   ({@link InvitationBoundToOtherError});
 * - unused → the link is bound to the caller's membership and IP, and the
 *   membership must belong to the link's room.
 */
export async function consumeInvitationToken(
  params: ConsumeInvitationParams,
): Promise<ConsumeInvitationResult> {
  assertToken(params.token);
  assertPositiveInteger(params.memberId, 'memberId');
  assertIp(params.ip);
  const ip = params.ip.trim();

  return db.transaction(async (tx) => {
    const [link] = await tx
      .select()
      .from(invitationLinks)
      .where(eq(invitationLinks.token, params.token))
      .for('update');

    if (!link) {
      throw new InvitationNotFoundError();
    }
    if (link.status === 'revoked') {
      throw new InvitationRevokedError();
    }

    // The consuming membership must exist; its identity is what binds the link.
    const [member] = await tx
      .select({
        id: roomMembers.id,
        roomId: roomMembers.roomId,
        userId: roomMembers.userId,
        guestToken: roomMembers.guestToken,
      })
      .from(roomMembers)
      .where(eq(roomMembers.id, params.memberId))
      .for('update');

    if (!member) {
      throw new InvalidInvitationInputError('memberId does not match any membership');
    }

    if (link.status === 'used') {
      // A used link is always bound (CHECK in the schema), so a missing id
      // here means the data is corrupted, not a normal state.
      const boundMemberId = link.boundMemberId;
      if (boundMemberId === null) {
        throw new InvalidInvitationInputError('a used link must be bound to a member');
      }

      const [bound] = await tx
        .select({
          userId: roomMembers.userId,
          guestToken: roomMembers.guestToken,
          roomId: roomMembers.roomId,
        })
        .from(roomMembers)
        .where(eq(roomMembers.id, boundMemberId))
        .limit(1);

      // A bound link is reusable only by the bound member (SALLE-04). The IP
      // is deliberately not re-checked here: a legitimate reconnect can come
      // from another network, while anyone else is refused by identity.
      if (!bound || !samePerson(bound, member)) {
        throw new InvitationBoundToOtherError();
      }

      return { roomId: bound.roomId, alreadyBound: true };
    }

    if (member.roomId !== link.roomId) {
      throw new InvalidInvitationInputError('the membership does not belong to the linked room');
    }

    const now = new Date();
    await tx
      .update(invitationLinks)
      .set({
        status: 'used',
        boundIp: ip,
        boundMemberId: member.id,
        usedAt: now,
      })
      .where(eq(invitationLinks.id, link.id));

    return { roomId: link.roomId, alreadyBound: false };
  });
}

/**
 * Revokes every invitation link bound to a member (SALLE-04 — an expelled
 * member's links die with the kick). `rooms.kickMember` applies the same
 * transition inside its own transaction; use this for standalone revocations.
 */
export async function revokeInvitationsForMember(memberId: number): Promise<void> {
  assertPositiveInteger(memberId, 'memberId');

  await db
    .update(invitationLinks)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(
      and(eq(invitationLinks.boundMemberId, memberId), ne(invitationLinks.status, 'revoked')),
    );
}

/**
 * Identity of a membership row by internal member id — server-internal use
 * only. The realtime join-by-token path uses it to refuse a used link whose
 * bound member is a different person *before* creating a membership
 * (SALLE-04), so the refusal never has to be rolled back.
 */
export async function getBoundMemberIdentity(
  memberId: number,
): Promise<{ userId: number | null; guestToken: string | null } | null> {
  assertPositiveInteger(memberId, 'memberId');

  const rows = await db
    .select({ userId: roomMembers.userId, guestToken: roomMembers.guestToken })
    .from(roomMembers)
    .where(eq(roomMembers.id, memberId))
    .limit(1);

  const row = rows[0];
  return row ?? null;
}
