import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MESSAGES } from '../../i18n/messages';
import type { RankedTrackParticipant } from '../../lib/race/track';
import TrackMarker from './TrackMarker';

/**
 * BOT-04: bots ride the track with a distinct muted stone rune and their
 * neutral wire name ("expert 2") is localized per viewer language; human
 * participants keep their avatars and raw display names.
 */

const fr = MESSAGES.fr;
const en = MESSAGES.en;

const BOT_ID = 'fff39ea1-46c2-4dd3-b787-cc180f21fc39';

function botParticipant(overrides: Partial<RankedTrackParticipant> = {}): RankedTrackParticipant {
  return {
    participantId: BOT_ID,
    kind: 'bot',
    displayName: 'expert 2',
    position: 120,
    wpm: 84.5,
    finished: false,
    rank: 1,
    ...overrides,
  };
}

function humanParticipant(overrides: Partial<RankedTrackParticipant> = {}): RankedTrackParticipant {
  return {
    participantId: '1f2e3d4c-5b6a-4978-8c9d-0e1f2a3b4c5d',
    kind: 'user',
    displayName: 'ada',
    position: 90,
    wpm: 62,
    finished: false,
    rank: 2,
    ...overrides,
  };
}

function renderMarker(participant: RankedTrackParticipant, messages: typeof fr, progress = 0.35) {
  return render(
    <TrackMarker
      participant={participant}
      progress={progress}
      isLocal={false}
      finishRank={null}
      pfpUrl={null}
      messages={messages}
    />,
  );
}

describe('TrackMarker — bot identity (BOT-04)', () => {
  test('a bot rides a distinct stone rune, never a human avatar', () => {
    const { container } = renderMarker(botParticipant(), fr);
    const rune = screen.getByTestId('track-marker-bot');
    expect(rune).toHaveAttribute('aria-hidden', 'true');
    expect(rune.className).toContain('bg-dwarf-basalt');
    expect(container.querySelector('img')).toBeNull();
  });

  test('the bot name is localized from the neutral wire name (fr)', () => {
    renderMarker(botParticipant(), fr);
    const marker = screen.getByTestId(`track-marker-${BOT_ID}`);
    expect(marker).toHaveTextContent('Expert n°2');
    expect(marker).toHaveAccessibleName(/Expert n°2/);
    expect(screen.queryByText('expert 2')).not.toBeInTheDocument();
  });

  test('the bot name is localized from the neutral wire name (en)', () => {
    renderMarker(botParticipant(), en);
    expect(screen.getByTestId(`track-marker-${BOT_ID}`)).toHaveTextContent('Expert #2');
  });

  test('human participants keep their avatar-less raw names and no bot rune', () => {
    renderMarker(humanParticipant(), fr);
    expect(screen.getByTestId('track-marker-1f2e3d4c-5b6a-4978-8c9d-0e1f2a3b4c5d')).toHaveTextContent(
      'ada',
    );
    expect(screen.queryByTestId('track-marker-bot')).not.toBeInTheDocument();
  });

  test('guest participants are unaffected by the bot identity pass', () => {
    renderMarker(
      {
        ...humanParticipant(),
        participantId: '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d',
        kind: 'guest',
        displayName: 'Gimli',
      },
      fr,
    );
    expect(screen.getByTestId('track-marker-2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d')).toHaveTextContent(
      'Gimli',
    );
    expect(screen.queryByTestId('track-marker-bot')).not.toBeInTheDocument();
  });
});
