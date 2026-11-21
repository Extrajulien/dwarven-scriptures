import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { closeRoom, leaveRoom } from '../../app/rooms/actions';
import { MESSAGES } from '../../i18n/messages';
import { defaultRoomConfig } from '../../lib/room-config';
import { storeRaceKeyErrors } from '../../lib/race/key-errors-store';
import type { RaceSocketState, RaceView, RoomSnapshot } from '../../realtime/client-types';
import type { RaceResultEntry, RoomStatus } from '../../realtime/protocol';
import RaceResultsView, { type RaceResultsViewer } from './RaceResultsView';

/**
 * The dedicated results view (`/rooms/[publicId]/results`, RES-01..04,
 * COURSE-11): joins by room code, renders only the results screen from the
 * replayed `raceFinished`, shows the host's close / others' leave controls,
 * reads the local per-key heatmap from session storage, and bounces the
 * member out on relaunch/close/kick.
 */

const messages = MESSAGES.fr;
const ROOM_ID = '11111111-1111-4111-8111-111111111111';
const ADA_ID = '22222222-2222-4222-8222-222222222222';
const BOB_ID = '33333333-3333-4333-8333-333333333333';

const mockJoin = jest.fn();
const mockLeave = jest.fn();
const mockReplace = jest.fn();

let socketState: RaceSocketState = { status: 'idle', snapshot: null, error: null, race: null };

jest.mock('../../realtime/useRoomSocket', () => ({
  useRoomSocket: () => ({
    ...socketState,
    join: mockJoin,
    leave: mockLeave,
    sendPing: jest.fn(),
    startRace: jest.fn(),
    quitRace: jest.fn(),
    sendRaceProgress: jest.fn(),
    updateRoomHost: jest.fn(),
  }),
}));

jest.mock('../../app/rooms/actions', () => ({
  closeRoom: jest.fn(),
  leaveRoom: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), refresh: jest.fn() }),
}));

const mockedCloseRoom = jest.mocked(closeRoom);
const mockedLeaveRoom = jest.mocked(leaveRoom);

function makeSnapshot(status: RoomStatus, hostPublicId: string = ADA_ID): RoomSnapshot {
  return {
    room: {
      publicId: ROOM_ID,
      code: 'DWRF42',
      visibility: 'public',
      status,
      capacity: 6,
      config: defaultRoomConfig,
      host: { publicId: hostPublicId, username: hostPublicId === ADA_ID ? 'ada' : 'bob' },
      createdAt: '2026-11-07T20:00:00.000Z',
    },
    members: [
      {
        kind: 'user',
        publicId: ADA_ID,
        username: 'ada',
        pfpUrl: null,
        role: 'participant',
        joinedAt: '2026-11-07T21:00:00.000Z',
        connected: true,
      },
    ],
  };
}

function makeRace(overrides: Partial<RaceView> = {}): RaceView {
  return {
    phase: 'resultats',
    startedAt: null,
    startAt: null,
    textId: null,
    text: null,
    totalLength: null,
    ownProgress: null,
    participants: [],
    lastTickAt: null,
    finishRanks: {},
    finished: null,
    bonusLog: [],
    ...overrides,
  };
}

function makeResult(overrides: Partial<RaceResultEntry> = {}): RaceResultEntry {
  return {
    participantId: ADA_ID,
    displayName: 'ada',
    kind: 'user',
    wpm: 42,
    rawWpm: 46,
    accuracy: 94,
    errors: 3,
    status: 'finished',
    finishedAtMs: 20_000,
    rank: 1,
    bonusesReceived: 0,
    wpmSeries: [],
    ...overrides,
  };
}

const viewer: RaceResultsViewer = { kind: 'user', publicId: ADA_ID, username: 'ada' };

function renderView(options: {
  status?: RoomStatus;
  hostPublicId?: string;
  race?: RaceView | null;
  role?: 'participant' | 'spectator';
} = {}) {
  socketState = {
    status: 'open',
    snapshot: makeSnapshot(options.status ?? 'resultats', options.hostPublicId),
    error: null,
    race: options.race ?? makeRace(),
  };
  return render(
    <RaceResultsView
      roomPublicId={ROOM_ID}
      roomCode="DWRF42"
      viewer={viewer}
      viewerRole={options.role ?? 'participant'}
      viewerBestWpm={null}
      messages={messages}
      locale="fr"
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
  socketState = { status: 'idle', snapshot: null, error: null, race: null };
});

describe('RaceResultsView join and results rendering', () => {
  test('joins the room by code on mount', () => {
    render(
      <RaceResultsView
        roomPublicId={ROOM_ID}
        roomCode="DWRF42"
        viewer={viewer}
        viewerRole="participant"
        viewerBestWpm={null}
        messages={messages}
        locale="fr"
      />,
    );
    expect(mockJoin).toHaveBeenCalledWith({ code: 'DWRF42' });
  });

  test('renders only the results screen when the finished payload arrives', () => {
    renderView({
      race: makeRace({
        phase: 'resultats',
        finished: {
          durationMs: 45_000,
          results: [
            makeResult(),
            makeResult({ rank: 2, participantId: BOB_ID, displayName: 'bob', wpm: 40 }),
          ],
        },
      }),
    });

    expect(screen.getByTestId('results-podium')).toBeInTheDocument();
    expect(screen.getByTestId('results-table')).toBeInTheDocument();
    expect(screen.getAllByTestId('results-row')).toHaveLength(2);
  });

  test('a resultats room with no payload shows the honest unavailable state', () => {
    renderView({ race: null });
    expect(screen.getByTestId('results-unavailable')).toHaveTextContent(
      messages['results.unavailableHint'],
    );
    expect(screen.getByRole('button', { name: messages['results.returnToRoom'] })).toBeInTheDocument();
  });
});

describe('RaceResultsView controls (COURSE-11)', () => {
  const finishedRace = () =>
    makeRace({
      phase: 'resultats',
      finished: {
        durationMs: 45_000,
        results: [
          makeResult(),
          makeResult({ rank: 2, participantId: BOB_ID, displayName: 'bob', wpm: 40 }),
        ],
      },
    });

  test('the host sees close', () => {
    const { unmount } = renderView({ hostPublicId: ADA_ID, race: finishedRace() });
    expect(screen.getByRole('button', { name: messages['results.closeRoom'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: messages['results.leave'] })).not.toBeInTheDocument();
    unmount();
  });

  test('everyone else sees leave', () => {
    renderView({ hostPublicId: BOB_ID, race: finishedRace() });
    expect(screen.getByRole('button', { name: messages['results.leave'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: messages['results.closeRoom'] })).not.toBeInTheDocument();
  });

  test('return-to-room navigates back to the lobby', () => {
    renderView({ race: finishedRace() });
    fireEvent.click(screen.getByRole('button', { name: messages['results.returnToRoom'] }));
    expect(mockReplace).toHaveBeenCalledWith(`/rooms/${ROOM_ID}`);
  });

  test('the host closes the room after the confirm, then leaves the socket', async () => {
    renderView({ hostPublicId: ADA_ID, race: finishedRace() });

    fireEvent.click(screen.getByRole('button', { name: messages['results.closeRoom'] }));
    expect(mockedCloseRoom).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: messages['lobby.confirm'] }));

    expect(mockedCloseRoom).toHaveBeenCalledWith({ roomPublicId: ROOM_ID });
    await Promise.resolve();
    expect(mockLeave).toHaveBeenCalledTimes(1);
  });

  test('a non-host leaves the room after the confirm', async () => {
    renderView({ hostPublicId: BOB_ID, race: finishedRace() });

    fireEvent.click(screen.getByRole('button', { name: messages['results.leave'] }));
    expect(mockedLeaveRoom).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: messages['lobby.confirm'] }));

    expect(mockedLeaveRoom).toHaveBeenCalledWith({ roomPublicId: ROOM_ID });
    await Promise.resolve();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});

describe('RaceResultsView heatmap source (RES-03)', () => {
  const finishedRace = () =>
    makeRace({
      phase: 'resultats',
      finished: {
        durationMs: 45_000,
        results: [
          makeResult(),
          makeResult({ rank: 2, participantId: BOB_ID, displayName: 'bob', wpm: 40 }),
        ],
      },
    });

  test('a participant reads their session-storage key errors', () => {
    storeRaceKeyErrors(ROOM_ID, { a: 1, k: 7 });
    renderView({ race: finishedRace(), role: 'participant' });

    expect(screen.getByTestId('results-heatmap-weakest')).toHaveTextContent('K');
    expect(screen.queryByTestId('results-heatmap-no-errors')).not.toBeInTheDocument();
  });

  test('a spectator never sees a fabricated keyboard heatmap', () => {
    storeRaceKeyErrors(ROOM_ID, { a: 1, k: 7 });
    renderView({ race: finishedRace(), role: 'spectator' });

    expect(screen.getByTestId('results-heatmap-unavailable')).toBeInTheDocument();
  });
});

describe('RaceResultsView navigation', () => {
  test('a relaunch (en_course) sends the member to the arena', () => {
    renderView({
      status: 'resultats',
      race: makeRace({ phase: 'en_course' }),
    });
    expect(mockReplace).toHaveBeenCalledWith(`/race/${ROOM_ID}`);
  });

  test('a waiting room sends the member back to the lobby', () => {
    renderView({ status: 'en_attente', race: null });
    expect(mockReplace).toHaveBeenCalledWith(`/rooms/${ROOM_ID}`);
  });

  test('a kicked member is sent home with a notice', () => {
    socketState = {
      status: 'closed',
      snapshot: null,
      error: { code: 'kicked', message: 'you were kicked from the room', fatal: true },
      race: null,
    };
    render(
      <RaceResultsView
        roomPublicId={ROOM_ID}
        roomCode="DWRF42"
        viewer={viewer}
        viewerRole="participant"
        viewerBestWpm={null}
        messages={messages}
        locale="fr"
      />,
    );
    expect(mockReplace).toHaveBeenCalledWith('/race?notice=kicked');
  });
});
