/**
 * @jest-environment node
 *
 * Unit tests for the invitation-link join decision (SALLE-03/04): unknown /
 * revoked / used-by-someone-else tokens land on the friendly error page, the
 * bound member may reuse their own link, a guest without a nickname is sent
 * to the room page to pick one, and a fresh membership is rolled back when
 * the link is refused at consumption time.
 */

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
  RoomNotJoinableError,
} from '../../../db/queries/rooms';
import { getUserFullProfile } from '../../../db/queries/users';
import { getGuestSession } from '../../../lib/guest-session';
import { getSession } from '../../../lib/session';
import { resolveInvitationJoin } from './route';

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

jest.mock('../../../db/index', () => ({ db: {} }));

jest.mock('../../../db/queries/invitations', () => {
  const actual = jest.requireActual('../../../db/queries/invitations');
  return {
    ...actual,
    getInvitationByToken: jest.fn(),
    getBoundMemberIdentity: jest.fn(),
    consumeInvitationToken: jest.fn(),
  };
});

jest.mock('../../../db/queries/rooms', () => {
  const actual = jest.requireActual('../../../db/queries/rooms');
  return {
    ...actual,
    getRoomPublicRefById: jest.fn(),
    getActiveMemberId: jest.fn(),
    joinRoom: jest.fn(),
    markMemberLeft: jest.fn(),
  };
});

jest.mock('../../../db/queries/users', () => ({
  getUserFullProfile: jest.fn(),
}));

jest.mock('../../../lib/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('../../../lib/guest-session', () => ({
  getGuestSession: jest.fn(),
}));

const { headers } = jest.requireMock('next/headers') as { headers: jest.Mock };

const getInvitationByTokenMock = getInvitationByToken as jest.Mock;
const getBoundMemberIdentityMock = getBoundMemberIdentity as jest.Mock;
const consumeInvitationTokenMock = consumeInvitationToken as jest.Mock;
const getRoomPublicRefByIdMock = getRoomPublicRefById as jest.Mock;
const getActiveMemberIdMock = getActiveMemberId as jest.Mock;
const joinRoomMock = joinRoom as jest.Mock;
const markMemberLeftMock = markMemberLeft as jest.Mock;
const getUserFullProfileMock = getUserFullProfile as jest.Mock;
const getSessionMock = getSession as jest.Mock;
const getGuestSessionMock = getGuestSession as jest.Mock;

const TOKEN = 'tok-abc';
const ROOM_PUBLIC_ID = '11111111-1111-4111-8111-111111111111';
const USER_PUBLIC_ID = '22222222-2222-4222-8222-222222222222';
const GUEST_TOKEN = '33333333-3333-4333-8333-333333333333';

function link(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    roomId: 42,
    token: TOKEN,
    status: 'unused',
    boundIp: null,
    boundMemberId: null,
    usedAt: null,
    revokedAt: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

function userActor(): void {
  getSessionMock.mockResolvedValue({ publicId: USER_PUBLIC_ID, username: 'ada' });
  getGuestSessionMock.mockResolvedValue(null);
  getUserFullProfileMock.mockResolvedValue({ id: 7, publicId: USER_PUBLIC_ID, username: 'ada' });
}

function guestActor(): void {
  getSessionMock.mockResolvedValue(null);
  getGuestSessionMock.mockResolvedValue({ guestId: GUEST_TOKEN, nickname: 'Nain' });
}

function noActor(): void {
  getSessionMock.mockResolvedValue(null);
  getGuestSessionMock.mockResolvedValue(null);
}

beforeEach(() => {
  jest.resetAllMocks();
  headers.mockResolvedValue({
    get: (name: string) => (name === 'x-forwarded-for' ? '203.0.113.7, 10.0.0.1' : null),
  });
  getRoomPublicRefByIdMock.mockResolvedValue({ publicId: ROOM_PUBLIC_ID, status: 'en_attente' });
});

describe('resolveInvitationJoin (SALLE-03/04)', () => {
  test('unknown tokens answer the unknown error page', async () => {
    noActor();
    getInvitationByTokenMock.mockResolvedValue(null);

    await expect(resolveInvitationJoin(TOKEN)).resolves.toEqual({
      kind: 'error',
      reason: 'unknown',
    });
  });

  test('oversized tokens are refused without a query', async () => {
    noActor();
    await expect(resolveInvitationJoin('x'.repeat(300))).resolves.toEqual({
      kind: 'error',
      reason: 'unknown',
    });
    expect(getInvitationByTokenMock).not.toHaveBeenCalled();
  });

  test('revoked links answer the revoked error page', async () => {
    noActor();
    getInvitationByTokenMock.mockResolvedValue(link({ status: 'revoked', revokedAt: new Date() }));

    await expect(resolveInvitationJoin(TOKEN)).resolves.toEqual({
      kind: 'error',
      reason: 'revoked',
    });
  });

  test('a used link refuses a different person', async () => {
    userActor();
    getInvitationByTokenMock.mockResolvedValue(
      link({ status: 'used', boundMemberId: 51, boundIp: '10.0.0.2', usedAt: new Date() }),
    );
    getBoundMemberIdentityMock.mockResolvedValue({ userId: 999, guestToken: null });

    await expect(resolveInvitationJoin(TOKEN)).resolves.toEqual({
      kind: 'error',
      reason: 'used',
    });
    expect(joinRoomMock).not.toHaveBeenCalled();
  });

  test('a guest without a nickname goes to the room page with the token (AUTH-02)', async () => {
    noActor();
    getInvitationByTokenMock.mockResolvedValue(link());

    await expect(resolveInvitationJoin(TOKEN)).resolves.toEqual({
      kind: 'join',
      roomPublicId: ROOM_PUBLIC_ID,
      token: TOKEN,
    });
    expect(joinRoomMock).not.toHaveBeenCalled();
    expect(consumeInvitationTokenMock).not.toHaveBeenCalled();
  });

  test('a user joins and the link is consumed and bound (SALLE-04)', async () => {
    userActor();
    getInvitationByTokenMock.mockResolvedValue(link());
    joinRoomMock.mockResolvedValue({
      roomPublicId: ROOM_PUBLIC_ID,
      memberId: 9,
      role: 'participant',
      joinedAt: new Date('2024-01-01T00:00:00Z'),
    });

    await expect(resolveInvitationJoin(TOKEN)).resolves.toEqual({
      kind: 'join',
      roomPublicId: ROOM_PUBLIC_ID,
      token: TOKEN,
    });
    expect(joinRoomMock).toHaveBeenCalledWith({
      roomId: 42,
      role: 'participant',
      userId: 7,
      guestToken: null,
    });
    expect(consumeInvitationTokenMock).toHaveBeenCalledWith({
      token: TOKEN,
      memberId: 9,
      ip: '203.0.113.7',
    });
  });

  test('the bound member reconnects through their used link', async () => {
    userActor();
    getInvitationByTokenMock.mockResolvedValue(
      link({ status: 'used', boundMemberId: 51, boundIp: '10.0.0.2', usedAt: new Date() }),
    );
    getBoundMemberIdentityMock.mockResolvedValue({ userId: 7, guestToken: null });
    joinRoomMock.mockRejectedValue(new AlreadyInRoomError());
    getActiveMemberIdMock.mockResolvedValue(51);

    await expect(resolveInvitationJoin(TOKEN)).resolves.toEqual({
      kind: 'join',
      roomPublicId: ROOM_PUBLIC_ID,
      token: TOKEN,
    });
    expect(consumeInvitationTokenMock).toHaveBeenCalledWith({
      token: TOKEN,
      memberId: 51,
      ip: '203.0.113.7',
    });
  });

  test('guests join through their guest identity', async () => {
    guestActor();
    getInvitationByTokenMock.mockResolvedValue(link());
    joinRoomMock.mockResolvedValue({
      roomPublicId: ROOM_PUBLIC_ID,
      memberId: 12,
      role: 'participant',
      joinedAt: new Date('2024-01-01T00:00:00Z'),
    });

    await expect(resolveInvitationJoin(TOKEN)).resolves.toEqual({
      kind: 'join',
      roomPublicId: ROOM_PUBLIC_ID,
      token: TOKEN,
    });
    expect(joinRoomMock).toHaveBeenCalledWith({
      roomId: 42,
      role: 'participant',
      userId: null,
      guestToken: GUEST_TOKEN,
    });
  });

  test.each([
    [new RoomFullError(10), 'full'],
    [new RoomMemberKickedError(), 'kicked'],
    [new RoomNotJoinableError('en_course'), 'notJoinable'],
  ])('maps %p to the %s error page', async (thrown, reason) => {
    userActor();
    getInvitationByTokenMock.mockResolvedValue(link());
    joinRoomMock.mockRejectedValue(thrown);

    await expect(resolveInvitationJoin(TOKEN)).resolves.toEqual({
      kind: 'error',
      reason,
    });
    expect(consumeInvitationTokenMock).not.toHaveBeenCalled();
  });

  test('rolls a fresh membership back when the link was revoked meanwhile', async () => {
    userActor();
    getInvitationByTokenMock.mockResolvedValue(link());
    joinRoomMock.mockResolvedValue({
      roomPublicId: ROOM_PUBLIC_ID,
      memberId: 9,
      role: 'participant',
      joinedAt: new Date('2024-01-01T00:00:00Z'),
    });
    consumeInvitationTokenMock.mockRejectedValue(new InvitationRevokedError());

    await expect(resolveInvitationJoin(TOKEN)).resolves.toEqual({
      kind: 'error',
      reason: 'revoked',
    });
    expect(markMemberLeftMock).toHaveBeenCalledWith(9);
  });

  test('rolls a fresh membership back when the link is bound to someone else', async () => {
    userActor();
    getInvitationByTokenMock.mockResolvedValue(link());
    joinRoomMock.mockResolvedValue({
      roomPublicId: ROOM_PUBLIC_ID,
      memberId: 9,
      role: 'participant',
      joinedAt: new Date('2024-01-01T00:00:00Z'),
    });
    consumeInvitationTokenMock.mockRejectedValue(new InvitationBoundToOtherError());

    await expect(resolveInvitationJoin(TOKEN)).resolves.toEqual({
      kind: 'error',
      reason: 'used',
    });
    expect(markMemberLeftMock).toHaveBeenCalledWith(9);
  });

  test('a vanished link at consumption time answers unknown', async () => {
    userActor();
    getInvitationByTokenMock.mockResolvedValue(link());
    joinRoomMock.mockResolvedValue({
      roomPublicId: ROOM_PUBLIC_ID,
      memberId: 9,
      role: 'participant',
      joinedAt: new Date('2024-01-01T00:00:00Z'),
    });
    consumeInvitationTokenMock.mockRejectedValue(new InvitationNotFoundError());

    await expect(resolveInvitationJoin(TOKEN)).resolves.toEqual({
      kind: 'error',
      reason: 'unknown',
    });
    expect(markMemberLeftMock).toHaveBeenCalledWith(9);
  });
});
