import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { MESSAGES } from '../../i18n/messages';
import type { RaceTrackParticipant } from '../../realtime/client-types';
import OvertakeIndicator, { OVERTAKE_DISMISS_MS } from './OvertakeIndicator';

/**
 * GAME-3: the peripheral overtake warning shows a brief dwarf-styled strip
 * for the LOCAL player's rank changes, announces them through an assertive
 * live region, auto-dismisses after ~2.5 s, and applies "latest wins" when
 * events pile up (no stacking spam).
 */

const messages = MESSAGES.fr;
const T0 = Date.parse('2026-11-08T12:00:00.000Z');
const ADA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CARL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function participant(overrides: Partial<RaceTrackParticipant> = {}): RaceTrackParticipant {
  return {
    participantId: ADA,
    kind: 'user',
    displayName: 'ada',
    position: 0,
    wpm: 0,
    finished: false,
    ...overrides,
  };
}

type Props = React.ComponentProps<typeof OvertakeIndicator>;

function renderIndicator(overrides: Partial<Props> = {}) {
  const props: Props = {
    participants: [],
    localParticipantId: ADA,
    finishRanks: {},
    messages,
    ...overrides,
  };
  return render(<OvertakeIndicator {...props} />);
}

describe('OvertakeIndicator (GAME-3)', () => {
  test('stays silent while the local rank does not change', () => {
    const { rerender } = renderIndicator({
      participants: [
        participant({ participantId: BOB, displayName: 'bob', position: 600, wpm: 60 }),
        participant({ participantId: ADA, displayName: 'ada', position: 400, wpm: 40 }),
      ],
    });
    expect(screen.queryByTestId('overtake-panel')).not.toBeInTheDocument();

    // Both progress, ranks unchanged: still nothing.
    rerender(
      <OvertakeIndicator
        messages={messages}
        localParticipantId={ADA}
        finishRanks={{}}
        participants={[
          participant({ participantId: BOB, displayName: 'bob', position: 700, wpm: 62 }),
          participant({ participantId: ADA, displayName: 'ada', position: 500, wpm: 44 }),
        ]}
      />,
    );
    expect(screen.queryByTestId('overtake-panel')).not.toBeInTheDocument();
  });

  test('shows an overtook panel when the local player passes someone', () => {
    const { rerender } = renderIndicator({
      participants: [
        participant({ participantId: BOB, displayName: 'bob', position: 600, wpm: 60 }),
        participant({ participantId: ADA, displayName: 'ada', position: 400, wpm: 40 }),
      ],
    });
    rerender(
      <OvertakeIndicator
        messages={messages}
        localParticipantId={ADA}
        finishRanks={{}}
        participants={[
          participant({ participantId: ADA, displayName: 'ada', position: 650, wpm: 70 }),
          participant({ participantId: BOB, displayName: 'bob', position: 600, wpm: 60 }),
        ]}
      />,
    );

    const panel = screen.getByTestId('overtake-panel');
    expect(panel).toHaveAttribute('data-direction', 'up');
    expect(panel).toHaveTextContent(`${messages['overtake.overtookPrefix']} bob`);
    expect(screen.getByTestId('overtake-rank')).toHaveTextContent(`${messages['track.rankLabel']} 1`);
    // The assertive live region announces the event (GAME-3).
    expect(screen.getByTestId('overtake-announcer')).toHaveAttribute('aria-live', 'assertive');
    expect(screen.getByTestId('overtake-announcer')).toHaveTextContent(
      `${messages['overtake.ariaUp']} bob`,
    );
  });

  test('shows an overtaken panel when the local player gets passed', () => {
    const { rerender } = renderIndicator({
      participants: [
        participant({ participantId: ADA, displayName: 'ada', position: 600, wpm: 60 }),
        participant({ participantId: CARL, displayName: 'carl', position: 400, wpm: 40 }),
      ],
    });
    rerender(
      <OvertakeIndicator
        messages={messages}
        localParticipantId={ADA}
        finishRanks={{}}
        participants={[
          participant({ participantId: CARL, displayName: 'carl', position: 700, wpm: 80 }),
          participant({ participantId: ADA, displayName: 'ada', position: 600, wpm: 60 }),
        ]}
      />,
    );

    const panel = screen.getByTestId('overtake-panel');
    expect(panel).toHaveAttribute('data-direction', 'down');
    expect(panel).toHaveTextContent(`carl ${messages['overtake.overtakenBySuffix']}`);
    expect(screen.getByTestId('overtake-announcer')).toHaveTextContent(
      `${messages['overtake.ariaDown']} carl`,
    );
  });

  test('auto-dismisses after ~2.5 s (fake timers)', () => {
    jest.useFakeTimers({ now: T0 });
    try {
      const { rerender } = renderIndicator({
        participants: [
          participant({ participantId: BOB, displayName: 'bob', position: 600, wpm: 60 }),
          participant({ participantId: ADA, displayName: 'ada', position: 400, wpm: 40 }),
        ],
      });
      rerender(
        <OvertakeIndicator
          messages={messages}
          localParticipantId={ADA}
          finishRanks={{}}
          participants={[
            participant({ participantId: ADA, displayName: 'ada', position: 650, wpm: 70 }),
            participant({ participantId: BOB, displayName: 'bob', position: 600, wpm: 60 }),
          ]}
        />,
      );
      expect(screen.getByTestId('overtake-panel')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(OVERTAKE_DISMISS_MS - 100);
      });
      expect(screen.getByTestId('overtake-panel')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(screen.queryByTestId('overtake-panel')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test('applies latest-wins: a new event replaces the current one without stacking', () => {
    jest.useFakeTimers({ now: T0 });
    try {
      const { rerender } = renderIndicator({
        participants: [
          participant({ participantId: BOB, displayName: 'bob', position: 600, wpm: 60 }),
          participant({ participantId: ADA, displayName: 'ada', position: 400, wpm: 40 }),
        ],
      });
      // Event A: Ada overtakes Bob.
      rerender(
        <OvertakeIndicator
          messages={messages}
          localParticipantId={ADA}
          finishRanks={{}}
          participants={[
            participant({ participantId: ADA, displayName: 'ada', position: 650, wpm: 70 }),
            participant({ participantId: BOB, displayName: 'bob', position: 600, wpm: 60 }),
          ]}
        />,
      );
      expect(screen.getByTestId('overtake-panel')).toHaveTextContent('bob');

      // 1 s later, event B: Carl blows past Ada.
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      rerender(
        <OvertakeIndicator
          messages={messages}
          localParticipantId={ADA}
          finishRanks={{}}
          participants={[
            participant({ participantId: CARL, displayName: 'carl', position: 900, wpm: 95 }),
            participant({ participantId: ADA, displayName: 'ada', position: 650, wpm: 70 }),
            participant({ participantId: BOB, displayName: 'bob', position: 600, wpm: 60 }),
          ]}
        />,
      );
      // Only ONE panel, showing the latest event (Carl, down direction).
      const panels = screen.getAllByTestId('overtake-panel');
      expect(panels).toHaveLength(1);
      expect(panels[0]).toHaveAttribute('data-direction', 'down');
      expect(panels[0]).toHaveTextContent('carl');

      // The timer restarted: 1 s after event B the panel is still visible,
      // and it only dismisses 2.5 s after event B.
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      expect(screen.getByTestId('overtake-panel')).toBeInTheDocument();
      act(() => {
        jest.advanceTimersByTime(OVERTAKE_DISMISS_MS);
      });
      expect(screen.queryByTestId('overtake-panel')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test('localizes bot names in the overtake strip (BOT-04)', () => {
    const botRival = participant({
      participantId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      kind: 'bot',
      displayName: 'expert 2',
      position: 600,
      wpm: 60,
    });
    const { rerender } = renderIndicator({
      participants: [
        botRival,
        participant({ participantId: ADA, displayName: 'ada', position: 400, wpm: 40 }),
      ],
    });
    expect(screen.queryByTestId('overtake-panel')).not.toBeInTheDocument();

    // Ada passes the bot: the strip names the bot in the viewer's language.
    rerender(
      <OvertakeIndicator
        messages={messages}
        localParticipantId={ADA}
        finishRanks={{}}
        participants={[
          botRival,
          participant({ participantId: ADA, displayName: 'ada', position: 700, wpm: 60 }),
        ]}
      />,
    );
    const panel = screen.getByTestId('overtake-panel');
    expect(panel).toHaveAttribute('data-direction', 'up');
    expect(panel).toHaveTextContent('Expert n°2');
    expect(panel).not.toHaveTextContent('expert 2');
  });
});
