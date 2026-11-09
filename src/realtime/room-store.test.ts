/**
 * @jest-environment node
 *
 * Unit tests for the realtime room store's admission decisions (SALLE-03/04):
 * a code alone never admits to a private room, but an active member
 * reconnecting is not a join — the membership is the credential. Joins by
 * code stay delegated to the shared queries so action and realtime admission
 * can never disagree.
 */

import {
  AlreadyInRoomError,
  getActiveMemberId,
  getRoomByCode,
  joinRoom as joinRoomQuery,
  RoomFullError,
} from '../db/queries/rooms';
import { PostgresRoomStore } from './room-store';
import type { HubIdentity } from './hub';

jest.mock('../db/index', () => ({ db: {} }));

jest.mock('../db/queries/rooms', () => {
  const actual = jest.requireActual('../db/queries/rooms');
  return {
    ...actual,
    getRoomByCode: jest.fn(),
    getActiveMemberId: jest.fn(),
    joinRoom: jest.fn(),
  };
});

jest.mock('../db/queries/invitations', () => {
  const actual = jest.requireActual('../db/queries/invitations');
  return {
    ...actual,
    getInvitationByToken: jest.fn(),
    getBoundMemberIdentity: jest.fn(),
    consumeInvitationToken: jest.fn(),
  };
});

jest.mock('../db/queries/users', () => ({
  getUserPublicInfoById: jest.fn(),
}));

const getRoomByCodeMock = getRoomByCode as jest.Mock;
const getActiveMemberIdMock = getActiveMemberId as jest.Mock;
const joinRoomQueryMock = joinRoomQuery as jest.Mock;

const identity: HubIdentity = {
  kind: 'user',
  userId: 7,
  publicId: '22222222-2222-4222-8222-222222222222',
  username: 'ada',
};

const roomRow = {
  id: 42,
  publicId: '11111111-1111-4111-8111-111111111111',
  code: 'ABCDEF',
  hostUserId: 7,
  visibility: 'public',
  status: 'en_attente',
  capacity: 10,
  config: {},
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  closedAt: null,
};

const store = new PostgresRoomStore();

beforeEach(() => {
  jest.resetAllMocks();
});

describe('joinRoom by code (SALLE-02/03/05/09)', () => {
  test('unknown codes answer room_not_found', async () => {
    getRoomByCodeMock.mockResolvedValue(null);

    await expect(
      store.joinRoom({ identity, target: { code: 'ABCDEF' }, ip: '203.0.113.7' }),
    ).resolves.toEqual({ ok: false, error: 'room_not_found' });
  });

  test('public rooms join through the shared query', async () => {
    getRoomByCodeMock.mockResolvedValue(roomRow);
    getActiveMemberIdMock.mockResolvedValue(null);
    joinRoomQueryMock.mockResolvedValue({ roomPublicId: roomRow.publicId, memberId: 1, role: 'participant', joinedAt: new Date() });

    await expect(
      store.joinRoom({ identity, target: { code: 'ABCDEF' }, ip: '203.0.113.7' }),
    ).resolves.toEqual({ ok: true, roomId: 42, rejoin: false });
    expect(joinRoomQueryMock).toHaveBeenCalledWith({
      roomId: 42,
      role: 'participant',
      userId: 7,
      guestToken: null,
    });
  });

  test('an active member reconnecting a running race re-attaches, not admits (COURSE-08)', async () => {
    getRoomByCodeMock.mockResolvedValue({ ...roomRow, status: 'en_course' });
    getActiveMemberIdMock.mockResolvedValue(9);

    await expect(
      store.joinRoom({ identity, target: { code: 'ABCDEF' }, ip: '203.0.113.7' }),
    ).resolves.toEqual({ ok: true, roomId: 42, rejoin: true });
    // SALLE-09 would block a fresh join here: the membership is the credential.
    expect(joinRoomQueryMock).not.toHaveBeenCalled();
    expect(getActiveMemberIdMock).toHaveBeenCalledWith(42, { userId: 7, guestToken: null });
  });

  test('an already-present member re-joins without a second membership', async () => {
    getRoomByCodeMock.mockResolvedValue(roomRow);
    getActiveMemberIdMock.mockResolvedValue(null);
    joinRoomQueryMock.mockRejectedValue(new AlreadyInRoomError());

    await expect(
      store.joinRoom({ identity, target: { code: 'ABCDEF' }, ip: '203.0.113.7' }),
    ).resolves.toEqual({ ok: true, roomId: 42, rejoin: true });
  });

  test('a full room maps to room_full', async () => {
    getRoomByCodeMock.mockResolvedValue(roomRow);
    getActiveMemberIdMock.mockResolvedValue(null);
    joinRoomQueryMock.mockRejectedValue(new RoomFullError(10));

    await expect(
      store.joinRoom({ identity, target: { code: 'ABCDEF' }, ip: '203.0.113.7' }),
    ).resolves.toEqual({ ok: false, error: 'room_full' });
  });

  test('a code never admits to a private room (SALLE-03)', async () => {
    getRoomByCodeMock.mockResolvedValue({ ...roomRow, visibility: 'private' });
    getActiveMemberIdMock.mockResolvedValue(null);

    await expect(
      store.joinRoom({ identity, target: { code: 'ABCDEF' }, ip: '203.0.113.7' }),
    ).resolves.toEqual({ ok: false, error: 'room_not_found' });
    expect(joinRoomQueryMock).not.toHaveBeenCalled();
  });

  test('an active member reconnecting a private room is re-attached, not admitted', async () => {
    getRoomByCodeMock.mockResolvedValue({ ...roomRow, visibility: 'private' });
    getActiveMemberIdMock.mockResolvedValue(51);

    await expect(
      store.joinRoom({ identity, target: { code: 'ABCDEF' }, ip: '203.0.113.7' }),
    ).resolves.toEqual({ ok: true, roomId: 42, rejoin: true });
    expect(joinRoomQueryMock).not.toHaveBeenCalled();
    expect(getActiveMemberIdMock).toHaveBeenCalledWith(42, { userId: 7, guestToken: null });
  });
});
