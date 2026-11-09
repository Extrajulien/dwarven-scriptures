import type { Locale } from '../i18n/messages';

/**
 * Pure SVG geometry for the account progression charts (AUTH-06, STAT-3),
 * computed from the user's real persisted races (`src/db/queries/races.ts`).
 * Everything here is deterministic and unit-tested; the `ProgressionCharts`
 * component only renders the returned numbers, in the same 500×150 viewBox
 * and visual language the original account charts used.
 */

export const CHART_VIEW_WIDTH = 500;
export const CHART_VIEW_HEIGHT = 150;

/** Plot area: padding around the lines/bars. */
const CHART_PADDING_X = 10;
const CHART_TOP = 20;
const CHART_BOTTOM = 145;

// ------------------------------------------------------------------ WPM line

/** One point of the WPM-over-races line (most recent races, oldest first). */
export type WpmProgressionPoint = {
  wpm: number;
  finishedAt: Date;
};

export type WpmChartGeometry = {
  /** `x,y` pairs of the polyline. */
  linePoints: string;
  /** `linePoints` closed against the baseline for the area fill. */
  areaPoints: string;
  nodes: { x: number; y: number; r: number }[];
  maxWpm: number;
  minWpm: number;
  latestWpm: number;
  /** Short locale dates, one per race, sampled to at most 6. */
  ticks: string[];
};

function xFor(index: number, count: number): number {
  if (count <= 1) {
    return CHART_PADDING_X;
  }
  return (
    CHART_PADDING_X +
    (index / (count - 1)) * (CHART_VIEW_WIDTH - 2 * CHART_PADDING_X)
  );
}

function yForWpm(wpm: number, maxWpm: number): number {
  const ratio = Math.min(Math.max(0, wpm), maxWpm) / maxWpm;
  return CHART_BOTTOM - ratio * (CHART_BOTTOM - CHART_TOP);
}

/**
 * Builds the WPM-progression chart geometry from the user's most recent
 * races (chronological order). `null` when there is nothing to draw.
 */
export function buildWpmChartGeometry(
  races: WpmProgressionPoint[],
  locale: Locale,
): WpmChartGeometry | null {
  if (races.length === 0) {
    return null;
  }

  const maxWpm = Math.max(1, ...races.map((race) => race.wpm));
  const minWpm = Math.min(...races.map((race) => race.wpm));
  const latestWpm = races[races.length - 1].wpm;

  const points = races.map((race, index) => ({
    x: xFor(index, races.length),
    y: yForWpm(race.wpm, maxWpm),
  }));
  const linePoints = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const areaPoints = `${linePoints} ${CHART_VIEW_WIDTH - CHART_PADDING_X},${CHART_BOTTOM} ${CHART_PADDING_X},${CHART_BOTTOM}`;

  const nodes = points.map((point, index) => ({
    ...point,
    // The latest race is the "current" marker: larger node.
    r: index === points.length - 1 ? 5 : 3.5,
  }));

  // At most 6 evenly sampled date labels (the oldest, the newest and 4 in
  // between) — dates are data, formatted by locale (I18N-03).
  const ticks = sampleTicks(races.map((race) => race.finishedAt), locale);

  return {
    linePoints,
    areaPoints,
    nodes,
    maxWpm,
    minWpm,
    latestWpm,
    ticks,
  };
}

/** Short locale date labels, sampled down to at most 6 entries. */
function sampleTicks(dates: Date[], locale: Locale): string[] {
  if (dates.length === 0) {
    return [];
  }
  if (dates.length <= 6) {
    return dates.map((date) => formatShortDate(date, locale));
  }
  const indexes = new Set<number>([0, dates.length - 1]);
  for (let step = 1; indexes.size < 6 && step < dates.length; step += 1) {
    for (let index = step; index < dates.length && indexes.size < 6; index += step + 1) {
      indexes.add(index);
    }
  }
  return [...indexes].sort((a, b) => a - b).map((index) => formatShortDate(dates[index], locale));
}

function formatShortDate(value: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(value);
}

// ----------------------------------------------------------- races-per-day bars

/** One aggregated day bucket from `countUserRacesPerDay` (`YYYY-MM-DD`, UTC). */
export type RaceCountPerDay = {
  day: string;
  count: number;
};

export type RacesPerDayGeometry = {
  bars: { x: number; y: number; width: number; height: number; opacity: number }[];
  maxCount: number;
  /** Races inside the whole displayed window. */
  totalInWindow: number;
  /** Races on the current UTC day. */
  todayCount: number;
  /**
   * Consecutive days with at least one race, ending today — when today has
   * no race yet, the streak is measured up to yesterday instead.
   */
  streakDays: number;
  /** Short locale weekday labels, oldest day first. */
  ticks: string[];
};

/** `YYYY-MM-DD` key of a date, in UTC. */
export function utcDayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** The UTC day key `daysBack` days before `now`. */
function dayKeyDaysAgo(now: Date, daysBack: number): string {
  const date = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1_000);
  return utcDayKey(date);
}

/**
 * Builds the races-per-day bar chart from the SQL day buckets: the last
 * `days` UTC days (oldest first), missing days filled with 0. The streak
 * counts consecutive active days ending today, or ending yesterday when
 * today is still empty.
 */
export function buildRacesPerDayGeometry(
  counts: RaceCountPerDay[],
  days: number,
  locale: Locale,
  now: Date = new Date(),
): RacesPerDayGeometry {
  const safeDays = Math.max(1, Math.trunc(days));
  const byDay = new Map(counts.map((entry) => [entry.day, entry.count]));

  const window = Array.from({ length: safeDays }, (_value, index) => {
    const day = dayKeyDaysAgo(now, safeDays - 1 - index);
    return { day, count: byDay.get(day) ?? 0 };
  });

  const maxCount = Math.max(1, ...window.map((entry) => entry.count));
  const barGap = 14;
  const barWidth = (CHART_VIEW_WIDTH - 2 * CHART_PADDING_X - barGap * (safeDays - 1)) / safeDays;

  const bars = window.map((entry, index) => {
    const height = Math.max(0, (entry.count / maxCount) * (CHART_BOTTOM - CHART_TOP));
    return {
      x: Math.round(CHART_PADDING_X + index * (barWidth + barGap)),
      y: Math.round(CHART_BOTTOM - height),
      width: Math.round(barWidth),
      height: Math.round(height),
      opacity: entry.count > 0 ? 0.9 : 0.25,
    };
  });

  const todayKey = utcDayKey(now);
  const yesterdayKey = dayKeyDaysAgo(now, 1);
  const todayCount = byDay.get(todayKey) ?? 0;

  let streakDays = 0;
  let cursor = todayCount > 0 ? todayKey : yesterdayKey;
  while (byDay.get(cursor) !== undefined && (byDay.get(cursor) ?? 0) > 0) {
    streakDays += 1;
    cursor = dayKeyDaysAgo(new Date(`${cursor}T00:00:00Z`), 1);
  }

  const ticks = window.map((entry) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(
      new Date(`${entry.day}T00:00:00Z`),
    ),
  );

  return {
    bars,
    maxCount,
    totalInWindow: window.reduce((sum, entry) => sum + entry.count, 0),
    todayCount,
    streakDays,
    ticks,
  };
}
