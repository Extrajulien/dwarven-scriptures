import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MESSAGES } from '../../i18n/messages';
import { defaultRoomConfig } from '../../lib/room-config';
import type { RaceSocketState, RaceView, RoomSnapshot } from '../../realtime/client-types';
import type { RoomStatus } from '../../realtime/protocol';
import RaceArena, { type RaceArenaViewer } from './RaceArena';

/**
 * The minimal race arena (`/race/[publicId]`): joins by room code, shows only
 * the progress track + typing zone + give-up button for a racing participant,
 * the spectator badge for everyone else, and bounces the member back to the
 * room when the race ends.
 */

const messages = MESSAGES.fr;
const ROOM_ID = '11111111-1111-4111-8111-111111111111';
const ADA_ID = '22222222-2222-4222-8222-222222222222';
const BOB_ID = '33333333-3333-4333-8333-333333333333';

const mockJoin = jest.fn();
const mockQuitRace = jest.fn();
const mockSendProgress = jest.fn();
const mockReplace = jest.fn();

let socketState: RaceSocketState = { status: 'idle', snapshot: null, error: null, race: null };

jest.mock('../../realtime/useRoomSocket', () => ({
  useRoomSocket: () => ({
    ...socketState,
    join: mockJoin,
    leave: jest.fn(),
    sendPing: jest.fn(),
    startRace: jest.fn(),
    quitRace: mockQuitRace,
    sendRaceProgress: mockSendProgress,
    updateRoomHost: jest.fn(),
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), refresh: jest.fn() }),
}));

const viewer: RaceArenaViewer = { kind: 'user', publicId: ADA_ID, username: 'ada' };

function makeSnapshot(status: RoomStatus = 'en_course'): RoomSnapshot {
  return {
    room: {
      publicId: ROOM_ID,
      code: 'DWRF42',
      visibility: 'public',
      status,
      capacity: 6,
      config: defaultRoomConfig,
      host: { publicId: ADA_ID, username: 'ada' },
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
    phase: 'en_course',
    startedAt: null,
    startAt: null,
    textId: null,
    text: 'bonjour',
    totalLength: 7,
    ownProgress: { validatedChars: 0, correctKeystrokes: 0, totalKeystrokes: 0 },
    participants: [],
    lastTickAt: null,
    finishRanks: {},
    finished: null,
    bonusLog: [],
    ...overrides,
  };
}

function renderArena(options: {
  status?: RoomStatus;
  race?: RaceView;
  role?: 'participant' | 'spectator';
} = {}) {
  const status = options.status ?? 'en_course';
  const race = options.race ?? makeRace();
  socketState = { status: 'open', snapshot: makeSnapshot(status), error: null, race };
  return render(
    <RaceArena
      roomPublicId={ROOM_ID}
      roomCode="DWRF42"
      viewer={viewer}
      viewerRole={options.role ?? 'participant'}
      messages={messages}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  socketState = { status: 'idle', snapshot: null, error: null, race: null };
});

describe('RaceArena join and navigation', () => {
  test('joins the room by code on mount', () => {
    renderArena();
    expect(mockJoin).toHaveBeenCalledWith({ code: 'DWRF42' });
  });

  test('redirects back to the room when the race finishes', () => {
    socketState = {
      status: 'open',
      snapshot: makeSnapshot('resultats'),
      error: null,
      race: makeRace({ phase: 'resultats', finished: { durationMs: 1_000, results: [] } }),
    };
    render(
      <RaceArena
        roomPublicId={ROOM_ID}
        roomCode="DWRF42"
        viewer={viewer}
        viewerRole="participant"
        messages={messages}
      />,
    );
    expect(mockReplace).toHaveBeenCalledWith(`/rooms/${ROOM_ID}`);
  });

  test('redirects a kicked member home with a notice (SALLE-07)', () => {
    socketState = {
      status: 'closed',
      snapshot: null,
      error: { code: 'kicked', message: 'you were kicked from the room', fatal: true },
      race: null,
    };
    render(
      <RaceArena
        roomPublicId={ROOM_ID}
        roomCode="DWRF42"
        viewer={viewer}
        viewerRole="participant"
        messages={messages}
      />,
    );
    expect(mockReplace).toHaveBeenCalledWith('/race?notice=kicked');
  });
});

describe('RaceArena racing surface', () => {
  test('a racing participant sees the track block, typing zone and give-up button', () => {
    renderArena({
      race: makeRace({
        participants: [
          {
            participantId: BOB_ID,
            kind: 'user',
            displayName: 'bob',
            position: 3,
            wpm: 18,
            finished: false,
            totalLength: 7,
          },
        ],
      }),
    });

    expect(screen.getByTestId('progress-track')).toBeInTheDocument();
    // GAME-2: the live top-3 panel rides above the track on the arena too.
    expect(screen.getByTestId('top3-panel')).toBeInTheDocument();
    expect(screen.getByTestId('typing-zone')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: messages['race.quitButton'] })).toBeInTheDocument();
  });

  test('a spectator sees the badge but no typing zone or give-up button', () => {
    renderArena({ role: 'spectator', race: makeRace({ ownProgress: null }) });

    expect(screen.getByTestId('spectator-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('typing-zone')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: messages['race.quitButton'] }),
    ).not.toBeInTheDocument();
  });

  test('confirming give up calls quitRace and switches to the spectator view', () => {
    renderArena();

    fireEvent.click(screen.getByRole('button', { name: messages['race.quitButton'] }));
    expect(screen.getByTestId('quit-confirm')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: messages['lobby.confirm'] }));
    expect(mockQuitRace).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('spectator-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('typing-zone')).not.toBeInTheDocument();
  });

  test('cancelling the give-up confirm keeps the typing zone', () => {
    renderArena();

    fireEvent.click(screen.getByRole('button', { name: messages['race.quitButton'] }));
    fireEvent.click(screen.getByRole('button', { name: messages['lobby.cancel'] }));

    expect(mockQuitRace).not.toHaveBeenCalled();
    expect(screen.getByTestId('typing-zone')).toBeInTheDocument();
  });

  test('during the countdown the text is revealed without a typing zone', () => {
    renderArena({
      status: 'decompte',
      race: makeRace({
        phase: 'decompte',
        startAt: new Date(Date.now() + 3_000).toISOString(),
        text: 'bonjour les nains',
        totalLength: 17,
      }),
    });

    expect(screen.getByTestId('countdown-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('race-text')).toHaveTextContent('bonjour les nains');
    expect(screen.queryByTestId('typing-zone')).not.toBeInTheDocument();
  });
});
