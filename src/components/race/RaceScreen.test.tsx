import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MESSAGES } from '../../i18n/messages';
import { defaultRoomConfig } from '../../lib/room-config';
import type { RaceResultEntry } from '../../realtime/protocol';
import type { RaceView } from '../../realtime/client-types';
import RaceScreen, {
  countdownSecondsRemaining,
  type RaceScreenProps,
} from './RaceScreen';

/**
 * COURSE-02/03/07 + GAME-1: the race screen derives the countdown from
 * `startAt` and the client clock, gates the host's start button, renders the
 * spectator view (no typing zone), runs the confirmed quit flow with an
 * instant local spectator switch, and shows the clearly-marked provisional
 * results placeholder.
 */

const messages = MESSAGES.fr;
const T0 = Date.parse('2026-11-08T12:00:00.000Z');
const ADA = '22222222-2222-4222-8222-222222222222';

function makeRace(overrides: Partial<RaceView> = {}): RaceView {
  return {
    phase: 'decompte',
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
    ...overrides,
  };
}

function makeResult(overrides: Partial<RaceResultEntry> = {}): RaceResultEntry {
  return {
    participantId: '99999999-9999-4999-8999-999999999999',
    displayName: 'rival',
    kind: 'user',
    wpm: 30,
    rawWpm: 33,
    accuracy: 92,
    errors: 2,
    status: 'finished',
    finishedAtMs: 20_000,
    rank: 1,
    ...overrides,
  };
}

const onStartRace = jest.fn();
const onQuitRace = jest.fn();
const onSendProgress = jest.fn();

function renderScreen(overrides: Partial<RaceScreenProps> = {}) {
  const props: RaceScreenProps = {
    roomStatus: 'en_attente',
    race: null,
    config: defaultRoomConfig,
    viewerRole: 'participant',
    isHost: false,
    participantCount: 2,
    viewerParticipantId: ADA,
    messages,
    onStartRace,
    onQuitRace,
    onSendProgress,
    ...overrides,
  };
  return render(<RaceScreen {...props} />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('countdownSecondsRemaining (client-side COURSE-03)', () => {
  test('is null without a typing start', () => {
    expect(countdownSecondsRemaining(null, T0)).toBeNull();
  });

  test('counts 3, 2, 1 and clamps at 0 (same math as the server helper)', () => {
    const startAt = new Date(T0 + 3_000).toISOString();
    expect(countdownSecondsRemaining(startAt, T0)).toBe(3);
    expect(countdownSecondsRemaining(startAt, T0 + 1_000)).toBe(2);
    expect(countdownSecondsRemaining(startAt, T0 + 2_000)).toBe(1);
    expect(countdownSecondsRemaining(startAt, T0 + 2_900)).toBe(1);
    expect(countdownSecondsRemaining(startAt, T0 + 3_000)).toBe(0);
    expect(countdownSecondsRemaining(startAt, T0 + 9_000)).toBe(0);
  });

  test('clamps late joins to 3', () => {
    expect(countdownSecondsRemaining(new Date(T0 + 9_000).toISOString(), T0)).toBe(3);
  });
});

describe('waiting panel (en_attente, COURSE-02 UI)', () => {
  test('the host starts with enough participants', () => {
    renderScreen({ isHost: true, participantCount: 2 });
    const button = screen.getByRole('button', { name: messages['race.startButton'] });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onStartRace).toHaveBeenCalledTimes(1);
  });

  test('the start button is disabled with a reason under 2 racers', () => {
    renderScreen({ isHost: true, participantCount: 1 });
    const button = screen.getByRole('button', { name: messages['race.startButton'] });
    expect(button).toBeDisabled();
    expect(screen.getByTestId('race-need-participants')).toHaveTextContent(
      messages['race.needParticipants'],
    );
  });

  test('non-hosts see the waiting message and no start button', () => {
    renderScreen({ isHost: false, participantCount: 2 });
    expect(screen.getByText(messages['race.waitingHost'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: messages['race.startButton'] })).not.toBeInTheDocument();
  });
});

describe('countdown overlay (decompte, COURSE-03)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: T0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('derives 3-2-1 from startAt and the client clock, with the text revealed', () => {
    renderScreen({
      roomStatus: 'decompte',
      race: makeRace({
        phase: 'decompte',
        startAt: new Date(T0 + 3_000).toISOString(),
        text: 'bonjour les nains',
        totalLength: 17,
        ownProgress: { validatedChars: 0, correctKeystrokes: 0, totalKeystrokes: 0 },
      }),
      viewerRole: 'participant',
    });

    expect(screen.getByTestId('countdown-number')).toHaveTextContent('3');
    expect(screen.getByText(messages['race.countdownGetReady'])).toBeInTheDocument();
    // GAME-1/COURSE-03: the same payload text is rendered during the countdown.
    expect(screen.getByTestId('race-text')).toHaveTextContent('bonjour les nains');
    // No typing input before EN_COURSE.
    expect(screen.queryByTestId('typing-input')).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(screen.getByTestId('countdown-number')).toHaveTextContent('2');

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(screen.getByTestId('countdown-number')).toHaveTextContent('1');
  });
});

describe('en_course views (GAME-1, COURSE-07)', () => {
  const racingRace = () =>
    makeRace({
      phase: 'en_course',
      startAt: new Date(T0 + 3_000).toISOString(),
      text: 'bonjour',
      totalLength: 7,
      ownProgress: { validatedChars: 0, correctKeystrokes: 0, totalKeystrokes: 0 },
    });

  test('a racing participant gets the typing zone and the quit button', () => {
    renderScreen({ roomStatus: 'en_course', race: racingRace(), viewerRole: 'participant' });
    expect(screen.getByTestId('typing-zone')).toBeInTheDocument();
    expect(screen.getByTestId('typing-input')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: messages['race.quitButton'] })).toBeInTheDocument();
  });

  test('spectators see the text and a badge, but no typing zone', () => {
    renderScreen({ roomStatus: 'en_course', race: racingRace(), viewerRole: 'spectator' });
    expect(screen.getByTestId('spectator-badge')).toHaveTextContent(messages['race.spectatorBadge']);
    expect(screen.getByText(messages['race.spectatorViewHint'])).toBeInTheDocument();
    expect(screen.getByTestId('race-text')).toHaveTextContent('bonjour');
    expect(screen.queryByTestId('typing-zone')).not.toBeInTheDocument();
    expect(screen.queryByTestId('typing-input')).not.toBeInTheDocument();
  });

  test('quitting needs a confirmation, then switches to spectator instantly', () => {
    renderScreen({ roomStatus: 'en_course', race: racingRace(), viewerRole: 'participant' });

    fireEvent.click(screen.getByRole('button', { name: messages['race.quitButton'] }));
    expect(screen.getByTestId('quit-confirm')).toHaveTextContent(messages['race.confirmQuitBody']);
    expect(onQuitRace).not.toHaveBeenCalled();

    // Cancel keeps the typing zone.
    fireEvent.click(screen.getByRole('button', { name: messages['lobby.cancel'] }));
    expect(screen.queryByTestId('quit-confirm')).not.toBeInTheDocument();
    expect(screen.getByTestId('typing-zone')).toBeInTheDocument();

    // Confirm quits: the server is told and the local view is spectator right away.
    fireEvent.click(screen.getByRole('button', { name: messages['race.quitButton'] }));
    fireEvent.click(screen.getByRole('button', { name: messages['lobby.confirm'] }));
    expect(onQuitRace).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('spectator-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('typing-zone')).not.toBeInTheDocument();
  });
});

describe('provisional results placeholder (resultats)', () => {
  test('shows the top-3, the own line and the provisional marker', () => {
    renderScreen({
      roomStatus: 'resultats',
      race: makeRace({
        phase: 'resultats',
        text: 'bonjour',
        totalLength: 7,
        finished: {
          durationMs: 45_000,
          results: [
            makeResult({ rank: 1, displayName: 'rival', wpm: 45 }),
            makeResult({ rank: 2, participantId: '88888888-8888-4888-8888-888888888888', displayName: 'bob', wpm: 40 }),
            makeResult({ rank: 3, participantId: '77777777-7777-4777-8777-777777777777', displayName: 'carl', wpm: 35, status: 'timeout' }),
            makeResult({ rank: 4, participantId: ADA, displayName: 'ada', wpm: 42, accuracy: 97, status: 'finished' }),
          ],
        },
      }),
    });

    expect(screen.getByText(messages['race.resultsTitle'])).toBeInTheDocument();
    expect(screen.getByTestId('results-provisional')).toHaveTextContent(
      messages['race.resultsProvisional'],
    );
    // Top 3 only (the own 4th line is rendered separately).
    expect(screen.getByText('1. rival')).toBeInTheDocument();
    expect(screen.getByText('2. bob')).toBeInTheDocument();
    expect(screen.getByText('3. carl')).toBeInTheDocument();
    expect(screen.queryByText(/4\./)).not.toBeInTheDocument();
    // Own stats line (rank 4 is still the viewer's own race).
    expect(screen.getByText(messages['race.resultsYourRace'])).toBeInTheDocument();
    expect(screen.getByText('MPM: 42')).toBeInTheDocument();
    expect(screen.getByText('Précision: 97%')).toBeInTheDocument();
    expect(screen.getByText(messages['race.results.status.finished'])).toBeInTheDocument();
    // The text stays visible on the results screen.
    expect(screen.getByTestId('race-text')).toHaveTextContent('bonjour');
  });

  test('hides the own line when the viewer has no result entry', () => {
    renderScreen({
      roomStatus: 'resultats',
      race: makeRace({
        phase: 'resultats',
        text: 'bonjour',
        totalLength: 7,
        finished: {
          durationMs: 45_000,
          results: [makeResult({ rank: 1, displayName: 'rival' })],
        },
      }),
    });
    expect(screen.queryByText(messages['race.resultsYourRace'])).not.toBeInTheDocument();
  });

  test('renders the provisional marker even before raceFinished arrives', () => {
    renderScreen({
      roomStatus: 'resultats',
      race: makeRace({ phase: 'resultats', text: 'bonjour', totalLength: 7, finished: null }),
    });
    expect(screen.getByTestId('results-provisional')).toBeInTheDocument();
  });
});
