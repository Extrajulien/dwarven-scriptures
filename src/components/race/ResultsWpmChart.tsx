'use client';

import { useMemo } from 'react';
import type { Locale, Messages } from '../../i18n/messages';
import { formatNumber } from '../../i18n/format';
import { localizeBotDisplayName } from '../../lib/race/bot-display';
import type { RaceResultEntry, WpmSeriesPoint } from '../../realtime/protocol';
import Icon from '../Icon';

/**
 * WPM-over-time multi-line chart for ALL participants (RES-03): one polyline
 * per `wpmSeries` from the server (net WPM sampled at ≤ ~4/s by the engine),
 * distinct colours drawn from the theme tokens, a legend and locale-formatted
 * axes (I18N-03). Hand-rolled SVG in the visual language of the account-page
 * `ProgressionCharts` (stone card, dashed gridlines, tick labels) — no chart
 * dependency.
 */

/** Chart colours: theme tokens (adapt to light/dark), cycled per participant. */
export const CHART_COLORS = [
  { line: 'stroke-primary', swatch: 'bg-primary' },
  { line: 'stroke-secondary', swatch: 'bg-secondary' },
  { line: 'stroke-tertiary', swatch: 'bg-tertiary' },
  { line: 'stroke-dwarf-magma', swatch: 'bg-dwarf-magma' },
  { line: 'stroke-dwarf-runeBright', swatch: 'bg-dwarf-runeBright' },
  { line: 'stroke-dwarf-goldLight', swatch: 'bg-dwarf-goldLight' },
  { line: 'stroke-error', swatch: 'bg-error' },
  { line: 'stroke-outline', swatch: 'bg-outline' },
] as const;

/** SVG view box (kept fixed; `preserveAspectRatio="none"` stretches it). */
export const CHART_VIEW_WIDTH = 600;
export const CHART_VIEW_HEIGHT = 240;
const CHART_PADDING = 18;

/** One polyline reduced from a participant's series (pure, exported for tests). */
export type ChartLine = {
  participantId: string;
  displayName: string;
  /** SVG polyline points string, `null` when there is no line to draw. */
  points: string | null;
  /** Position of a single sample, drawn as a dot when the series is short. */
  dot: { x: number; y: number } | null;
};

/** Maps one elapsed/wpm pair into view-box coordinates (pure). */
export function scaleChartPoint(
  elapsedMs: number,
  wpm: number,
  maxElapsedMs: number,
  maxWpm: number,
): { x: number; y: number } {
  const safeMaxElapsed = Math.max(1, maxElapsedMs);
  const safeMaxWpm = Math.max(1, maxWpm);
  const x =
    CHART_PADDING +
    (Math.min(Math.max(0, elapsedMs), safeMaxElapsed) / safeMaxElapsed) *
      (CHART_VIEW_WIDTH - 2 * CHART_PADDING);
  const y =
    CHART_VIEW_HEIGHT -
    CHART_PADDING -
    (Math.min(Math.max(0, wpm), safeMaxWpm) / safeMaxWpm) *
      (CHART_VIEW_HEIGHT - 2 * CHART_PADDING);
  return { x, y };
}

/** Reduces one series to its SVG geometry (pure, exported for tests). */
export function buildChartLine(
  entry: Pick<RaceResultEntry, 'participantId' | 'displayName' | 'wpmSeries'>,
  maxElapsedMs: number,
  maxWpm: number,
): ChartLine {
  const series: WpmSeriesPoint[] = entry.wpmSeries;
  if (series.length === 0) {
    return { participantId: entry.participantId, displayName: entry.displayName, points: null, dot: null };
  }
  if (series.length === 1) {
    const point = series[0];
    return {
      participantId: entry.participantId,
      displayName: entry.displayName,
      points: null,
      dot: scaleChartPoint(point.elapsedMs, point.wpm, maxElapsedMs, maxWpm),
    };
  }
  const points = series
    .map((point) => {
      const { x, y } = scaleChartPoint(point.elapsedMs, point.wpm, maxElapsedMs, maxWpm);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return { participantId: entry.participantId, displayName: entry.displayName, points, dot: null };
}

export default function ResultsWpmChart({
  results,
  messages,
  locale,
}: {
  results: RaceResultEntry[];
  messages: Messages;
  locale: Locale;
}) {
  const { lines, maxElapsedMs, maxWpm } = useMemo(() => {
    const maxElapsed = Math.max(
      1,
      ...results.flatMap((entry) => entry.wpmSeries.map((point) => point.elapsedMs)),
    );
    const maxRate = Math.max(
      1,
      ...results.flatMap((entry) => entry.wpmSeries.map((point) => point.wpm)),
    );
    return {
      // Bot legend labels are localized from their neutral wire name
      // (BOT-04/I18N-01); human names pass through untouched.
      lines: results.map((entry) =>
        buildChartLine(
          entry.kind === 'bot'
            ? { ...entry, displayName: localizeBotDisplayName(entry.displayName, messages) }
            : entry,
          maxElapsed,
          maxRate,
        ),
      ),
      maxElapsedMs: maxElapsed,
      maxWpm: maxRate,
    };
  }, [results, messages]);

  // Gridline/axis values (ProgressionCharts visual language).
  const yTicks = [0, 0.5, 1].map((ratio) => Math.round(maxWpm * ratio));
  const xTicks = [0, 1 / 3, 2 / 3, 1].map((ratio) => Math.round((maxElapsedMs * ratio) / 1_000));

  return (
    <section className="flex flex-col gap-space-sm rounded bg-surface-container-lowest p-space-lg shadow-xl">
      <div className="flex items-center gap-space-sm">
        <Icon name="monitoring" className="text-headline-sm text-primary" />
        <div className="flex flex-col">
          <h2 className="font-label-md text-label-md uppercase text-on-surface">
            {messages['results.chart.title']}
          </h2>
          <span className="font-label-sm text-label-sm text-outline">
            {messages['results.chart.caption']}
          </span>
        </div>
      </div>

      <div className="relative w-full pt-space-sm">
        <svg
          data-testid="results-wpm-chart"
          className="h-48 w-full overflow-visible"
          viewBox={`0 0 ${CHART_VIEW_WIDTH} ${CHART_VIEW_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={messages['results.chart.title']}
        >
          {/* Dashed gridlines at 50 % and 100 % of the WPM axis. */}
          <line
            x1={CHART_PADDING}
            y1={(CHART_VIEW_HEIGHT - 2 * CHART_PADDING) / 2 + CHART_PADDING}
            x2={CHART_VIEW_WIDTH - CHART_PADDING}
            y2={(CHART_VIEW_HEIGHT - 2 * CHART_PADDING) / 2 + CHART_PADDING}
            className="stroke-outline-variant"
            strokeDasharray="3 3"
            strokeWidth="0.8"
          />
          <line
            x1={CHART_PADDING}
            y1={CHART_PADDING}
            x2={CHART_VIEW_WIDTH - CHART_PADDING}
            y2={CHART_PADDING}
            className="stroke-outline-variant"
            strokeDasharray="3 3"
            strokeWidth="0.8"
          />
          {lines.map((line, index) => {
            const color = CHART_COLORS[index % CHART_COLORS.length];
            if (line.points === null && line.dot === null) {
              return null;
            }
            return line.points !== null ? (
              <polyline
                key={line.participantId}
                data-testid="results-wpm-chart-line"
                data-participant-id={line.participantId}
                points={line.points}
                fill="none"
                className={color.line}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <circle
                key={line.participantId}
                data-testid="results-wpm-chart-line"
                data-participant-id={line.participantId}
                cx={line.dot?.x ?? 0}
                cy={line.dot?.y ?? 0}
                r="4"
                fill="none"
                className={color.line}
                strokeWidth="2.5"
              />
            );
          })}
        </svg>
      </div>

      <div className="flex items-center justify-between font-mono font-label-sm text-label-sm text-outline-variant">
        {xTicks.map((seconds, index) => (
          <span key={`${seconds}-${index}`}>
            {formatNumber(seconds, locale)} s
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between font-mono font-label-sm text-label-sm text-outline-variant">
        <span aria-hidden="true">{formatNumber(yTicks[0], locale)}</span>
        <span aria-hidden="true">{formatNumber(yTicks[1], locale)}</span>
        <span aria-hidden="true">{formatNumber(yTicks[2], locale)}</span>
        <span className="sr-only">{messages['race.liveWpmLabel']}</span>
      </div>

      <ul
        data-testid="results-wpm-chart-legend"
        className="flex flex-wrap gap-space-sm font-label-sm text-label-sm"
      >
        {lines.map((line, index) => {
          const color = CHART_COLORS[index % CHART_COLORS.length];
          return (
            <li key={line.participantId} className="flex items-center gap-space-xs">
              <span className={`h-3 w-3 rounded ${color.swatch}`} aria-hidden="true" />
              <span className="text-on-surface-variant">{line.displayName}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
