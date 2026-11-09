/**
 * @jest-environment node
 *
 * Unit tests for the room server actions (SEC-01, TECH-07). The queries,
 * sessions and rate limiter are mocked so each test can prove the one thing
 * an action is responsible for: schema validation, server-side identity
 * resolution, host-only authorization and the error mapping — actions must
 * return typed results, never throw to the client.
 */

import { headers } from 'next/headers';
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
  joinRoom as joinRoomQuery,
  kickMember as kickMemberQuery,
  listPublicRooms,
  markMemberLeft,
  NotHostCandidateError,
  RoomConfigLockedError,
  RoomFullError,
  RoomMemberKickedError,
  RoomNotFoundError,
  RoomNotJoinableError,
  transferHost as transferHostQuery,
  updateRoomConfig as updateRoomConfigQuery,
} from '../../db/queries/rooms';
import { getUserFullProfile, getUserPublicInfoById } from '../../db/queries/users';
import {
  createGuestSession,
  getGuestSession,
  InvalidGuestNicknameError,
} from '../../lib/guest-session';
import { RateLimitExceededError, roomCodeJoinLimiter } from '../../lib/rate-limit';
import { getSession } from '../../lib/session';

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    // Mirrors the real control-flow throw of next/navigation's redirect().
    const error = new Error(`NEXT_REDIRECT to ${path}`) as Error & { digest: string };
    error.digest = `NEXT_REDIRECT;replace;${path};307;`;
    throw error;
  }),
}));

jest.mock('../../db/index', () => ({ db: {} }));

jest.mock('../../lib/session', () => ({ getSession: jest.fn() }));

jest.mock('../../lib/guest-session', () => {
  const actual = jest.requireActual('../../lib/guest-session');
  return { ...actual, getGuestSession: jest.fn(), createGuestSession: jest.fn() };
});

jest.mock('../../lib/rate-limit', () => {
  const actual = jest.requireActual('../../lib/rate-limit');
  return {
    ...actual,
    roomCodeJoinLimiter: { check: jest.fn(), reset: jest.fn() },
  };
});

jest.mock('../../db/queries/users', () => ({
  getUserFullProfile: jest.fn(),
  getUserPublicInfoById: jest.fn(),
}));

jest.mock('../../db/queries/rooms', () => {
  const actual = jest.requireActual('../../db/queries/rooms');
  return {
    ...actual,
    createRoom: jest.fn(),
    joinRoom: jest.fn(),
    getRoomByCode: jest.fn(),
    getRoomInternalByPublicId: jest.fn(),
    getActiveMemberId: jest.fn(),
    getActiveRoomOfIdentity: jest.fn(),
    listPublicRooms: jest.fn(),
    findHostSuccessorForRoom: jest.fn(),
    kickMember: jest.fn(),
    closeRoom: jest.fn(),
    updateRoomConfig: jest.fn(),
    transferHost: jest.fn(),
    markMemberLeft: jest.fn(),
  };
});

jest.mock('../../db/queries/invitations', () => {
  const actual = jest.requireActual('../../db/queries/invitations');
  return { ...actual, createInvitationLinks: jest.fn() };
});

jest.mock('../../realtime/events', () => {
  const actual = jest.requireActual('../../realtime/events');
  return { ...actual, requestEngineStart: jest.fn() };
});

import {
  closeRoom,
  createRoom,
  generateInvitationLinks,
  joinByCodeFormAction,
  joinRoomByCode,
  kickMember,
  leaveAndJoinFormAction,
  leaveRoom,
  quickPlay,
  setGuestNickname,
  startRace,
  transferHost,
  updateRoomConfig,
} from './actions';
import { requestEngineStart } from '../../realtime/events';
import { redirect } from 'next/navigation';
import { defaultRoomConfig } from '../../lib/room-config';
import type { RoomConfig } from '../../db/schema';

const getSessionMock = getSession as jest.Mock;
const getGuestSessionMock = getGuestSession as jest.Mock;
const createGuestSessionMock = createGuestSession as jest.Mock;
const getUserFullProfileMock = getUserFullProfile as jest.Mock;
const getUserPublicInfoByIdMock = getUserPublicInfoById as jest.Mock;
const createRoomQueryMock = createRoomQuery as jest.Mock;
const joinRoomQueryMock = joinRoomQuery as jest.Mock;
const getRoomByCodeMock = getRoomByCode as jest.Mock;
const getRoomInternalByPublicIdMock = getRoomInternalByPublicId as jest.Mock;
const getActiveMemberIdMock = getActiveMemberId as jest.Mock;
const getActiveRoomOfIdentityMock = getActiveRoomOfIdentity as jest.Mock;
const listPublicRoomsMock = listPublicRooms as jest.Mock;
const findHostSuccessorForRoomMock = findHostSuccessorForRoom as jest.Mock;
const kickMemberQueryMock = kickMemberQuery as jest.Mock;
const closeRoomQueryMock = closeRoomQuery as jest.Mock;
const updateRoomConfigQueryMock = updateRoomConfigQuery as jest.Mock;
const transferHostQueryMock = transferHostQuery as jest.Mock;
const markMemberLeftMock = markMemberLeft as jest.Mock;
const createInvitationLinksQueryMock = createInvitationLinksQuery as jest.Mock;
const requestEngineStartMock = requestEngineStart as jest.Mock;
const limiterCheckMock = roomCodeJoinLimiter.check as jest.Mock;
const limiterResetMock = roomCodeJoinLimiter.reset as jest.Mock;
const redirectMock = redirect as unknown as jest.Mock;

const ROOM_PUBLIC_ID = '11111111-1111-4111-8111-111111111111';
const USER_PUBLIC_ID = '22222222-2222-4222-8222-222222222222';
const GUEST_TOKEN = '33333333-3333-4333-8333-333333333333';

const roomRow = {
  id: 42,
  publicId: ROOM_PUBLIC_ID,
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

const publicRoom = {
  publicId: ROOM_PUBLIC_ID,
  code: 'ABCDEF',
  visibility: 'public',
  status: 'en_attente',
  capacity: 10,
  config: {},
  createdAt: new Date('2024-01-01T00:00:00Z'),
};

function userActor(overrides: Record<string, unknown> = {}): void {
  getSessionMock.mockResolvedValue({ publicId: USER_PUBLIC_ID, username: 'ada' });
  getGuestSessionMock.mockResolvedValue(null);
  getUserFullProfileMock.mockResolvedValue({
    id: 7,
    publicId: USER_PUBLIC_ID,
    username: 'ada',
    ...overrides,
  });
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
  limiterCheckMock.mockImplementation(() => undefined);
  redirectMock.mockImplementation((path: string) => {
    const error = new Error(`NEXT_REDIRECT to ${path}`) as Error & { digest: string };
    error.digest = `NEXT_REDIRECT;replace;${path};307;`;
    throw error;
  });
  (headers as jest.Mock).mockResolvedValue({
    get: (name: string) => (name === 'x-forwarded-for' ? '203.0.113.7, 10.0.0.1' : null),
  });
});

describe('createRoom (SALLE-01, AUTH-03)', () => {
  test('refuses when nobody is logged in', async () => {
    noActor();

    await expect(createRoom({ visibility: 'public' })).resolves.toEqual({
      ok: false,
      error: 'authRequired',
    });
    expect(createRoomQueryMock).not.toHaveBeenCalled();
  });

  test('refuses when only a guest cookie exists (AUTH-03)', async () => {
    guestActor();

    await expect(createRoom({ visibility: 'public' })).resolves.toEqual({
      ok: false,
      error: 'authRequired',
    });
  });

  test('rejects invalid input before touching anything', async () => {
    noActor();

    await expect(createRoom({ visibility: 'hidden' } as never)).resolves.toEqual({
      ok: false,
      error: 'invalidInput',
    });
    expect(getUserFullProfileMock).not.toHaveBeenCalled();
  });

  test('creates the room for the logged-in user', async () => {
    userActor();
    createRoomQueryMock.mockResolvedValue(publicRoom);

    await expect(
      createRoom({ visibility: 'code', capacity: 4, hostRole: 'spectator' }),
    ).resolves.toEqual({ ok: true, room: publicRoom });

    expect(createRoomQueryMock).toHaveBeenCalledWith({
      hostUserId: 7,
      visibility: 'code',
      capacity: 4,
      hostRole: 'spectator',
      config: undefined,
    });
  });

  test('maps a host already active elsewhere', async () => {
    userActor();
    createRoomQueryMock.mockRejectedValue(new AlreadyInRoomError());

    await expect(createRoom({ visibility: 'public' })).resolves.toEqual({
      ok: false,
      error: 'alreadyInRoom',
    });
  });

  test('maps unexpected failures instead of throwing', async () => {
    userActor();
    createRoomQueryMock.mockRejectedValue(new Error('db down'));

    await expect(createRoom({ visibility: 'public' })).resolves.toEqual({
      ok: false,
      error: 'unexpected',
    });
  });
});

describe('setGuestNickname (AUTH-02)', () => {
  test('rejects a nickname outside 3–20 characters', async () => {
    await expect(setGuestNickname({ nickname: 'ab' })).resolves.toEqual({
      ok: false,
      error: 'invalidNickname',
    });
    expect(createGuestSessionMock).not.toHaveBeenCalled();
  });

  test('creates the signed guest cookie server-side', async () => {
    createGuestSessionMock.mockResolvedValue({ guestId: GUEST_TOKEN, nickname: 'Nain Curieux' });

    await expect(setGuestNickname({ nickname: '  Nain Curieux  ' })).resolves.toEqual({
      ok: true,
      guest: { guestId: GUEST_TOKEN, nickname: 'Nain Curieux' },
    });
    expect(createGuestSessionMock).toHaveBeenCalledWith('Nain Curieux');
  });

  test('maps the guard error and unexpected failures', async () => {
    createGuestSessionMock.mockRejectedValue(new InvalidGuestNicknameError());
    await expect(setGuestNickname({ nickname: 'Ada' })).resolves.toEqual({
      ok: false,
      error: 'invalidNickname',
    });

    createGuestSessionMock.mockRejectedValue(new Error('no secret'));
    await expect(setGuestNickname({ nickname: 'Ada' })).resolves.toEqual({
      ok: false,
      error: 'unexpected',
    });
  });
});

describe('joinRoomByCode (SALLE-02/09/10)', () => {
  test('rate-limits the attempt per IP (SALLE-10)', async () => {
    limiterCheckMock.mockImplementation(() => {
      throw new RateLimitExceededError('203.0.113.7', 60_000);
    });

    await expect(joinRoomByCode({ code: 'ABCDEF' })).resolves.toEqual({
      ok: false,
      error: 'rateLimited',
    });
    expect(joinRoomQueryMock).not.toHaveBeenCalled();
    expect(limiterCheckMock).toHaveBeenCalledWith('203.0.113.7');
  });

  test('rejects a code outside the SALLE-02 alphabet', async () => {
    await expect(joinRoomByCode({ code: 'AB1CDE' })).resolves.toEqual({
      ok: false,
      error: 'invalidInput',
    });
    expect(limiterCheckMock).not.toHaveBeenCalled();
  });

  test('requires an identity before admitting anyone', async () => {
    noActor();

    await expect(joinRoomByCode({ code: 'ABCDEF' })).resolves.toEqual({
      ok: false,
      error: 'identityRequired',
    });
  });

  test('reports an unknown code without revealing the room list', async () => {
    userActor();
    getRoomByCodeMock.mockResolvedValue(null);

    await expect(joinRoomByCode({ code: 'ABCDEF' })).resolves.toEqual({
      ok: false,
      error: 'roomNotFound',
    });
  });

  test('a code alone never admits to a private room (SALLE-03/04)', async () => {
    userActor();
    getRoomByCodeMock.mockResolvedValue({ ...roomRow, visibility: 'private' });

    await expect(joinRoomByCode({ code: 'ABCDEF' })).resolves.toEqual({
      ok: false,
      error: 'roomNotFound',
    });
    expect(joinRoomQueryMock).not.toHaveBeenCalled();
  });

  test('joins a logged-in user and resets their rate window', async () => {
    userActor();
    getRoomByCodeMock.mockResolvedValue(roomRow);
    joinRoomQueryMock.mockResolvedValue({
      roomPublicId: ROOM_PUBLIC_ID,
      role: 'participant',
      joinedAt: new Date('2024-01-02T00:00:00Z'),
    });

    await expect(joinRoomByCode({ code: ' abcdef ' })).resolves.toEqual({
      ok: true,
      room: {
        publicId: ROOM_PUBLIC_ID,
        code: 'ABCDEF',
        status: 'en_attente',
        role: 'participant',
        joinedAt: new Date('2024-01-02T00:00:00Z'),
      },
    });

    expect(getRoomByCodeMock).toHaveBeenCalledWith('ABCDEF');
    expect(joinRoomQueryMock).toHaveBeenCalledWith({
      roomId: 42,
      role: 'participant',
      userId: 7,
      guestToken: null,
    });
    expect(limiterResetMock).toHaveBeenCalledWith('203.0.113.7');
  });

  test('joins a guest by their signed guest identity', async () => {
    guestActor();
    getRoomByCodeMock.mockResolvedValue(roomRow);
    joinRoomQueryMock.mockResolvedValue({
      roomPublicId: ROOM_PUBLIC_ID,
      role: 'spectator',
      joinedAt: new Date('2024-01-02T00:00:00Z'),
    });

    await expect(joinRoomByCode({ code: 'ABCDEF', role: 'spectator' })).resolves.toMatchObject({
      ok: true,
      room: { role: 'spectator' },
    });

    expect(joinRoomQueryMock).toHaveBeenCalledWith({
      roomId: 42,
      role: 'spectator',
      userId: null,
      guestToken: GUEST_TOKEN,
    });
  });

  test.each([
    [new RoomFullError(10), 'roomFull'],
    [new RoomMemberKickedError(), 'kicked'],
    [new RoomNotJoinableError('en_course'), 'roomNotJoinable'],
    [new RoomNotFoundError('x'), 'roomNotFound'],
  ])('maps %p to %s', async (thrown, code) => {
    userActor();
    getRoomByCodeMock.mockResolvedValue(roomRow);
    joinRoomQueryMock.mockRejectedValue(thrown);

    await expect(joinRoomByCode({ code: 'ABCDEF' })).resolves.toEqual({
      ok: false,
      error: code,
    });
  });

  test('alreadyInRoom carries the current room identity (SALLE-06)', async () => {
    userActor();
    getRoomByCodeMock.mockResolvedValue(roomRow);
    joinRoomQueryMock.mockRejectedValue(new AlreadyInRoomError());
    getActiveRoomOfIdentityMock.mockResolvedValue({ publicId: ROOM_PUBLIC_ID, code: 'GHJKM2' });

    await expect(joinRoomByCode({ code: 'ABCDEF' })).resolves.toEqual({
      ok: false,
      error: 'alreadyInRoom',
      currentRoom: { publicId: ROOM_PUBLIC_ID, code: 'GHJKM2' },
    });
    expect(getActiveRoomOfIdentityMock).toHaveBeenCalledWith({ userId: 7 });
  });
});

describe('host-only actions (SEC-01)', () => {
  test('updateRoomConfig parses and forwards the config for the host', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);

    const config: RoomConfig = {
      textLanguage: 'en',
      textComplexity: 'facile',
      textType: 'random',
      wordCount: 40,
      timeLimitSeconds: null,
      errorMode: 'stop',
      options: { punctuation: false, numbers: false, capitals: false, accents: false },
      bonusesEnabled: false,
      bots: [{ level: 'noob', count: 1 }],
    };

    await expect(updateRoomConfig({ roomPublicId: ROOM_PUBLIC_ID, config })).resolves.toEqual({
      ok: true,
    });
    expect(updateRoomConfigQueryMock).toHaveBeenCalledWith({
      roomId: 42,
      hostUserId: 7,
      config,
    });
  });

  test('updateRoomConfig refuses a non-host', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue({ ...roomRow, hostUserId: 8 });

    await expect(
      updateRoomConfig({ roomPublicId: ROOM_PUBLIC_ID, config: defaultRoomConfig }),
    ).resolves.toEqual({ ok: false, error: 'notHost' });
    expect(updateRoomConfigQueryMock).not.toHaveBeenCalled();
  });

  test('updateRoomConfig maps a frozen config to the typed configLocked denial (CONF-12)', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);
    updateRoomConfigQueryMock.mockRejectedValue(new RoomConfigLockedError('en_course'));

    await expect(
      updateRoomConfig({ roomPublicId: ROOM_PUBLIC_ID, config: defaultRoomConfig }),
    ).resolves.toEqual({ ok: false, error: 'configLocked' });
  });

  test('closeRoom closes only for the host', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);

    await expect(closeRoom({ roomPublicId: ROOM_PUBLIC_ID })).resolves.toEqual({ ok: true });
    expect(closeRoomQueryMock).toHaveBeenCalledWith({ roomId: 42, hostUserId: 7 });
  });

  test('generateInvitationLinks returns the tokens for the host', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);
    createInvitationLinksQueryMock.mockResolvedValue(['token-a', 'token-b']);

    await expect(generateInvitationLinks({ roomPublicId: ROOM_PUBLIC_ID, count: 2 })).resolves.toEqual({
      ok: true,
      tokens: ['token-a', 'token-b'],
    });
    expect(createInvitationLinksQueryMock).toHaveBeenCalledWith({
      roomId: 42,
      hostUserId: 7,
      count: 2,
    });
  });

  test('guest actors are refused on host-only actions', async () => {
    guestActor();

    await expect(closeRoom({ roomPublicId: ROOM_PUBLIC_ID })).resolves.toEqual({
      ok: false,
      error: 'authRequired',
    });
    expect(getRoomInternalByPublicIdMock).not.toHaveBeenCalled();
  });
});

describe('startRace (COURSE-02, SEC-01)', () => {
  test('starts the race through the in-process engine for the host', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);
    requestEngineStartMock.mockResolvedValue({ ok: true });

    await expect(startRace({ roomPublicId: ROOM_PUBLIC_ID })).resolves.toEqual({ ok: true });
    expect(requestEngineStartMock).toHaveBeenCalledWith(42, 7);
  });

  test('refuses a non-host before reaching the engine (SEC-01)', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue({ ...roomRow, hostUserId: 8 });

    await expect(startRace({ roomPublicId: ROOM_PUBLIC_ID })).resolves.toEqual({
      ok: false,
      error: 'notHost',
    });
    expect(requestEngineStartMock).not.toHaveBeenCalled();
  });

  test('refuses guests and anonymous callers', async () => {
    guestActor();
    await expect(startRace({ roomPublicId: ROOM_PUBLIC_ID })).resolves.toEqual({
      ok: false,
      error: 'authRequired',
    });

    noActor();
    await expect(startRace({ roomPublicId: ROOM_PUBLIC_ID })).resolves.toEqual({
      ok: false,
      error: 'authRequired',
    });
    expect(requestEngineStartMock).not.toHaveBeenCalled();
  });

  test('maps an already-running race to raceAlreadyRunning', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);
    requestEngineStartMock.mockResolvedValue({ ok: false, code: 'race_already_running' });

    await expect(startRace({ roomPublicId: ROOM_PUBLIC_ID })).resolves.toEqual({
      ok: false,
      error: 'raceAlreadyRunning',
    });
  });

  test('maps the engine guards (participants, host, text) to raceNotRunning', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);
    requestEngineStartMock.mockResolvedValue({
      ok: false,
      code: 'race_not_running',
      message: 'a race needs at least 2 participants',
    });

    await expect(startRace({ roomPublicId: ROOM_PUBLIC_ID })).resolves.toEqual({
      ok: false,
      error: 'raceNotRunning',
    });
  });

  test('returns unexpected when no realtime engine is registered in this process', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);
    requestEngineStartMock.mockResolvedValue(null);

    await expect(startRace({ roomPublicId: ROOM_PUBLIC_ID })).resolves.toEqual({
      ok: false,
      error: 'unexpected',
    });
  });

  test('rejects a malformed publicId', async () => {
    userActor();
    await expect(startRace({ roomPublicId: 'not-a-uuid' })).resolves.toEqual({
      ok: false,
      error: 'invalidInput',
    });
    expect(requestEngineStartMock).not.toHaveBeenCalled();
  });
});

describe('kickMember (SALLE-07, SEC-01)', () => {
  test('kicks a user target resolved by publicId', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);
    getUserFullProfileMock.mockResolvedValueOnce({ id: 7 }).mockResolvedValueOnce({ id: 9 });
    getActiveMemberIdMock.mockResolvedValue(52);

    await expect(
      kickMember({ roomPublicId: ROOM_PUBLIC_ID, targetUserId: USER_PUBLIC_ID }),
    ).resolves.toEqual({ ok: true });

    expect(kickMemberQueryMock).toHaveBeenCalledWith({
      roomId: 42,
      hostUserId: 7,
      targetMemberId: 52,
    });
  });

  test('kicks a guest target resolved by guest token', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);
    getActiveMemberIdMock.mockResolvedValue(53);

    await expect(
      kickMember({ roomPublicId: ROOM_PUBLIC_ID, targetGuestToken: GUEST_TOKEN }),
    ).resolves.toEqual({ ok: true });
    expect(kickMemberQueryMock).toHaveBeenCalledWith({
      roomId: 42,
      hostUserId: 7,
      targetMemberId: 53,
    });
  });

  test('reports an unknown target without kicking', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);
    getActiveMemberIdMock.mockResolvedValue(null);

    await expect(
      kickMember({ roomPublicId: ROOM_PUBLIC_ID, targetGuestToken: GUEST_TOKEN }),
    ).resolves.toEqual({ ok: false, error: 'targetNotFound' });
    expect(kickMemberQueryMock).not.toHaveBeenCalled();
  });

  test('refuses a non-host', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue({ ...roomRow, hostUserId: 8 });

    await expect(
      kickMember({ roomPublicId: ROOM_PUBLIC_ID, targetGuestToken: GUEST_TOKEN }),
    ).resolves.toEqual({ ok: false, error: 'notHost' });
  });
});

describe('transferHost (SALLE-08)', () => {
  test('hands the room to the resolved target', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);
    getUserFullProfileMock.mockResolvedValueOnce({ id: 7 }).mockResolvedValueOnce({ id: 9 });

    await expect(
      transferHost({ roomPublicId: ROOM_PUBLIC_ID, targetUserId: USER_PUBLIC_ID }),
    ).resolves.toEqual({ ok: true });
    expect(transferHostQueryMock).toHaveBeenCalledWith(42, 9);
  });

  test('maps an ineligible successor', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);
    getUserFullProfileMock.mockResolvedValueOnce({ id: 7 }).mockResolvedValueOnce({ id: 9 });
    transferHostQueryMock.mockRejectedValue(new NotHostCandidateError());

    await expect(
      transferHost({ roomPublicId: ROOM_PUBLIC_ID, targetUserId: USER_PUBLIC_ID }),
    ).resolves.toEqual({ ok: false, error: 'notHostCandidate' });
  });
});

describe('leaveRoom (SALLE-08)', () => {
  test('marks a non-host member as left', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue({ ...roomRow, hostUserId: 8 });
    getActiveMemberIdMock.mockResolvedValue(51);

    await expect(leaveRoom({ roomPublicId: ROOM_PUBLIC_ID })).resolves.toEqual({ ok: true });
    expect(markMemberLeftMock).toHaveBeenCalledWith(51);
    expect(findHostSuccessorForRoomMock).not.toHaveBeenCalled();
  });

  test('a departing host hands over to the longest-present human', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);
    getActiveMemberIdMock.mockResolvedValue(51);
    findHostSuccessorForRoomMock.mockResolvedValue({ userId: 9 });
    getUserPublicInfoByIdMock.mockResolvedValue({
      publicId: USER_PUBLIC_ID,
      username: 'bob',
    });

    await expect(leaveRoom({ roomPublicId: ROOM_PUBLIC_ID })).resolves.toEqual({ ok: true });
    expect(transferHostQueryMock).toHaveBeenCalledWith(42, 9);
    expect(closeRoomQueryMock).not.toHaveBeenCalled();
  });

  test('a departing host closes the room when nobody can take over', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);
    getActiveMemberIdMock.mockResolvedValue(51);
    findHostSuccessorForRoomMock.mockResolvedValue(null);

    await expect(leaveRoom({ roomPublicId: ROOM_PUBLIC_ID })).resolves.toEqual({ ok: true });
    expect(closeRoomQueryMock).toHaveBeenCalledWith({ roomId: 42, hostUserId: 7 });
    expect(transferHostQueryMock).not.toHaveBeenCalled();
  });

  test('a guest can leave their room', async () => {
    guestActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);
    getActiveMemberIdMock.mockResolvedValue(60);

    await expect(leaveRoom({ roomPublicId: ROOM_PUBLIC_ID })).resolves.toEqual({ ok: true });
    expect(getActiveMemberIdMock).toHaveBeenCalledWith(42, {
      userId: null,
      guestToken: GUEST_TOKEN,
    });
  });

  test('reports an absent membership', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);
    getActiveMemberIdMock.mockResolvedValue(null);

    await expect(leaveRoom({ roomPublicId: ROOM_PUBLIC_ID })).resolves.toEqual({
      ok: false,
      error: 'targetNotFound',
    });
  });
});

describe('validation', () => {
  test('host-only actions reject malformed roomPublicId', async () => {
    noActor();

    await expect(closeRoom({ roomPublicId: 'not-a-uuid' })).resolves.toEqual({
      ok: false,
      error: 'invalidInput',
    });
    await expect(leaveRoom({ roomPublicId: 'not-a-uuid' })).resolves.toEqual({
      ok: false,
      error: 'invalidInput',
    });
  });

  test('kickMember requires exactly one target identity', async () => {
    noActor();

    await expect(
      kickMember({ roomPublicId: ROOM_PUBLIC_ID, targetUserId: USER_PUBLIC_ID, targetGuestToken: GUEST_TOKEN }),
    ).resolves.toEqual({ ok: false, error: 'invalidInput' });
  });
});

describe('quickPlay (JOIN-03)', () => {
  const candidate = (overrides: Record<string, unknown> = {}) => ({
    publicId: ROOM_PUBLIC_ID,
    code: 'ABCDEF',
    visibility: 'public',
    status: 'en_attente',
    capacity: 10,
    config: defaultRoomConfig,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    hostName: 'ada',
    participantCount: 4,
    ...overrides,
  });

  test('redirects to the best room after joining it for a user', async () => {
    userActor();
    listPublicRoomsMock.mockResolvedValue([candidate()]);
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);
    joinRoomQueryMock.mockResolvedValue({
      roomPublicId: ROOM_PUBLIC_ID,
      memberId: 1,
      role: 'participant',
      joinedAt: new Date('2024-01-01T00:00:00Z'),
    });

    await expect(quickPlay()).rejects.toMatchObject({
      digest: expect.stringContaining(`/rooms/${ROOM_PUBLIC_ID}`),
    });
    expect(joinRoomQueryMock).toHaveBeenCalledWith({
      roomId: 42,
      role: 'participant',
      userId: 7,
      guestToken: null,
    });
  });

  test('redirects a guest with no nickname to the room page first (AUTH-02)', async () => {
    noActor();
    listPublicRoomsMock.mockResolvedValue([candidate()]);

    await expect(quickPlay()).rejects.toMatchObject({
      digest: expect.stringContaining(`/rooms/${ROOM_PUBLIC_ID}?quickplay=1`),
    });
    expect(joinRoomQueryMock).not.toHaveBeenCalled();
  });

  test('sends users to the create entry point when no room exists', async () => {
    userActor();
    listPublicRoomsMock.mockResolvedValue([]);

    await expect(quickPlay()).rejects.toMatchObject({
      digest: expect.stringContaining('/?notice=noRooms'),
    });
    expect(joinRoomQueryMock).not.toHaveBeenCalled();
  });

  test('sends guests to the guest empty state when no room exists', async () => {
    guestActor();
    listPublicRoomsMock.mockResolvedValue([]);

    await expect(quickPlay()).rejects.toMatchObject({
      digest: expect.stringContaining('/?notice=noRoomsGuest'),
    });
  });

  test('moves on to the next candidate when one filled up meanwhile', async () => {
    userActor();
    const first = candidate({ publicId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', participantCount: 9 });
    const second = candidate({ participantCount: 1 });
    listPublicRoomsMock.mockResolvedValue([first, second]);
    getRoomInternalByPublicIdMock
      .mockResolvedValueOnce({ ...roomRow, publicId: first.publicId })
      .mockResolvedValueOnce(roomRow);
    joinRoomQueryMock
      .mockRejectedValueOnce(new RoomFullError(10))
      .mockResolvedValueOnce({
        roomPublicId: ROOM_PUBLIC_ID,
        memberId: 1,
        role: 'participant',
        joinedAt: new Date('2024-01-01T00:00:00Z'),
      });

    await expect(quickPlay()).rejects.toMatchObject({
      digest: expect.stringContaining(`/rooms/${ROOM_PUBLIC_ID}`),
    });
    expect(joinRoomQueryMock).toHaveBeenCalledTimes(2);
  });
});

describe('joinByCodeFormAction (JOIN-01)', () => {
  function formData(entries: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) {
      data.set(key, value);
    }
    return data;
  }

  const previous: { ok: false; error: 'unexpected'; currentRoom: null } = {
    ok: false,
    error: 'unexpected',
    currentRoom: null,
  };

  test('rejects a malformed code', async () => {
    noActor();
    const result = await joinByCodeFormAction(previous, formData({ code: 'abc' }));
    expect(result).toEqual({ ok: false, error: 'invalidInput', currentRoom: null });
    expect(getRoomByCodeMock).not.toHaveBeenCalled();
  });

  test('sets the guest nickname before joining when one is submitted (AUTH-02)', async () => {
    noActor();
    createGuestSessionMock.mockResolvedValue({ guestId: GUEST_TOKEN, nickname: 'Nain Curieux' });
    getGuestSessionMock.mockResolvedValue({ guestId: GUEST_TOKEN, nickname: 'Nain Curieux' });
    getRoomByCodeMock.mockResolvedValue(roomRow);
    joinRoomQueryMock.mockResolvedValue({
      roomPublicId: ROOM_PUBLIC_ID,
      role: 'participant',
      joinedAt: new Date('2024-01-01T00:00:00Z'),
    });

    const result = await joinByCodeFormAction(
      previous,
      formData({ code: 'abcdef', nickname: 'Nain Curieux' }),
    );
    expect(result).toEqual({ ok: true, roomPublicId: ROOM_PUBLIC_ID });
    expect(createGuestSessionMock).toHaveBeenCalledWith('Nain Curieux');
  });

  test('forwards typed join failures with the current room (SALLE-06)', async () => {
    userActor();
    getRoomByCodeMock.mockResolvedValue(roomRow);
    joinRoomQueryMock.mockRejectedValue(new AlreadyInRoomError());
    getActiveRoomOfIdentityMock.mockResolvedValue({ publicId: ROOM_PUBLIC_ID, code: 'GHJKM2' });

    const result = await joinByCodeFormAction(previous, formData({ code: 'abcdef' }));
    expect(result).toEqual({
      ok: false,
      error: 'alreadyInRoom',
      currentRoom: { publicId: ROOM_PUBLIC_ID, code: 'GHJKM2' },
    });
  });
});

describe('leaveAndJoinFormAction (SALLE-06)', () => {
  function formData(entries: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) {
      data.set(key, value);
    }
    return data;
  }

  const previous: { ok: false; error: 'unexpected'; currentRoom: null } = {
    ok: false,
    error: 'unexpected',
    currentRoom: null,
  };

  test('leaves the current room then joins the requested code', async () => {
    userActor();
    getRoomInternalByPublicIdMock.mockResolvedValue(roomRow);
    getActiveMemberIdMock.mockResolvedValue(5);
    getRoomByCodeMock.mockResolvedValue(roomRow);
    joinRoomQueryMock.mockResolvedValue({
      roomPublicId: ROOM_PUBLIC_ID,
      role: 'participant',
      joinedAt: new Date('2024-01-01T00:00:00Z'),
    });

    const result = await leaveAndJoinFormAction(
      previous,
      formData({ code: 'abcdef', currentRoomPublicId: ROOM_PUBLIC_ID }),
    );
    expect(result).toEqual({ ok: true, roomPublicId: ROOM_PUBLIC_ID });
    expect(markMemberLeftMock).toHaveBeenCalledWith(5);
  });
});
