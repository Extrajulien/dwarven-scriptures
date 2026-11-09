/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import type { UserRaceHistoryEntry } from '../../db/queries/races';
import { MESSAGES } from '../../i18n/messages';
import ProgressionCharts from './ProgressionCharts';

const messages = MESSAGES.fr;

function entry(publicId: string, wpm: number, day: string): UserRaceHistoryEntry {
  return {
    publicId,
    textLanguage: 'fr',
    finishedAt: new Date(`${day}T10:00:00.000Z`),
    durationMs: 60_000,
    rank: 2,
    wpm,
    accuracy: 97,
    status: 'finished',
    finishedAtMs: 55_000,
  };
}

describe('ProgressionCharts (AUTH-06, STAT-3)', () => {
  test('draws the WPM line and the per-day bars from persisted races', () => {
    render(
      <ProgressionCharts
        recentRaces={[
          entry('11111111-1111-4111-8111-111111111111', 90, '2026-01-08'),
          entry('22222222-2222-4222-8222-222222222222', 120, '2026-01-09'),
        ]}
        dailyCounts={[
          { day: '2026-01-09', count: 2 },
          { day: '2026-01-10', count: 1 },
        ]}
        days={6}
        messages={messages}
        locale="fr"
      />,
    );

    const line = screen.getByTestId('account-wpm-chart-line');
    expect(line.getAttribute('points')).toContain(',');
    expect(line.getAttribute('points')?.split(' ')).toHaveLength(2);
    expect(screen.getAllByTestId('account-races-chart-bar')).toHaveLength(6);
  });

  test('shows the honest empty state when the user has no races yet', () => {
    render(
      <ProgressionCharts
        recentRaces={[]}
        dailyCounts={[]}
        days={6}
        messages={messages}
        locale="fr"
      />,
    );

    expect(screen.getByTestId('account-chart-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('account-wpm-chart-line')).toBeNull();
  });
});
