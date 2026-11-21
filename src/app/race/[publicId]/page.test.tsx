/**
 * @jest-environment jsdom
 *
 * RTL test for the race arena page (`/race/[publicId]`): a present room
 * member is handed to `RaceArena` with the room code and their role; a
 * missing room answers 404 and a non-member or anonymous viewer is redirected
 * home (SALLE-03/09 — the membership is the credential).
 */

import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { defaultRoomConfig } from '../../../lib/room-config';
import { getRoomForPage, getViewerMembership } from '../../../db/queries/rooms';
import { getUserFullProfile } from '../../../db/queries/users';
import { getGuestSession } from '../../../lib/guest-session';
import { getSession } from '../../../lib/session';
import RaceArenaPage from './page';

jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({ get: () => undefined })),
  headers: jest.fn(async () => ({ get: () => null })),
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

jest.mock('../../../db/index', () => ({ db: {} }));

jest.mock('../../../db/queries/rooms', () => ({
  getRoomForPage: jest.fn(),
  getViewerMembership: jest.fn(),
}));

jest.mock('../../../db/queries/users', () => ({
  getUserFullProfile: jest.fn(),
}));

jest.mock('../../../lib/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('../../../lib/guest-session', () => ({
  getGuestSession: jest.fn(),
}));

// The Navbar chain pulls `next/cache` through the locale action; not under
// test here (see the room page test for the full screen).
jest.mock('../../../i18n/locale-actions', () => ({
  setLocale: jest.fn(),
}));

jest.mock('../../../theme/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
  useTheme: () => ({ preference: 'system', setPreference: () => {} }),
}));

// The arena is a client component with its own socket; the page is the server
// scaffold, so it is stubbed to a marker carrying the props under test.
jest.mock('../../../components/race/RaceArena', () => ({
  __esModule: true,
  default: ({
    roomPublicId,
    roomCode,
    viewerRole,
  }: {
    roomPublicId: string;
    roomCode: string;
    viewerRole: string;
  }) => (
    <div data-testid="race-arena" data-room={roomPublicId} data-code={roomCode} data-role={viewerRole} />
  ),
}));

const { notFound, redirect } = jest.requireMock('next/navigation') as {
  notFound: jest.Mock;
  redirect: jest.Mock;
};
const getRoomForPageMock = getRoomForPage as jest.Mock;
const getViewerMembershipMock = getViewerMembership as jest.Mock;
const getUserFullProfileMock = getUserFullProfile as jest.Mock;
const getSessionMock = getSession as jest.Mock;
const getGuestSessionMock = getGuestSession as jest.Mock;

const ROOM_PUBLIC_ID = '11111111-1111-4111-8111-111111111111';
const USER_PUBLIC_ID = '22222222-2222-4222-8222-222222222222';

function roomView() {
  return {
    publicId: ROOM_PUBLIC_ID,
    code: 'DWRF42',
    visibility: 'public',
    status: 'en_course',
    capacity: 6,
    config: defaultRoomConfig,
    hostPublicId: USER_PUBLIC_ID,
    hostName: 'ada',
    participantCount: 2,
    createdAt: new Date('2026-11-07T20:00:00.000Z'),
  };
}

async function renderPage(publicId: string): Promise<void> {
  const element = await RaceArenaPage({ params: Promise.resolve({ publicId }) });
  render(element);
}

beforeEach(() => {
  jest.clearAllMocks();
  getSessionMock.mockResolvedValue(null);
  getGuestSessionMock.mockResolvedValue(null);
});

describe('RaceArenaPage (/race/[publicId])', () => {
  test('renders the arena with the room code and the member role', async () => {
    getRoomForPageMock.mockResolvedValue(roomView());
    getSessionMock.mockResolvedValue({ publicId: USER_PUBLIC_ID, username: 'ada' });
    getUserFullProfileMock.mockResolvedValue({
      id: 1,
      publicId: USER_PUBLIC_ID,
      username: 'ada',
      bestWpm: '50',
    });
    getViewerMembershipMock.mockResolvedValue({ role: 'participant' });

    await renderPage(ROOM_PUBLIC_ID);

    const arena = screen.getByTestId('race-arena');
    expect(arena).toHaveAttribute('data-room', ROOM_PUBLIC_ID);
    expect(arena).toHaveAttribute('data-code', 'DWRF42');
    expect(arena).toHaveAttribute('data-role', 'participant');
  });

  test('maps a spectator membership to the spectator role', async () => {
    getRoomForPageMock.mockResolvedValue(roomView());
    getSessionMock.mockResolvedValue({ publicId: USER_PUBLIC_ID, username: 'ada' });
    getUserFullProfileMock.mockResolvedValue({
      id: 1,
      publicId: USER_PUBLIC_ID,
      username: 'ada',
      bestWpm: null,
    });
    getViewerMembershipMock.mockResolvedValue({ role: 'spectator' });

    await renderPage(ROOM_PUBLIC_ID);

    expect(screen.getByTestId('race-arena')).toHaveAttribute('data-role', 'spectator');
  });

  test('answers 404 for a missing room', async () => {
    getRoomForPageMock.mockResolvedValue(null);

    await expect(renderPage(ROOM_PUBLIC_ID)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  test('redirects a non-member home', async () => {
    getRoomForPageMock.mockResolvedValue(roomView());
    getSessionMock.mockResolvedValue({ publicId: USER_PUBLIC_ID, username: 'ada' });
    getUserFullProfileMock.mockResolvedValue({
      id: 1,
      publicId: USER_PUBLIC_ID,
      username: 'ada',
      bestWpm: null,
    });
    getViewerMembershipMock.mockResolvedValue(null);

    await expect(renderPage(ROOM_PUBLIC_ID)).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/');
  });

  test('redirects an anonymous viewer home', async () => {
    getRoomForPageMock.mockResolvedValue(roomView());

    await expect(renderPage(ROOM_PUBLIC_ID)).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/');
  });
});
