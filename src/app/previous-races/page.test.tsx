/**
 * @jest-environment jsdom
 *
 * RTL test for the "previous races" archive page: the server component
 * resolves the viewer, parses filters and renders the archive from the
 * mocked `listFinishedRacesArchive`/`getArchiveSummary` results. Guests get
 * public-only data and no summary (AUTH-03 / SALLE-03).
 */

import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { getArchiveSummary, listFinishedRacesArchive, type RaceArchivePage } from '../../db/queries/races';
import { getUserFullProfile } from '../../db/queries/users';
import { getSession } from '../../lib/session';
import PreviousRacesPage from './page';

jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({ get: () => undefined })),
  headers: jest.fn(async () => ({ get: () => null })),
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(),
  redirect: jest.fn(),
}));

jest.mock('../../db/index', () => ({ db: {} }));

jest.mock('../../db/queries/races', () => ({
  listFinishedRacesArchive: jest.fn(),
  getArchiveSummary: jest.fn(),
}));

jest.mock('../../db/queries/users', () => ({
  getUserFullProfile: jest.fn(),
}));

jest.mock('../../lib/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('../../i18n/locale-actions', () => ({
  setLocale: jest.fn(),
}));

jest.mock('../../theme/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
  useTheme: () => ({ preference: 'system', setPreference: () => {} }),
}));

const listFinishedRacesArchiveMock = listFinishedRacesArchive as jest.Mock;
const getArchiveSummaryMock = getArchiveSummary as jest.Mock;
const getUserFullProfileMock = getUserFullProfile as jest.Mock;
const getSessionMock = getSession as jest.Mock;

function archivePage(): RaceArchivePage {
  return {
    totalCount: 1,
    page: 1,
    pageSize: 10,
    totalPages: 1,
    entries: [
      {
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
        ],
        textSnippet: 'hello world',
      },
    ],
  };
}

async function renderPage(): Promise<void> {
  const element = await PreviousRacesPage({ searchParams: Promise.resolve({}) });
  render(element);
}

beforeEach(() => {
  jest.clearAllMocks();
  listFinishedRacesArchiveMock.mockResolvedValue(archivePage());
  getArchiveSummaryMock.mockResolvedValue({ racesCount: 1, podiumRate: 100, avgWpm: 100.25 });
});

describe('PreviousRacesPage', () => {
  test('renders the archive rows for a signed-in viewer', async () => {
    getSessionMock.mockResolvedValue({ publicId: 'user-pub', username: 'ada' });
    getUserFullProfileMock.mockResolvedValue({ id: 7 });

    await renderPage();

    expect(screen.getAllByTestId('archive-row')).toHaveLength(1);
    expect(getArchiveSummaryMock).toHaveBeenCalledWith(7);
    expect(listFinishedRacesArchiveMock).toHaveBeenCalledWith(
      expect.objectContaining({ viewerUserId: 7 }),
    );
  });

  test('renders public-only data for a guest and skips the summary', async () => {
    getSessionMock.mockResolvedValue(null);

    await renderPage();

    expect(screen.getAllByTestId('archive-row')).toHaveLength(1);
    expect(getUserFullProfileMock).not.toHaveBeenCalled();
    expect(getArchiveSummaryMock).not.toHaveBeenCalled();
    expect(listFinishedRacesArchiveMock).toHaveBeenCalledWith(
      expect.objectContaining({ viewerUserId: null }),
    );
  });
});
