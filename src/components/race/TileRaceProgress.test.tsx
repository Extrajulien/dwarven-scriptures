import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MESSAGES } from '../../i18n/messages';
import type { RankedTrackParticipant } from '../../lib/race/track';
import type { RaceTrackParticipant } from '../../realtime/client-types';
import TileRaceProgress from './TileRaceProgress';

/**
 * DES-04 / COURSE-05: the per-player tile rectangle — the normal variant
 * overlays the miner avatar and shows rank/name/WPM/gold; the condensed
 * variant shows the compact strip and the live top-3 metadata (GAME-2).
 */

const messages = MESSAGES.fr;
const ADA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const EMPTY_TRACK: RaceTrackParticipant['track'] = Array.from({ length: 16 }, () =>
  Array.from({ length: 3 }, () => ({ mineral: null })),
);

function participant(overrides: Partial<RaceTrackParticipant> = {}): RankedTrackParticipant {
  return {
    participantId: ADA,
    kind: 'user',
    displayName: 'ada',
    position: 0,
    wpm: 40,
    finished: false,
    totalLength: 1_000,
    gold: 12,
    track: EMPTY_TRACK,
    rank: 1,
    ...overrides,
  };
}

describe('TileRaceProgress', () => {
  test('normal variant renders the miner overlay plus rank/name/WPM/gold', () => {
    render(
      <TileRaceProgress
        participant={participant()}
        variant="normal"
        isLocal
        finishRank={1}
        messages={messages}
      />,
    );

    const row = screen.getByTestId(`track-row-${ADA}`);
    expect(row).toHaveAttribute('data-variant', 'normal');
    expect(row).toHaveAttribute('data-local', 'true');
    expect(screen.getByTestId('track-miner')).toBeInTheDocument();
    expect(row).toHaveTextContent('ada');
    expect(row).toHaveTextContent(`40 ${messages['race.liveWpmLabel']}`);
    expect(row).toHaveTextContent(`12 ${messages['track.goldLabel']}`);
    expect(screen.getByTestId('track-you-tag')).toHaveTextContent(messages['track.youTag']);
    expect(screen.getByTestId('track-finish-badge')).toHaveTextContent('1');
  });

  test('condensed variant is a full-width progress bar with the name top-left', () => {
    render(
      <TileRaceProgress
        participant={participant({ participantId: ADA, position: 500, totalLength: 1_000, wpm: 55 })}
        variant="condensed"
        isLocal={false}
        finishRank={null}
        messages={messages}
      />,
    );

    const row = screen.getByTestId(`track-row-${ADA}`);
    expect(row).toHaveAttribute('data-variant', 'condensed');
    expect(row).toHaveTextContent('ada'); // name label in the top-left corner
    expect(screen.getByTestId('top3-wpm')).toHaveTextContent(
      `55 ${messages['race.liveWpmLabel']}`,
    );
    expect(screen.getByTestId('track-gold')).toHaveTextContent(
      `12 ${messages['track.goldLabel']}`,
    );
    // The mined fill reflects progression: 500 / 1_000 = 50 %.
    expect(screen.getByTestId('track-progress-fill').style.width).toBe('50%');
  });

  test('localizes bot display names in both variants (BOT-04)', () => {
    render(
      <TileRaceProgress
        participant={participant({ kind: 'bot', displayName: 'expert 2' })}
        variant="condensed"
        isLocal={false}
        finishRank={null}
        messages={messages}
      />,
    );

    expect(screen.getByTestId(`track-row-${ADA}`)).toHaveTextContent('Expert n°2');
    expect(screen.queryByText('expert 2')).not.toBeInTheDocument();
  });
});
