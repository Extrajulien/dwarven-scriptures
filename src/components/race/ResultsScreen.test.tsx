import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MESSAGES } from '../../i18n/messages';
import type { RaceResultEntry } from '../../realtime/protocol';
import type { RaceResultsView } from '../../realtime/client-types';
import ResultsScreen, { recordBeaten } from './ResultsScreen';
import { toneForErrorCount } from './RaceKeyboardHeatmap';
import { buildChartLine, scaleChartPoint } from './ResultsWpmChart';

/**
 * RES-01..04: podium order, the complete table (including timeout/quit
 * statuses in both bags), the structural SVG chart, the heatmap tones from
 * real per-key error counts, the personal-record states, and the
 * locale-aware labels.
 */

const fr = MESSAGES.fr;
const en = MESSAGES.en;
const ADA = '22222222-2222-4222-8222-222222222222';
const BOB = '88888888-8888-4888-8888-888888888888';
const CARL = '77777777-7777-4777-8777-777777777777';
const GUEST = '44444444-4444-4444-8444-444444444444';

function entry(overrides: Partial<RaceResultEntry> = {}): RaceResultEntry {
  return {
    participantId: ADA,
    displayName: 'ada',
    kind: 'user',
    wpm: 42,
    rawWpm: 46,
    accuracy: 94,
    errors: 3,
    status: 'finished',
    finishedAtMs: 20_000,
    rank: 1,
    wpmSeries: [],
    ...overrides,
  };
}

function makeResults(results: RaceResultEntry[]): RaceResultsView {
  return { durationMs: 45_000, results };
}

function renderResults(
  results: RaceResultsView,
  overrides: {
    localParticipantId?: string;
    keyErrors?: Readonly<Record<string, number>> | null;
    bestWpm?: number | null;
    lang?: 'fr' | 'en';
    pfpUrls?: Record<string, string | null>;
  } = {},
) {
  return render(
    <ResultsScreen
      results={results}
      localParticipantId={overrides.localParticipantId ?? ADA}
      keyErrors={overrides.keyErrors === undefined ? {} : overrides.keyErrors}
      bestWpm={overrides.bestWpm ?? null}
      messages={overrides.lang === 'en' ? en : fr}
      locale={overrides.lang === 'en' ? 'en' : 'fr'}
      pfpUrls={overrides.pfpUrls ?? {}}
    />,
  );
}

const FOUR_RESULTS = [
  entry({ rank: 1, participantId: BOB, displayName: 'bob', wpm: 50 }),
  entry({ rank: 2, participantId: ADA, displayName: 'ada', wpm: 42 }),
  entry({ rank: 3, participantId: CARL, displayName: 'carl', wpm: 35, status: 'timeout' }),
  entry({ rank: 4, participantId: GUEST, displayName: 'Gimli', kind: 'guest', wpm: 30, status: 'quit' }),
];

describe('recordBeaten (RES-04 logic)', () => {
  test('a record is beaten strictly above a positive prior best', () => {
    expect(recordBeaten(43, 42)).toBe(true);
    expect(recordBeaten(42, 42)).toBe(false);
    expect(recordBeaten(41, 42)).toBe(false);
  });

  test('no prior best (null or 0) never beats', () => {
    expect(recordBeaten(50, null)).toBe(false);
    expect(recordBeaten(50, 0)).toBe(false);
    expect(recordBeaten(null, 42)).toBe(false);
  });
});

describe('podium (RES-01)', () => {
  test('orders the pedestals 2nd, 1st, 3rd from left to right with names and wpm', () => {
    renderResults(makeResults(FOUR_RESULTS));

    const places = screen.getAllByTestId('results-podium-place');
    expect(places.map((place) => place.getAttribute('data-rank'))).toEqual(['2', '1', '3']);

    const winner = places.find((place) => place.getAttribute('data-rank') === '1');
    expect(winner).toHaveTextContent('bob');
    expect(winner).toHaveTextContent('50');
    expect(screen.getByTestId('results-podium')).toHaveTextContent(fr['results.podium.title']);
  });

  test('the winner pedestal is gold-tinted (stone styling, no emojis)', () => {
    renderResults(makeResults(FOUR_RESULTS));
    const places = screen.getAllByTestId('results-podium-place');
    const winner = places.find((place) => place.getAttribute('data-rank') === '1');
    const second = places.find((place) => place.getAttribute('data-rank') === '2');
    // The gold edge sits on the pedestal block inside the winner's column.
    expect(winner?.outerHTML).toContain('border-dwarf-gold');
    expect(second?.outerHTML).not.toContain('border-dwarf-gold');
    expect(screen.queryByText(/[🏆🥇🥈🥉]/)).not.toBeInTheDocument();
  });

  test('renders only the places that exist', () => {
    renderResults(makeResults([FOUR_RESULTS[0], FOUR_RESULTS[1]]));
    expect(screen.getAllByTestId('results-podium-place').map((p) => p.getAttribute('data-rank'))).toEqual([
      '2',
      '1',
    ]);
  });
});

describe('results table (RES-02)', () => {
  test('renders every row with rank, stats and localized statuses (fr)', () => {
    renderResults(makeResults(FOUR_RESULTS), { localParticipantId: ADA });

    const rows = screen.getAllByTestId('results-row');
    expect(rows).toHaveLength(4);
    expect(rows[0].getAttribute('data-rank')).toBe('1');
    expect(rows[0]).toHaveTextContent('bob');
    expect(rows[0]).toHaveTextContent('50'); // wpm
    expect(rows[0]).toHaveTextContent('46'); // raw wpm
    expect(rows[0]).toHaveTextContent('94'); // accuracy
    expect(rows[0]).toHaveTextContent('3'); // errors

    expect(screen.getAllByText(fr['race.results.status.finished']).length).toBeGreaterThan(0);
    expect(screen.getByText(fr['race.results.status.timeout'])).toBeInTheDocument();
    expect(screen.getByText(fr['race.results.status.quit'])).toBeInTheDocument();

    // The bonuses column is present and localized, always 0 until Phase 4.
    expect(screen.getByRole('columnheader', { name: fr['results.table.bonuses'] })).toBeInTheDocument();
    const bonusCells = screen.getAllByTestId('results-bonuses');
    expect(bonusCells).toHaveLength(4);
    expect(bonusCells[0]).toHaveTextContent('0');

    // The local row is highlighted.
    const localRow = rows.find((row) => row.getAttribute('data-local') === 'true');
    expect(localRow).toHaveTextContent('ada');
    expect(localRow).toHaveTextContent('(VOUS)');
  });

  test('localizes headers and statuses in English', () => {
    renderResults(
      makeResults([
        entry({ rank: 1, participantId: BOB, displayName: 'bob', status: 'timeout' }),
        entry({ rank: 2, participantId: ADA, displayName: 'ada', status: 'quit' }),
      ]),
      { lang: 'en', localParticipantId: ADA },
    );

    expect(screen.getByRole('columnheader', { name: en['results.table.rawWpm'] })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: en['results.table.accuracy'] })).toBeInTheDocument();
    expect(screen.getByText(en['race.results.status.timeout'])).toBeInTheDocument();
    expect(screen.getByText(en['race.results.status.quit'])).toBeInTheDocument();
  });

  test('marks bot-kind participants with the localized tag (podium + table)', () => {
    renderResults(
      makeResults([
        entry({ rank: 1, participantId: '66666666-6666-4666-8666-666666666666', displayName: 'Noob-1', kind: 'bot', status: 'quit' }),
        entry({ rank: 2, participantId: ADA, displayName: 'ada' }),
      ]),
    );
    expect(screen.getAllByText(fr['results.botTag'])).toHaveLength(2);
  });

  test('formats the elapsed time with locale decimals and the seconds unit', () => {
    renderResults(makeResults([entry({ finishedAtMs: 20_500 })]));
    // fr: 20,5 s (comma decimal, narrow no-break space).
    const cell = screen.getByText(/20[,.]5\s*s/);
    expect(cell).toBeInTheDocument();
  });
});

describe('wpm-over-time chart (RES-03)', () => {
  test('draws one polyline per participant series and a legend entry per participant', () => {
    renderResults(
      makeResults([
        entry({
          rank: 1,
          participantId: BOB,
          displayName: 'bob',
          wpmSeries: [
            { elapsedMs: 1_000, wpm: 40 },
            { elapsedMs: 2_000, wpm: 50 },
          ],
        }),
        entry({
          rank: 2,
          participantId: ADA,
          displayName: 'ada',
          wpmSeries: [
            { elapsedMs: 1_000, wpm: 30 },
            { elapsedMs: 2_000, wpm: 42 },
          ],
        }),
      ]),
    );

    const lines = screen.getAllByTestId('results-wpm-chart-line');
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.getAttribute('data-participant-id'))).toEqual([BOB, ADA]);
    expect(lines[0].tagName.toLowerCase()).toBe('polyline');

    const legend = screen.getByTestId('results-wpm-chart-legend');
    expect(legend).toHaveTextContent('bob');
    expect(legend).toHaveTextContent('ada');
    expect(screen.getByText(fr['results.chart.title'])).toBeInTheDocument();
  });

  test('a single-sample series renders a dot; an empty series has no line', () => {
    renderResults(
      makeResults([
        entry({ rank: 1, participantId: BOB, displayName: 'bob', wpmSeries: [{ elapsedMs: 1_000, wpm: 40 }] }),
        entry({ rank: 2, participantId: ADA, displayName: 'ada', wpmSeries: [] }),
      ]),
    );

    const lines = screen.getAllByTestId('results-wpm-chart-line');
    expect(lines).toHaveLength(1);
    expect(lines[0].tagName.toLowerCase()).toBe('circle');
    // The empty-series participant still has a legend entry.
    expect(screen.getByTestId('results-wpm-chart-legend')).toHaveTextContent('ada');
  });

  test('the pure geometry helpers map series into the view box', () => {
    const line = buildChartLine(
      {
        participantId: BOB,
        displayName: 'bob',
        wpmSeries: [
          { elapsedMs: 0, wpm: 0 },
          { elapsedMs: 10_000, wpm: 100 },
        ],
      },
      10_000,
      100,
    );
    expect(line.points).not.toBeNull();
    const corners = scaleChartPoint(10_000, 100, 10_000, 100);
    expect(corners.x).toBeCloseTo(600 - 18, 0);
    expect(corners.y).toBeCloseTo(18, 0);
  });
});

describe('keyboard heatmap (RES-03)', () => {
  test('tints keys by error count and reports the weakest key', () => {
    renderResults(
      makeResults([entry(), entry({ rank: 2, participantId: BOB, displayName: 'bob' })]),
      { keyErrors: { a: 1, s: 4, k: 7 } },
    );

    const key = (dataKey: string) =>
      screen.getAllByTestId('results-heatmap-key').find((el) => el.getAttribute('data-key') === dataKey);

    expect(key('a')?.getAttribute('data-tone')).toBe('few');
    expect(key('a')?.getAttribute('data-count')).toBe('1');
    expect(key('s')?.getAttribute('data-tone')).toBe('many');
    expect(key('k')?.getAttribute('data-tone')).toBe('top');
    expect(key('z')?.getAttribute('data-tone')).toBe('plain');
    expect(key('z')?.getAttribute('data-count')).toBe('0');

    expect(screen.getByTestId('results-heatmap-weakest')).toHaveTextContent('K');
    expect(screen.getByTestId('results-heatmap-weakest')).toHaveTextContent('7');
    expect(screen.getByTestId('results-heatmap-weakest')).toHaveTextContent(
      fr['results.heatmap.weakestLabel'],
    );
  });

  test('space errors tint the space bar', () => {
    renderResults(makeResults([entry()]), { keyErrors: { ' ': 3 } });
    const space = screen
      .getAllByTestId('results-heatmap-key')
      .find((el) => el.getAttribute('data-key') === ' ');
    expect(space?.getAttribute('data-tone')).toBe('many');
    expect(space).toHaveTextContent(fr['account.heatmap.key.space']);
  });

  test('a clean race shows the no-errors state; null shows the unavailable state', () => {
    const clean = renderResults(makeResults([entry()]), { keyErrors: {} });
    expect(clean.getByTestId('results-heatmap-no-errors')).toHaveTextContent(
      fr['results.heatmap.noErrors'],
    );
    clean.unmount();

    renderResults(makeResults([entry()]), { keyErrors: null });
    expect(screen.getByTestId('results-heatmap-unavailable')).toHaveTextContent(
      fr['results.heatmap.unavailable'],
    );
  });

  test('the tone buckets are 0 → plain, 1–2 → few, 3–5 → many, 6+ → top', () => {
    expect(toneForErrorCount(0)).toBe('plain');
    expect(toneForErrorCount(1)).toBe('few');
    expect(toneForErrorCount(2)).toBe('few');
    expect(toneForErrorCount(3)).toBe('many');
    expect(toneForErrorCount(5)).toBe('many');
    expect(toneForErrorCount(6)).toBe('top');
    expect(toneForErrorCount(40)).toBe('top');
  });
});

describe('personal record indicator (RES-04)', () => {
  const withOwn = () =>
    makeResults([
      entry({ rank: 1, participantId: BOB, displayName: 'bob', wpm: 90 }),
      entry({ rank: 2, participantId: ADA, displayName: 'ada', wpm: 42 }),
    ]);

  test('shows the badge when the local wpm beats the prior best', () => {
    renderResults(withOwn(), { localParticipantId: ADA, bestWpm: 40 });
    const badge = screen.getByTestId('results-record');
    expect(badge).toHaveTextContent(fr['results.record.beaten']);
    expect(badge).toHaveTextContent(fr['results.record.previousBest']);
  });

  test('stays hidden when the local wpm does not beat the best, or with no prior best', () => {
    const notBeaten = renderResults(withOwn(), { localParticipantId: ADA, bestWpm: 99 });
    expect(notBeaten.queryByTestId('results-record')).not.toBeInTheDocument();
    notBeaten.unmount();

    const noBest = renderResults(withOwn(), { localParticipantId: ADA, bestWpm: null });
    expect(noBest.queryByTestId('results-record')).not.toBeInTheDocument();
  });

  test('the comparison uses the LOCAL player’s line and shows the prior best value', () => {
    renderResults(withOwn(), { localParticipantId: ADA, bestWpm: 40 });
    // ada (42) beats 40 → badge; the displayed previous best is the viewer's
    // own 40, not the rival's 90.
    const badge = screen.getByTestId('results-record');
    expect(badge).toHaveTextContent(fr['results.record.beaten']);
    expect(badge).toHaveTextContent('40');
    expect(badge).not.toHaveTextContent('90');
  });
});
