/**
 * @jest-environment jsdom
 *
 * RTL test for the persisted race replay page (HIST-02): the server
 * component fetches the race through `getRaceForReplay` and renders the
 * existing results components (podium, table, chart) from persisted data;
 * the keyboard heatmap shows the honest "unavailable" state and an unknown
 * race answers 404.
 */

import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { getRaceForReplay, type RaceReplayView } from '../../../db/queries/races';
import { getSession } from '../../../lib/session';
import RaceReplayPage from './page';

jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({ get: () => undefined })),
  headers: jest.fn(async () => ({ get: () => null })),
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: jest.fn(),
}));

jest.mock('../../../db/index', () => ({ db: {} }));

jest.mock('../../../db/queries/races', () => ({
  getRaceForReplay: jest.fn(),
}));

jest.mock('../../../lib/session', () => ({
  getSession: jest.fn(),
}));

// The Navbar chain pulls `next/cache` through the locale action, which needs
// browser globals the jsdom environment does not provide; the selector is not
// under test here (see `Navbar.test.tsx`).
jest.mock('../../../i18n/locale-actions', () => ({
  setLocale: jest.fn(),
}));

jest.mock('../../../theme/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
  useTheme: () => ({ preference: 'system', setPreference: () => {} }),
}));

const { notFound } = jest.requireMock('next/navigation') as { notFound: jest.Mock };
const getRaceForReplayMock = getRaceForReplay as jest.Mock;
const getSessionMock = getSession as jest.Mock;

const RACE_PUBLIC_ID = '22222222-2222-4222-8222-222222222222';
const USER_PUBLIC_ID = '33333333-3333-4333-8333-333333333333';

function replayView(): RaceReplayView {
  return {
    publicId: RACE_PUBLIC_ID,
    textBody: 'the quick brown fox',
    textLanguage: 'en',
    status: 'finished',
    startedAt: new Date('2026-11-07T14:00:00.000Z'),
    finishedAt: new Date('2026-11-07T14:01:00.000Z'),
    durationMs: 60_000,
    results: [
      {
        participantId: USER_PUBLIC_ID,
        displayName: 'ada',
        kind: 'user',
        pfpUrl: null,
        wpm: 112,
        rawWpm: 120,
        accuracy: 96.5,
        errors: 3,
        status: 'finished',
        finishedAtMs: 55_000,
        rank: 1,
        bonusesReceived: 0,
        wpmSeries: [
          { elapsedMs: 1_000, wpm: 80 },
          { elapsedMs: 55_000, wpm: 112 },
        ],
      },
      {
        participantId: '44444444-4444-4444-8444-444444444444',
        displayName: 'Gimli',
        kind: 'guest',
        pfpUrl: null,
        wpm: 90,
        rawWpm: 95,
        accuracy: 99,
        errors: 1,
        status: 'finished',
        finishedAtMs: 58_000,
        rank: 2,
        bonusesReceived: 0,
        wpmSeries: [{ elapsedMs: 58_000, wpm: 90 }],
      },
    ],
  };
}

async function renderPage(publicId: string): Promise<void> {
  const element = await RaceReplayPage({ params: Promise.resolve({ publicId }) });
  render(element);
}

beforeEach(() => {
  jest.clearAllMocks();
  getSessionMock.mockResolvedValue(null);
});

describe('RaceReplayPage (HIST-02)', () => {
  test('replays the persisted results with podium, table and chart', async () => {
    getRaceForReplayMock.mockResolvedValue(replayView());

    await renderPage(RACE_PUBLIC_ID);

    expect(screen.getByTestId('results-podium')).toBeInTheDocument();
    expect(screen.getByTestId('results-table')).toBeInTheDocument();
    expect(screen.getByTestId('results-wpm-chart')).toBeInTheDocument();
    // Two ranked rows (user + guest) come from the persisted participants.
    expect(screen.getAllByTestId('results-row')).toHaveLength(2);
    expect(screen.getAllByTestId('results-row')[0]).toHaveAttribute('data-rank', '1');
    // The race text is re-displayed from the persisted body.
    expect(screen.getByText('the quick brown fox')).toBeInTheDocument();
  });

  test('shows the honest heatmap-unavailable state for a persisted race', async () => {
    getRaceForReplayMock.mockResolvedValue(replayView());

    await renderPage(RACE_PUBLIC_ID);

    expect(screen.getByTestId('results-heatmap-unavailable')).toBeInTheDocument();
  });

  test('highlights the viewer row when they took part in the race', async () => {
    getRaceForReplayMock.mockResolvedValue(replayView());
    getSessionMock.mockResolvedValue({ publicId: USER_PUBLIC_ID, username: 'ada' });

    await renderPage(RACE_PUBLIC_ID);

    expect(screen.getAllByTestId('results-row')[0]).toHaveAttribute('data-local', 'true');
  });

  test('answers 404 for a missing race', async () => {
    getRaceForReplayMock.mockResolvedValue(null);

    await expect(renderPage(RACE_PUBLIC_ID)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });
});
