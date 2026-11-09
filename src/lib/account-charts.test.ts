/**
 * @jest-environment node
 *
 * Pure geometry for the account progression charts (AUTH-06, STAT-3):
 * deterministic SVG numbers from the user's persisted races.
 */

import {
  buildRacesPerDayGeometry,
  buildWpmChartGeometry,
  utcDayKey,
  type RaceCountPerDay,
  type WpmProgressionPoint,
} from './account-charts';

const NOW = new Date('2026-01-10T12:00:00.000Z');

function race(wpm: number, day: string): WpmProgressionPoint {
  return { wpm, finishedAt: new Date(`${day}T10:00:00.000Z`) };
}

describe('buildWpmChartGeometry', () => {
  test('returns null when there is no race to draw', () => {
    expect(buildWpmChartGeometry([], 'fr')).toBeNull();
  });

  test('builds a chronological polyline with the latest race as the current node', () => {
    const geometry = buildWpmChartGeometry(
      [race(80, '2026-01-01'), race(90, '2026-01-02'), race(120, '2026-01-03')],
      'fr',
    );

    expect(geometry).not.toBeNull();
    expect(geometry?.linePoints.split(' ')).toHaveLength(3);
    expect(geometry?.areaPoints.startsWith(geometry?.linePoints ?? '')).toBe(true);
    expect(geometry?.maxWpm).toBe(120);
    expect(geometry?.minWpm).toBe(80);
    expect(geometry?.latestWpm).toBe(120);
    expect(geometry?.nodes).toHaveLength(3);
    // The latest race is the highlighted "current" node (larger radius).
    expect(geometry?.nodes[2].r).toBe(5);
    expect(geometry?.nodes[0].r).toBe(3.5);
    expect(geometry?.ticks).toHaveLength(3);
  });

  test('handles a single race without dividing by zero', () => {
    const geometry = buildWpmChartGeometry([race(100, '2026-01-01')], 'en');

    expect(geometry?.linePoints.split(' ')).toHaveLength(1);
    expect(geometry?.maxWpm).toBe(100);
    expect(geometry?.minWpm).toBe(100);
  });
});

describe('buildRacesPerDayGeometry', () => {
  const counts: RaceCountPerDay[] = [
    { day: '2026-01-07', count: 1 },
    { day: '2026-01-09', count: 2 },
    { day: '2026-01-10', count: 3 },
  ];

  test('fills the window with zero days and computes the totals', () => {
    const geometry = buildRacesPerDayGeometry(counts, 6, 'en', NOW);

    expect(geometry.bars).toHaveLength(6);
    expect(geometry.todayCount).toBe(3);
    expect(geometry.totalInWindow).toBe(6);
    expect(geometry.maxCount).toBe(3);
    // Empty days render as faint placeholder bars.
    expect(geometry.bars[1].opacity).toBe(0.25);
    expect(geometry.bars[1].height).toBe(0);
    expect(geometry.bars[5].height).toBeGreaterThan(0);
  });

  test('measures the streak up to yesterday when today has no race yet', () => {
    const geometry = buildRacesPerDayGeometry(
      [
        { day: '2026-01-08', count: 1 },
        { day: '2026-01-09', count: 2 },
      ],
      6,
      'en',
      NOW,
    );

    // Today (2026-01-10) is empty; the streak still ends at yesterday.
    expect(geometry.todayCount).toBe(0);
    expect(geometry.streakDays).toBe(2);
  });

  test('stops the streak at the first empty day', () => {
    const geometry = buildRacesPerDayGeometry(
      [
        { day: '2026-01-08', count: 1 },
        { day: '2026-01-10', count: 4 },
      ],
      6,
      'en',
      NOW,
    );

    expect(geometry.streakDays).toBe(1);
  });

  test('produces one tick label per displayed day', () => {
    const geometry = buildRacesPerDayGeometry([], 6, 'fr', NOW);
    expect(geometry.ticks).toHaveLength(6);
  });
});

describe('utcDayKey', () => {
  test('formats a date as its UTC YYYY-MM-DD day', () => {
    expect(utcDayKey(new Date('2026-01-10T23:30:00.000Z'))).toBe('2026-01-10');
  });
});
