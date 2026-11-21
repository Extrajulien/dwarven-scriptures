import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MESSAGES } from '../../i18n/messages';
import type { RaceTrackParticipant } from '../../realtime/client-types';
import ProgressTrack, { type ProgressTrackProps } from './ProgressTrack';

/**
 * DES-04 / COURSE-05 / GAME-2/3: the tile-based progress track composes rows
 * by role — the local player mines a "normal" 3-high rectangle while racing,
 * everyone else (outside the top-3) renders compactly; spectators see ranks
 * 4+ condensed (the top-3 live in Top3Panel). The local rank is announced
 * through an aria-live region.
 */

const messages = MESSAGES.fr;
const ADA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CARL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DORA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const EMPTY_TRACK: RaceTrackParticipant['track'] = Array.from({ length: 16 }, () =>
  Array.from({ length: 3 }, () => ({ mineral: null })),
);

function participant(overrides: Partial<RaceTrackParticipant> = {}): RaceTrackParticipant {
  return {
    participantId: ADA,
    kind: 'user',
    displayName: 'ada',
    position: 0,
    wpm: 0,
    finished: false,
    totalLength: 1_000,
    gold: 0,
    track: EMPTY_TRACK,
    ...overrides,
  };
}

function renderTrack(overrides: Partial<ProgressTrackProps> = {}) {
  const props: ProgressTrackProps = {
    participants: [],
    localParticipantId: ADA,
    viewerRole: 'participant',
    finishRanks: {},
    messages,
    ...overrides,
  };
  return render(<ProgressTrack {...props} />);
}

describe('ProgressTrack (DES-04, COURSE-05, GAME-2/3)', () => {
  test('renders nothing while there are no participants', () => {
    renderTrack();
    expect(screen.queryByTestId('progress-track')).not.toBeInTheDocument();
  });

  test('a racer gets a normal row for the local player and condensed rows for the rest', () => {
    renderTrack({
      participants: [
        participant({ participantId: BOB, displayName: 'bob', position: 600, wpm: 60 }),
        participant({ participantId: ADA, displayName: 'ada', position: 500, wpm: 40 }),
        participant({ participantId: CARL, displayName: 'carl', position: 300, wpm: 20 }),
        participant({ participantId: DORA, displayName: 'dora', position: 100, wpm: 10 }),
      ],
    });

    // ADA (local) gets a normal row; BOB and CARL are top-3 (they live in
    // Top3Panel), DORA is the remaining non-top-3 player and renders condensed.
    expect(screen.getByTestId(`track-row-${ADA}`)).toHaveAttribute('data-variant', 'normal');
    expect(screen.getByTestId(`track-row-${ADA}`)).toHaveAttribute('data-local', 'true');
    expect(screen.queryByTestId(`track-row-${BOB}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`track-row-${CARL}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`track-row-${DORA}`)).toHaveAttribute('data-variant', 'condensed');
  });

  test('the local normal row carries the you tag and the local rank is announced', () => {
    renderTrack({
      participants: [
        participant({ participantId: BOB, displayName: 'bob', position: 600, wpm: 60 }),
        participant({ participantId: ADA, displayName: 'ada', position: 500, wpm: 40 }),
        participant({ participantId: CARL, displayName: 'carl', position: 300, wpm: 20 }),
      ],
    });

    expect(screen.getByTestId('track-you-tag')).toHaveTextContent(messages['track.youTag']);
    const announcer = screen.getByTestId('track-rank-announcer');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    // ADA is rank 2 (bob 600 > ada 500 > carl 300).
    expect(announcer).toHaveTextContent(`${messages['track.rankLabel']} 2`);
  });

  test('a spectator sees ranks 4+ condensed (the top-3 live in Top3Panel)', () => {
    renderTrack({
      viewerRole: 'spectator',
      participants: [
        participant({ participantId: BOB, displayName: 'bob', position: 600, wpm: 60 }),
        participant({ participantId: CARL, displayName: 'carl', position: 300, wpm: 30 }),
        participant({ participantId: DORA, displayName: 'dora', position: 100, wpm: 10 }),
        participant({ participantId: ADA, displayName: 'ada', position: 500, wpm: 40 }),
      ],
    });

    // Ranks 1–3 (bob, ada, carl) are omitted; dora (rank 4) is condensed.
    expect(screen.queryByTestId(`track-row-${BOB}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`track-row-${ADA}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`track-row-${CARL}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`track-row-${DORA}`)).toHaveAttribute('data-variant', 'condensed');
    // No local rank to announce for a spectator.
    expect(screen.getByTestId('track-rank-announcer')).toHaveTextContent('');
  });

  test('shows live WPM, gold and the finish badge on the local row', () => {
    renderTrack({
      finishRanks: { [ADA]: 1 },
      participants: [
        participant({
          participantId: ADA,
          displayName: 'ada',
          position: 1_000,
          wpm: 42,
          finished: true,
          gold: 7,
        }),
        participant({ participantId: BOB, displayName: 'bob', position: 500, wpm: 30 }),
      ],
    });

    const row = screen.getByTestId(`track-row-${ADA}`);
    expect(row).toHaveTextContent(`42 ${messages['race.liveWpmLabel']}`);
    expect(row).toHaveTextContent(`7 ${messages['track.goldLabel']}`);
    expect(screen.getByTestId('track-finish-badge')).toHaveTextContent('1');
  });

  test('the flash prop glows the targeted row only (BONUS-03)', () => {
    renderTrack({
      viewerRole: 'spectator',
      flashParticipantId: DORA,
      participants: [
        participant({ participantId: BOB, displayName: 'bob', position: 600 }),
        participant({ participantId: CARL, displayName: 'carl', position: 300 }),
        participant({ participantId: DORA, displayName: 'dora', position: 100 }),
        participant({ participantId: ADA, displayName: 'ada', position: 500 }),
      ],
    });

    // Only dora (rank 4) renders in ProgressTrack; she is the flash target.
    expect(screen.getByTestId(`track-row-${DORA}`)).toHaveAttribute('data-bonus-flash', 'true');
  });
});
