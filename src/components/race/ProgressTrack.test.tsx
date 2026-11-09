import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { MESSAGES } from '../../i18n/messages';
import type { RaceTrackParticipant } from '../../realtime/client-types';
import ProgressTrack, { type ProgressTrackProps } from './ProgressTrack';

/**
 * COURSE-05 / DES-04: the dwarf-cave progress track renders one marker per
 * participant in live rank order, highlights the local participant, shows
 * live WPM chips and finish badges, interpolates between server ticks on the
 * client clock (fake timers), announces the local rank via aria-live, and
 * keeps its responsive structure at 360 px (structural assertions only — no
 * real browser here).
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
    totalLength: 1_000,
    ...overrides,
  };
}

function renderTrack(overrides: Partial<ProgressTrackProps> = {}) {
  const props: ProgressTrackProps = {
    participants: [],
    lastTickAt: null,
    localParticipantId: ADA,
    finishRanks: {},
    messages,
    ...overrides,
  };
  return render(<ProgressTrack {...props} />);
}

describe('ProgressTrack (COURSE-05, DES-04)', () => {
  test('renders nothing while there are no participants', () => {
    renderTrack();
    expect(screen.queryByTestId('progress-track')).not.toBeInTheDocument();
  });

  test('renders one marker per participant in live rank order', () => {
    renderTrack({
      lastTickAt: new Date(T0).toISOString(),
      finishRanks: { [BOB]: 1 },
      participants: [
        participant({ participantId: CARL, displayName: 'carl', position: 300, wpm: 20 }),
        participant({ participantId: BOB, displayName: 'bob', position: 1_000, wpm: 60, finished: true }),
        participant({ participantId: ADA, displayName: 'ada', position: 500, wpm: 40 }),
      ],
    });

    const track = screen.getByTestId('progress-track');
    const markers = Array.from(track.querySelectorAll('[data-testid^="track-marker-"]'));
    expect(markers).toHaveLength(3);
    // Finished first, then position desc (COURSE-05 live ranking).
    expect(markers.map((marker) => marker.getAttribute('data-testid'))).toEqual([
      `track-marker-${BOB}`,
      `track-marker-${ADA}`,
      `track-marker-${CARL}`,
    ]);
    expect(markers.map((marker) => marker.getAttribute('data-rank'))).toEqual(['1', '2', '3']);
  });

  test('highlights the local participant with a ring, glow and the i18n you tag', () => {
    renderTrack({
      lastTickAt: new Date(T0).toISOString(),
      participants: [
        participant({ participantId: ADA, displayName: 'ada', position: 500, wpm: 40 }),
        participant({ participantId: BOB, displayName: 'bob', position: 900, wpm: 60 }),
      ],
    });

    const marker = screen.getByTestId(`track-marker-${ADA}`);
    expect(marker).toHaveAttribute('data-local', 'true');
    expect(screen.getByTestId(`track-marker-${BOB}`)).toHaveAttribute('data-local', 'false');
    expect(screen.getByTestId('track-you-tag')).toHaveTextContent(messages['track.youTag']);
    // Distinct ring + glow (structural assertion, DES-04 signature styling).
    expect(marker.querySelector('.ring-dwarf-gold')).not.toBeNull();
    expect(marker.querySelector('.shadow-gold-glow')).not.toBeNull();
  });

  test('shows live WPM chips, the finish badge and the local rank announcer', () => {
    renderTrack({
      lastTickAt: new Date(T0).toISOString(),
      finishRanks: { [BOB]: 1 },
      participants: [
        participant({ participantId: ADA, displayName: 'ada', position: 500, wpm: 42 }),
        participant({ participantId: BOB, displayName: 'bob', position: 1_000, wpm: 61, finished: true }),
      ],
    });

    expect(screen.getByTestId(`track-marker-${ADA}`)).toHaveTextContent(`42 ${messages['race.liveWpmLabel']}`);
    // The finished participant keeps a visible finish marker with its rank.
    const bobMarker = screen.getByTestId(`track-marker-${BOB}`);
    expect(bobMarker).toHaveAttribute('data-finished', 'true');
    expect(bobMarker).toHaveTextContent('1');
    expect(screen.getByTestId('track-finish-badge')).toHaveTextContent('1');
    // Markers are labelled groups.
    expect(bobMarker).toHaveAttribute('role', 'group');
    expect(bobMarker).toHaveAttribute('aria-label');
    // The polite region announces the local rank (GAME-3 tie-in).
    const announcer = screen.getByTestId('track-rank-announcer');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    expect(announcer).toHaveTextContent(`${messages['track.rankLabel']} 2`);
  });

  test('interpolates marker progress between ticks on the client clock (fake timers)', () => {
    jest.useFakeTimers({ now: T0 });
    try {
      const tick1 = [
        participant({ participantId: ADA, displayName: 'ada', position: 400, wpm: 40 }),
        participant({ participantId: BOB, displayName: 'bob', position: 800, wpm: 60 }),
      ];
      const tick2 = [
        participant({ participantId: ADA, displayName: 'ada', position: 500, wpm: 44 }),
        participant({ participantId: BOB, displayName: 'bob', position: 850, wpm: 62 }),
      ];
      const props: ProgressTrackProps = {
        participants: tick1,
        lastTickAt: new Date(T0).toISOString(),
        localParticipantId: ADA,
        finishRanks: {},
        messages,
      };
      const { rerender } = render(<ProgressTrack {...props} />);

      // Second server tick 250 ms later: the window is [T0, T0 + 250].
      rerender(
        <ProgressTrack {...props} participants={tick2} lastTickAt={new Date(T0 + 250).toISOString()} />,
      );
      const marker = screen.getByTestId(`track-marker-${ADA}`);

      // At the start of the window the marker sits on the previous sample (0.4).
      expect(Number(marker.getAttribute('data-progress'))).toBeCloseTo(0.4);
      // The position is driven by the --track-progress custom property.
      expect(marker.style.getPropertyValue('--track-progress')).toBeTruthy();
      expect(marker.style.left).toContain('calc(var(--track-progress)');

      // Advance the client clock: the interpolated progress rises monotonically
      // and settles exactly on the next sample at the end of the window.
      act(() => {
        jest.advanceTimersByTime(100);
      });
      const midway = Number(marker.getAttribute('data-progress'));
      expect(midway).toBeGreaterThan(0.4);
      expect(midway).toBeLessThan(0.5);

      act(() => {
        jest.advanceTimersByTime(250);
      });
      const settled = Number(marker.getAttribute('data-progress'));
      expect(settled).toBeGreaterThan(midway);
      expect(settled).toBeCloseTo(0.5, 1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('each marker percentage uses its own effective length (BONUS-04 regression)', () => {
    // Same shared base text, different bonus-adjusted lengths: 400/400 is
    // finished while 400/1000 is at 40 % — a shared denominator would lie
    // for at least one of them.
    renderTrack({
      lastTickAt: new Date(T0).toISOString(),
      participants: [
        participant({ participantId: ADA, displayName: 'ada', position: 400, totalLength: 400 }),
        participant({ participantId: BOB, displayName: 'bob', position: 400, totalLength: 1_000 }),
      ],
    });

    expect(screen.getByTestId(`track-marker-${ADA}`)).toHaveAttribute('data-progress', '1.000');
    expect(screen.getByTestId(`track-marker-${BOB}`)).toHaveAttribute('data-progress', '0.400');
  });

  test('the flash prop glows the targeted marker only (BONUS-03)', () => {
    renderTrack({
      lastTickAt: new Date(T0).toISOString(),
      flashParticipantId: BOB,
      participants: [
        participant({ participantId: ADA, displayName: 'ada', position: 400 }),
        participant({ participantId: BOB, displayName: 'bob', position: 500 }),
      ],
    });

    const adaMarker = screen.getByTestId(`track-marker-${ADA}`);
    const bobMarker = screen.getByTestId(`track-marker-${BOB}`);
    expect(adaMarker).toHaveAttribute('data-bonus-flash', 'false');
    expect(bobMarker).toHaveAttribute('data-bonus-flash', 'true');
    // The glow is a distinct stone ring, not the local marker's treatment.
    expect(bobMarker.querySelector('.ring-dwarf-rune-bright')).not.toBeNull();
    expect(bobMarker.querySelector('.shadow-gold-glow')).not.toBeNull();
    expect(bobMarker.querySelector('.ring-dwarf-gold')).toBeNull();
  });

  test('keeps the responsive structure for 360 px (structural assertions only)', () => {
    renderTrack({
      lastTickAt: new Date(T0).toISOString(),
      participants: [
        participant({ participantId: ADA, displayName: 'averyverylongdwarfname', position: 500, wpm: 40 }),
        participant({ participantId: BOB, displayName: 'bob', position: 900, wpm: 60 }),
      ],
    });

    const track = screen.getByTestId('progress-track');
    expect(track.className).toContain('min-w-0');
    expect(track.className).toContain('w-full');
    const marker = screen.getByTestId(`track-marker-${ADA}`);
    // Compressed marker width + truncated name + small chip at 360 px.
    expect(marker.className).toContain('w-[3.5rem]');
    expect(marker.querySelector('.truncate')).not.toBeNull();
    const [wpmChip] = screen.getAllByTestId('track-wpm-chip');
    expect(wpmChip.className).toContain('text-label-sm');
    // The lane clips its sprite-tile gates instead of overflowing the page.
    expect(screen.getByTestId('track-lane').className).toContain('overflow-hidden');
    // The gold finish line is part of the lane.
    expect(screen.getByTestId('track-finish-line')).toBeInTheDocument();
  });
});
