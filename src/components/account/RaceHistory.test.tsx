/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import type { RaceHistoryPage, UserRaceHistoryEntry } from '../../db/queries/races';
import { MESSAGES } from '../../i18n/messages';
import RaceHistory from './RaceHistory';

const messages = MESSAGES.fr;

function entry(publicId: string, rank: number, wpm: number): UserRaceHistoryEntry {
  return {
    publicId,
    textLanguage: 'fr',
    finishedAt: new Date('2026-11-07T14:02:11.000Z'),
    durationMs: 74_000,
    rank,
    wpm,
    accuracy: 98.2,
    status: 'finished',
    finishedAtMs: 70_000,
  };
}

function page(overrides: Partial<RaceHistoryPage>): RaceHistoryPage {
  return {
    entries: [entry('11111111-1111-4111-8111-111111111111', 1, 112), entry('22222222-2222-4222-8222-222222222222', 2, 94)],
    totalCount: 25,
    page: 2,
    pageSize: 10,
    totalPages: 3,
    ...overrides,
  };
}

describe('RaceHistory (HIST-01)', () => {
  test('renders one row per persisted race with a link to its replay page', () => {
    render(<RaceHistory page={page({})} messages={messages} locale="fr" />);

    expect(screen.getAllByTestId('history-table')).toHaveLength(1);
    const links = screen.getAllByRole('link', { name: /07\/11\/2026/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/races/11111111-1111-4111-8111-111111111111');
    expect(links[1]).toHaveAttribute('href', '/races/22222222-2222-4222-8222-222222222222');
  });

  test('marks the rank-1 row with the gold badge', () => {
    render(<RaceHistory page={page({})} messages={messages} locale="fr" />);

    const ranks = screen.getAllByTestId('history-rank');
    expect(ranks[0]).toHaveTextContent('#1');
    expect(ranks[1]).toHaveTextContent('#2');
  });

  test('renders the showing/page summary and working prev/next links', () => {
    render(<RaceHistory page={page({})} messages={messages} locale="fr" />);

    expect(screen.getByTestId('history-showing')).toHaveTextContent('11');
    expect(screen.getByTestId('history-showing')).toHaveTextContent('12');
    expect(screen.getByTestId('history-page')).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: /PRÉC/ })).toHaveAttribute('href', '/account?page=1');
    expect(screen.getByRole('link', { name: /SUIV/ })).toHaveAttribute('href', '/account?page=3');
  });

  test('disables the prev link on the first page and next on the last', () => {
    const { rerender } = render(
      <RaceHistory page={page({ page: 1, totalPages: 1, totalCount: 2 })} messages={messages} locale="fr" />,
    );
    expect(screen.queryByRole('link', { name: /PRÉC/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /SUIV/ })).toBeNull();

    rerender(
      <RaceHistory page={page({ page: 1, totalPages: 3 })} messages={messages} locale="fr" />,
    );
    expect(screen.queryByRole('link', { name: /PRÉC/ })).toBeNull();
    expect(screen.getByRole('link', { name: /SUIV/ })).toBeTruthy();
  });

  test('shows the honest empty state when no race is persisted yet', () => {
    render(
      <RaceHistory
        page={page({ entries: [], totalCount: 0, page: 1, totalPages: 0 })}
        messages={messages}
        locale="fr"
      />,
    );

    expect(screen.getByTestId('history-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('history-table')).toBeNull();
  });
});
