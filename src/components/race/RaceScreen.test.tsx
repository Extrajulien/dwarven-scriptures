import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MESSAGES } from '../../i18n/messages';
import { defaultRoomConfig } from '../../lib/room-config';
import type { BonusAppliedMessage, RaceResultEntry } from '../../realtime/protocol';
import type { RaceView } from '../../realtime/client-types';
import { installMatchMedia } from '../../testing/matchMediaMock';
import { BONUS_BANNER_DISMISS_MS } from './BonusAnnouncer';
import RaceScreen, {
  BONUS_MARKER_FLASH_MS,
  countdownSecondsRemaining,
  type RaceScreenProps,
} from './RaceScreen';

/**
 * COURSE-02/03/07 + GAME-1: the race screen derives the countdown from
 * `startAt` and the client clock, gates the host's start button, renders the
 * spectator view (no typing zone), runs the confirmed quit flow with an
 * instant local spectator switch, and shows the full results screen on
 * `raceFinished` (RES-01..04) or the honest "unavailable" state for late
 * joiners.
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
    bonusLog: [],
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
    bonusesReceived: 0,
    wpmSeries: [],
    ...overrides,
  };
}

const onStartRace = jest.fn();
const onQuitRace = jest.fn();
const onSendProgress = jest.fn();
const onCloseRoom = jest.fn();
const onLeaveRoom = jest.fn();

function renderScreen(overrides: Partial<RaceScreenProps> = {}) {
  const props: RaceScreenProps = {
    roomStatus: 'en_attente',
    race: null,
    config: defaultRoomConfig,
    viewerRole: 'participant',
    isHost: false,
    participantCount: 2,
    viewerParticipantId: ADA,
    bestWpm: null,
    messages,
    locale: 'fr',
    onStartRace,
    onQuitRace,
    onSendProgress,
    onCloseRoom,
    onLeaveRoom,
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
  const racingRace = (overrides: Partial<RaceView> = {}) =>
    makeRace({
      phase: 'en_course',
      startAt: new Date(T0 + 3_000).toISOString(),
      text: 'bonjour',
      totalLength: 7,
      ownProgress: { validatedChars: 0, correctKeystrokes: 0, totalKeystrokes: 0 },
      ...overrides,
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

  test('spectators keep the track and live top-3 without the typing zone (COURSE-05, GAME-2)', () => {
    renderScreen({
      roomStatus: 'en_course',
      race: racingRace({
        totalLength: 1_000,
        lastTickAt: new Date(T0 + 500).toISOString(),
        participants: [
          {
            participantId: '88888888-8888-4888-8888-888888888888',
            kind: 'user',
            displayName: 'bob',
            position: 600,
            wpm: 50,
            finished: false,
            totalLength: 1_000,
          },
          { participantId: ADA, kind: 'user', displayName: 'ada', position: 300, wpm: 30, finished: false, totalLength: 1_000 },
        ],
      }),
      viewerRole: 'spectator',
    });

    expect(screen.getByTestId('progress-track')).toBeInTheDocument();
    expect(screen.getByTestId('top3-panel')).toBeInTheDocument();
    expect(screen.getByTestId('spectator-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('typing-zone')).not.toBeInTheDocument();
    expect(screen.queryByTestId('typing-input')).not.toBeInTheDocument();
  });

  test('racing participants see the track above the typing zone (COURSE-05)', () => {
    renderScreen({
      roomStatus: 'en_course',
      race: racingRace({
        totalLength: 1_000,
        lastTickAt: new Date(T0 + 500).toISOString(),
        participants: [
          { participantId: ADA, kind: 'user', displayName: 'ada', position: 300, wpm: 30, finished: false, totalLength: 1_000 },
          {
            participantId: '88888888-8888-4888-8888-888888888888',
            kind: 'user',
            displayName: 'bob',
            position: 600,
            wpm: 50,
            finished: false,
            totalLength: 1_000,
          },
        ],
      }),
      viewerRole: 'participant',
    });

    const track = screen.getByTestId('progress-track');
    const typingZone = screen.getByTestId('typing-zone');
    expect(track).toBeInTheDocument();
    expect(typingZone).toBeInTheDocument();
    // The track block sits above the typing zone in the flow.
    expect(track.compareDocumentPosition(typingZone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

describe('bonus announcements and track flash (BONUS-03)', () => {
  const BOB = '88888888-8888-4888-8888-888888888888';

  function bonusEvent(
    bonusType: BonusAppliedMessage['bonusType'],
    targetParticipantId: string,
    payload: Partial<BonusAppliedMessage['payload']> = {},
  ): BonusAppliedMessage {
    return {
      type: 'bonusApplied',
      roomPublicId: '8f9c2a55-3b4a-4c1e-8a2d-9e7f6a5b4c3d',
      targetParticipantId,
      bonusType,
      payload: { totalLength: 7, at: '2026-11-08T18:00:10.000Z', ...payload },
    };
  }

  const racingWithBonus = (bonusLog: BonusAppliedMessage[]) =>
    makeRace({
      phase: 'en_course',
      startAt: new Date(T0 + 3_000).toISOString(),
      text: 'bonjour',
      totalLength: 7,
      ownProgress: { validatedChars: 0, correctKeystrokes: 0, totalKeystrokes: 0 },
      lastTickAt: new Date(T0 + 500).toISOString(),
      participants: [
        {
          participantId: ADA,
          kind: 'user',
          displayName: 'ada',
          position: 2,
          wpm: 20,
          finished: false,
          totalLength: 7,
        },
        {
          participantId: BOB,
          kind: 'user',
          displayName: 'bob',
          position: 4,
          wpm: 40,
          finished: false,
          totalLength: 7,
        },
      ],
      bonusLog,
    });

  test('the targeted local player sees the banner and a glowing marker, both timer-cleared', () => {
    jest.useFakeTimers({ now: T0 });
    try {
      renderScreen({
        roomStatus: 'en_course',
        race: racingWithBonus([bonusEvent('removeWords', ADA, { wordCount: 3, totalLength: 5 })]),
        viewerRole: 'participant',
      });

      const banner = screen.getByTestId('bonus-banner');
      expect(banner).toHaveAttribute('aria-live', 'polite');
      expect(banner).toHaveTextContent('−3 mots');
      expect(banner).toHaveTextContent(messages['bonus.banner.removeWords']);
      expect(screen.getByTestId(`track-marker-${ADA}`)).toHaveAttribute(
        'data-bonus-flash',
        'true',
      );
      expect(screen.getByTestId(`track-marker-${BOB}`)).toHaveAttribute(
        'data-bonus-flash',
        'false',
      );

      // The marker glow clears after ~2 s; the banner outlives it.
      act(() => {
        jest.advanceTimersByTime(BONUS_MARKER_FLASH_MS);
      });
      expect(screen.getByTestId(`track-marker-${ADA}`)).toHaveAttribute(
        'data-bonus-flash',
        'false',
      );
      expect(screen.getByTestId('bonus-banner')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(BONUS_BANNER_DISMISS_MS);
      });
      expect(screen.queryByTestId('bonus-banner')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test('observers see the feed line for events targeting others, and no banner', () => {
    renderScreen({
      roomStatus: 'en_course',
      race: racingWithBonus([bonusEvent('addWords', BOB, { words: ['nain'], totalLength: 9 })]),
      viewerRole: 'spectator',
    });

    expect(screen.queryByTestId('bonus-banner')).not.toBeInTheDocument();
    const line = screen.getByTestId('bonus-feed-line');
    expect(line).toHaveTextContent('bob');
    expect(line).toHaveTextContent('+1 mots');
    expect(screen.getByTestId(`track-marker-${BOB}`)).toHaveAttribute(
      'data-bonus-flash',
      'true',
    );
  });
});

describe('results screen (resultats, RES-01..04)', () => {
  test('renders the full results screen from the raceFinished payload', () => {
    renderScreen({
      roomStatus: 'resultats',
      race: makeRace({
        phase: 'resultats',
        finished: {
          durationMs: 45_000,
          results: [
            makeResult({ rank: 1, displayName: 'rival', wpm: 45, wpmSeries: [{ elapsedMs: 1_000, wpm: 40 }, { elapsedMs: 20_000, wpm: 45 }] }),
            makeResult({ rank: 2, participantId: '88888888-8888-4888-8888-888888888888', displayName: 'bob', wpm: 40, status: 'timeout' }),
            makeResult({ rank: 3, participantId: '77777777-7777-4777-8777-777777777777', displayName: 'carl', wpm: 35, status: 'quit' }),
            makeResult({ rank: 4, participantId: ADA, displayName: 'ada', wpm: 42, accuracy: 97, status: 'finished' }),
          ],
        },
      }),
    });

    expect(screen.getByText(messages['results.title'])).toBeInTheDocument();
    // Podium + full table render.
    expect(screen.getByTestId('results-podium')).toBeInTheDocument();
    expect(screen.getByTestId('results-table')).toBeInTheDocument();
    expect(screen.getAllByTestId('results-row')).toHaveLength(4);
    // The chart renders a line for the participant with a series.
    expect(screen.getByTestId('results-wpm-chart-line')).toBeInTheDocument();
    // The local participant raced: their heatmap renders (empty = clean race).
    expect(screen.getByTestId('results-heatmap-no-errors')).toBeInTheDocument();
  });

  test('a late joiner sees the honest unavailable state (no raceFinished payload)', () => {
    renderScreen({
      roomStatus: 'resultats',
      race: null,
    });
    expect(screen.getByTestId('results-unavailable')).toHaveTextContent(
      messages['results.unavailableHint'],
    );
    expect(screen.queryByTestId('results-podium')).not.toBeInTheDocument();
    expect(screen.queryByTestId('results-table')).not.toBeInTheDocument();
  });

  test('a spectator never sees a fabricated keyboard heatmap', () => {
    renderScreen({
      roomStatus: 'resultats',
      viewerRole: 'spectator',
      race: makeRace({
        phase: 'resultats',
        finished: {
          durationMs: 45_000,
          results: [
            makeResult({ rank: 1, displayName: 'rival' }),
            makeResult({ rank: 2, participantId: ADA, displayName: 'ada' }),
          ],
        },
      }),
    });
    expect(screen.getByTestId('results-heatmap-unavailable')).toBeInTheDocument();
  });

  test('the record indicator appears only when the local wpm beats a prior best (RES-04)', () => {
    const finished = {
      durationMs: 45_000,
      results: [
        makeResult({ rank: 1, displayName: 'rival', wpm: 90 }),
        makeResult({ rank: 2, participantId: ADA, displayName: 'ada', wpm: 42 }),
      ],
    };
    const { unmount } = renderScreen({
      roomStatus: 'resultats',
      bestWpm: 40,
      race: makeRace({ phase: 'resultats', finished }),
    });
    expect(screen.getByTestId('results-record')).toHaveTextContent(
      messages['results.record.beaten'],
    );
    unmount();

    // Not beaten (below the best) → no indicator.
    renderScreen({
      roomStatus: 'resultats',
      bestWpm: 99,
      race: makeRace({ phase: 'resultats', finished }),
    });
    expect(screen.queryByTestId('results-record')).not.toBeInTheDocument();
  });
});

describe('results controls (COURSE-11)', () => {
  const finishedRace = (overrides: Partial<RaceView> = {}) =>
    makeRace({
      phase: 'resultats',
      finished: {
        durationMs: 45_000,
        results: [
          makeResult({ rank: 1, displayName: 'rival', wpm: 50 }),
          makeResult({ rank: 2, participantId: ADA, displayName: 'ada', wpm: 42 }),
        ],
      },
      ...overrides,
    });

  test('the host can relaunch the race and close the room', () => {
    renderScreen({
      roomStatus: 'resultats',
      race: finishedRace(),
      isHost: true,
      participantCount: 2,
    });

    const relaunch = screen.getByRole('button', { name: messages['results.relaunch'] });
    expect(relaunch).toBeEnabled();
    fireEvent.click(relaunch);
    expect(onStartRace).toHaveBeenCalledTimes(1);

    // Closing needs the two-step confirm, like the lobby control.
    fireEvent.click(screen.getByRole('button', { name: messages['results.closeRoom'] }));
    expect(onCloseRoom).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: messages['lobby.confirm'] }));
    expect(onCloseRoom).toHaveBeenCalledTimes(1);
  });

  test('the relaunch button is disabled under 2 participants (COURSE-02)', () => {
    renderScreen({
      roomStatus: 'resultats',
      race: finishedRace(),
      isHost: true,
      participantCount: 1,
    });
    expect(screen.getByRole('button', { name: messages['results.relaunch'] })).toBeDisabled();
    expect(screen.getByTestId('results-need-participants')).toHaveTextContent(
      messages['race.needParticipants'],
    );
  });

  test('non-hosts can stay or leave the room', () => {
    renderScreen({
      roomStatus: 'resultats',
      race: finishedRace(),
      isHost: false,
    });

    expect(screen.getByRole('button', { name: messages['results.stay'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: messages['results.relaunch'] })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: messages['results.leave'] }));
    expect(onLeaveRoom).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: messages['lobby.confirm'] }));
    expect(onLeaveRoom).toHaveBeenCalledTimes(1);
  });
});

describe('mobile race gate integration (DES-06)', () => {
  const racingRace = (overrides: Partial<RaceView> = {}) =>
    makeRace({
      phase: 'en_course',
      startAt: new Date(T0 + 3_000).toISOString(),
      text: 'bonjour',
      totalLength: 7,
      ownProgress: { validatedChars: 0, correctKeystrokes: 0, totalKeystrokes: 0 },
      ...overrides,
    });

  test('mobile racer: notice replaces the typing zone, track + top-3 stay', () => {
    installMatchMedia(true);
    renderScreen({
      roomStatus: 'en_course',
      race: racingRace({
        totalLength: 1_000,
        lastTickAt: new Date(T0 + 500).toISOString(),
        participants: [
          { participantId: ADA, kind: 'user', displayName: 'ada', position: 300, wpm: 30, finished: false, totalLength: 1_000 },
          {
            participantId: '88888888-8888-4888-8888-888888888888',
            kind: 'user',
            displayName: 'bob',
            position: 600,
            wpm: 50,
            finished: false,
            totalLength: 1_000,
          },
        ],
      }),
      viewerRole: 'participant',
    });

    // The typing interaction is gone, replaced by the localized notice.
    expect(screen.getByTestId('mobile-race-notice')).toHaveTextContent(
      messages['mobile.raceTitle'],
    );
    expect(screen.getByTestId('mobile-race-notice')).toHaveTextContent(
      messages['mobile.raceBody'],
    );
    expect(screen.queryByTestId('typing-zone')).not.toBeInTheDocument();
    expect(screen.queryByTestId('typing-input')).not.toBeInTheDocument();
    // Spectator-like viewing: the track and the live top-3 stay visible.
    expect(screen.getByTestId('progress-track')).toBeInTheDocument();
    expect(screen.getByTestId('top3-panel')).toBeInTheDocument();
    // Quit is not typing input: the control stays available on mobile.
    expect(screen.getByRole('button', { name: messages['race.quitButton'] })).toBeInTheDocument();
  });

  test('mobile host: the start button stays available on the waiting screen', () => {
    // Hosting a race from a phone while participants type on keyboards is
    // legitimate — the launch panel is not gated by MobileRaceGate.
    installMatchMedia(true);
    renderScreen({ roomStatus: 'en_attente', race: null, isHost: true, participantCount: 2 });
    const button = screen.getByRole('button', { name: messages['race.startButton'] });
    expect(button).toBeEnabled();
    expect(screen.queryByTestId('mobile-race-notice')).not.toBeInTheDocument();
  });

  test('mobile spectator view is unchanged (it already has no typing zone)', () => {
    installMatchMedia(true);
    renderScreen({ roomStatus: 'en_course', race: racingRace(), viewerRole: 'spectator' });
    expect(screen.getByTestId('spectator-badge')).toBeInTheDocument();
    expect(screen.getByTestId('race-text')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-race-notice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('typing-zone')).not.toBeInTheDocument();
  });
});
