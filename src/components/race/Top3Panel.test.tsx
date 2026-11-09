import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MESSAGES } from '../../i18n/messages';
import type { RaceTrackParticipant } from '../../realtime/client-types';
import Top3Panel from './Top3Panel';

/**
 * GAME-2: the live top-3 panel derives the ranking client-side from the
 * latest tick, shows ranks 1–3 with names and WPM, marks the local player,
 * and disappears while there are no participants.
 */

const messages = MESSAGES.fr;
const ADA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

describe('Top3Panel (GAME-2 live top-3)', () => {
  test('renders nothing while there are no participants', () => {
    render(
      <Top3Panel participants={[]} finishRanks={{}} localParticipantId={ADA} messages={messages} />,
    );
    expect(screen.queryByTestId('top3-panel')).not.toBeInTheDocument();
  });

  test('shows exactly the top 3, client-side ranked from the tick', () => {
    render(
      <Top3Panel
        finishRanks={{}}
        localParticipantId={ADA}
        messages={messages}
        participants={[
          participant({ participantId: 'd', displayName: 'dora', position: 100, wpm: 10 }),
          participant({ participantId: 'c', displayName: 'carl', position: 300, wpm: 30 }),
          participant({ participantId: 'b', displayName: 'bob', position: 600, wpm: 60 }),
          participant({ participantId: ADA, displayName: 'ada', position: 500, wpm: 45 }),
        ]}
      />,
    );

    const rows = screen.getAllByTestId('top3-row');
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.getAttribute('data-rank'))).toEqual(['1', '2', '3']);
    // 1: bob (600), 2: ada (500), 3: carl (300) — dora (100) is cut.
    expect(rows[0]).toHaveTextContent('bob');
    expect(rows[0]).toHaveTextContent(`60 ${messages['race.liveWpmLabel']}`);
    expect(rows[1]).toHaveTextContent('ada');
    expect(rows[2]).toHaveTextContent('carl');
    expect(screen.queryByText('dora')).not.toBeInTheDocument();
  });

  test('ranks finished participants first and tags the local player', () => {
    render(
      <Top3Panel
        finishRanks={{ b: 1 }}
        localParticipantId={ADA}
        messages={messages}
        participants={[
          participant({ participantId: 'b', displayName: 'bob', position: 1_000, wpm: 55, finished: true }),
          participant({ participantId: ADA, displayName: 'ada', position: 500, wpm: 90 }),
          participant({ participantId: 'c', displayName: 'carl', position: 400, wpm: 20 }),
        ]}
      />,
    );

    const rows = screen.getAllByTestId('top3-row');
    expect(rows[0]).toHaveAttribute('data-rank', '1');
    expect(rows[0]).toHaveTextContent('bob');
    expect(rows[1]).toHaveAttribute('data-local', 'true');
    expect(rows[1]).toHaveTextContent(messages['track.youTag']);
  });

  test('localizes bot names in the top-3 rows (BOT-04)', () => {
    render(
      <Top3Panel
        finishRanks={{}}
        localParticipantId={ADA}
        messages={messages}
        participants={[
          participant({
            participantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            kind: 'bot',
            displayName: 'expert 2',
            position: 600,
            wpm: 60,
          }),
          participant({ participantId: ADA, displayName: 'ada', position: 500, wpm: 45 }),
        ]}
      />,
    );

    const botRow = screen.getAllByTestId('top3-row').find((row) => row.getAttribute('data-rank') === '1');
    expect(botRow).toHaveTextContent('Expert n°2');
    expect(screen.queryByText('expert 2')).not.toBeInTheDocument();
  });
});
