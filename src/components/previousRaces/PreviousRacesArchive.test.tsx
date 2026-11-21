import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import PreviousRacesArchive from './PreviousRacesArchive';
import { MESSAGES } from '../../i18n/messages';
import type { ArchiveRaceEntry, RaceArchivePage } from '../../db/queries/races';

function entry(overrides: Partial<ArchiveRaceEntry> = {}): ArchiveRaceEntry {
  return {
    publicId: '11111111-1111-4111-8111-111111111111',
    visibility: 'public',
    textLanguage: 'fr',
    textType: 'random',
    wordCount: 20,
    finishedAt: new Date('2026-01-01T12:00:00.000Z'),
    durationMs: 60_000,
    participantCount: 2,
    champion: { displayName: 'ada', wpm: 100.25, accuracy: 97.4 },
    viewer: { rank: 1, wpm: 100.25, accuracy: 97.4, status: 'finished' },
    standings: [
      {
        rank: 1,
        displayName: 'ada',
        wpm: 100.25,
        accuracy: 97.4,
        errors: 3,
        durationMs: 45_000,
        status: 'finished',
        isViewer: true,
      },
      {
        rank: 2,
        displayName: 'bob',
        wpm: 88.5,
        accuracy: 95.0,
        errors: 5,
        durationMs: 50_000,
        status: 'finished',
        isViewer: false,
      },
    ],
    textSnippet: 'hello world excerpt',
    ...overrides,
  };
}

function page(entries: ArchiveRaceEntry[]): RaceArchivePage {
  return { entries, totalCount: entries.length, page: 1, pageSize: 10, totalPages: 1 };
}

const FILTERS = { scope: 'all' as const, query: '', page: 1 };

describe('PreviousRacesArchive', () => {
  test('renders the champion, participant count and text snippet affordances', () => {
    render(
      <PreviousRacesArchive
        page={page([entry()])}
        summary={{ racesCount: 1, podiumRate: 100, avgWpm: 100.25 }}
        filters={FILTERS}
        viewerIsGuest={false}
        locale="fr"
        messages={MESSAGES.fr}
      />,
    );

    expect(screen.getByText('ada')).toBeInTheDocument();
    expect(screen.getAllByTestId('archive-row')).toHaveLength(1);
    expect(screen.getByText(MESSAGES.fr['previousRaces.metrics.races'])).toBeInTheDocument();
  });

  test('shows the empty state when there are no races', () => {
    render(
      <PreviousRacesArchive
        page={page([])}
        summary={null}
        filters={FILTERS}
        viewerIsGuest
        locale="fr"
        messages={MESSAGES.fr}
      />,
    );

    expect(screen.getByTestId('archive-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('archive-table')).not.toBeInTheDocument();
  });

  test('hides the "your result" column and login-only filters for guests', () => {
    render(
      <PreviousRacesArchive
        page={page([entry({ viewer: null })])}
        summary={null}
        filters={FILTERS}
        viewerIsGuest
        locale="fr"
        messages={MESSAGES.fr}
      />,
    );

    expect(screen.queryByText(MESSAGES.fr['previousRaces.col.yourResult'])).not.toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.fr['previousRaces.filter.mine'])).not.toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.fr['previousRaces.filter.private'])).not.toBeInTheDocument();
    expect(screen.getByText(MESSAGES.fr['previousRaces.filter.public'])).toBeInTheDocument();
  });

  test('opens and closes the detail modal', () => {
    render(
      <PreviousRacesArchive
        page={page([entry()])}
        summary={null}
        filters={FILTERS}
        viewerIsGuest={false}
        locale="fr"
        messages={MESSAGES.fr}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId('archive-row')[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.fr['previousRaces.modal.colRank'])).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
