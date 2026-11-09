import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { MESSAGES } from '../../i18n/messages';
import type { BonusAppliedMessage, RaceTickParticipant } from '../../realtime/protocol';
import BonusAnnouncer, { BONUS_BANNER_DISMISS_MS } from './BonusAnnouncer';

/**
 * BONUS-03: a localized, auto-dismissing banner announces bonuses that hit
 * the LOCAL participant (announced through an aria-live polite region); a
 * compact rune-styled feed line announces every event to the whole room
 * (no emojis — DES-04), with bot names localized (BOT-04).
 */

const messages = MESSAGES.fr;
const ADA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const BOT_ID = '33333333-3333-4333-8333-333333333333';

function participant(overrides: Partial<RaceTickParticipant> = {}): RaceTickParticipant {
  return {
    participantId: ADA,
    kind: 'user',
    displayName: 'ada',
    position: 10,
    wpm: 20,
    finished: false,
    totalLength: 43,
    ...overrides,
  };
}

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
    payload: { totalLength: 43, at: '2026-11-08T18:00:10.000Z', ...payload },
  };
}

type AnnouncerProps = Parameters<typeof BonusAnnouncer>[0];

function renderAnnouncer(overrides: Partial<AnnouncerProps> = {}) {
  const props: AnnouncerProps = {
    bonusLog: [],
    participants: [],
    localParticipantId: ADA,
    messages,
    ...overrides,
  };
  return render(<BonusAnnouncer {...props} />);
}

describe('BonusAnnouncer (BONUS-03)', () => {
  test('a banner announces a local removeWords event and auto-dismisses', () => {
    jest.useFakeTimers({ now: 0 });
    try {
      renderAnnouncer({
        bonusLog: [bonusEvent('removeWords', ADA, { wordCount: 3, totalLength: 40 })],
        participants: [participant()],
      });

      const banner = screen.getByTestId('bonus-banner');
      expect(banner).toHaveAttribute('data-bonus-type', 'removeWords');
      expect(banner).toHaveAttribute('aria-live', 'polite');
      expect(banner).toHaveTextContent('−3 mots');
      expect(banner).toHaveTextContent(messages['bonus.banner.removeWords']);

      act(() => {
        jest.advanceTimersByTime(BONUS_BANNER_DISMISS_MS - 1);
      });
      expect(screen.getByTestId('bonus-banner')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(screen.queryByTestId('bonus-banner')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test('a banner announces a local addWords event with the grown word count', () => {
    renderAnnouncer({
      bonusLog: [
        bonusEvent('addWords', ADA, { words: ['tunnel', 'forge', 'nain'], totalLength: 61 }),
      ],
      participants: [participant()],
    });
    expect(screen.getByTestId('bonus-banner')).toHaveTextContent('+3 mots');
    expect(screen.getByTestId('bonus-banner')).toHaveTextContent(
      messages['bonus.banner.addWords'],
    );
  });

  test('a banner announces a local fog event with its duration in seconds', () => {
    renderAnnouncer({
      bonusLog: [bonusEvent('fog', ADA, { durationMs: 2_000, totalLength: 43 })],
      participants: [participant()],
    });
    expect(screen.getByTestId('bonus-banner')).toHaveTextContent(
      'Brouillard sur vos prochains mots — 2 s',
    );
  });

  test('no banner for an observer: the feed line still announces the targeted player', () => {
    renderAnnouncer({
      bonusLog: [
        bonusEvent('addWords', BOB, { words: ['tunnel', 'forge', 'nain'], totalLength: 61 }),
      ],
      participants: [participant(), participant({ participantId: BOB, displayName: 'bob' })],
    });

    expect(screen.queryByTestId('bonus-banner')).not.toBeInTheDocument();
    const line = screen.getByTestId('bonus-feed-line');
    expect(line).toHaveAttribute('data-bonus-type', 'addWords');
    expect(line).toHaveTextContent(messages['bonus.feedPrefix']);
    expect(line).toHaveTextContent('bob');
    expect(line).toHaveTextContent(messages['bonus.feed.receives']);
    expect(line).toHaveTextContent('+3 mots');
  });

  test('the feed shows fog chips with the duration in seconds', () => {
    renderAnnouncer({
      bonusLog: [bonusEvent('fog', BOB, { durationMs: 2_000, totalLength: 43 })],
      participants: [participant({ participantId: BOB, displayName: 'bob' })],
    });
    expect(screen.getByTestId('bonus-feed-line')).toHaveTextContent('Brouillard 2 s');
  });

  test('bot targets are localized on the feed (BOT-04)', () => {
    renderAnnouncer({
      bonusLog: [bonusEvent('removeWords', BOT_ID, { wordCount: 3, totalLength: 20 })],
      participants: [
        participant({ participantId: BOT_ID, kind: 'bot', displayName: 'expert 2' }),
      ],
    });
    expect(screen.getByTestId('bonus-feed-line')).toHaveTextContent('Expert n°2');
    expect(screen.queryByText('expert 2')).not.toBeInTheDocument();
  });

  test('a fresh local event replaces the banner and restarts the timer (latest wins)', () => {
    jest.useFakeTimers({ now: 0 });
    try {
      const baseProps: AnnouncerProps = {
        bonusLog: [bonusEvent('removeWords', ADA, { wordCount: 3, totalLength: 40 })],
        participants: [participant()],
        localParticipantId: ADA,
        messages,
      };
      const { rerender } = render(<BonusAnnouncer {...baseProps} />);

      act(() => {
        jest.advanceTimersByTime(3_000);
      });
      rerender(
        <BonusAnnouncer
          {...baseProps}
          bonusLog={[
            ...baseProps.bonusLog,
            bonusEvent('fog', ADA, { durationMs: 2_000, totalLength: 40, at: '2026-11-08T18:01:00.000Z' }),
          ]}
        />,
      );
      const banner = screen.getByTestId('bonus-banner');
      expect(banner).toHaveAttribute('data-bonus-type', 'fog');
      expect(banner).toHaveTextContent('Brouillard sur vos prochains mots — 2 s');

      // The timer restarted at the NEW event: still visible 3 999 ms later.
      act(() => {
        jest.advanceTimersByTime(BONUS_BANNER_DISMISS_MS - 1);
      });
      expect(screen.getByTestId('bonus-banner')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(screen.queryByTestId('bonus-banner')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});
