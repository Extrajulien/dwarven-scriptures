import type { RaceCountPerDay, UserRaceHistoryEntry } from '../../db/queries/races';
import { formatNumber } from '../../i18n/format';
import type { Locale, Messages } from '../../i18n/messages';
import {
  buildRacesPerDayGeometry,
  buildWpmChartGeometry,
  type RacesPerDayGeometry,
  type WpmChartGeometry,
} from '../../lib/account-charts';
import Icon from '../Icon';

/**
 * Account progression charts (AUTH-06, STAT-3), fed by the user's REAL
 * persisted races (`listRecentUserRaces` / `countUserRacesPerDay`): the WPM
 * line over the most recent races and the races-per-day bars. All geometry
 * is computed by the pure helpers in `src/lib/account-charts.ts`; this
 * component only renders it in the original stone-card visual language.
 * When the user has no races yet, both charts show the honest empty state.
 */

export default function ProgressionCharts({
  recentRaces,
  dailyCounts,
  days,
  messages,
  locale,
}: {
  recentRaces: UserRaceHistoryEntry[];
  dailyCounts: RaceCountPerDay[];
  days: number;
  messages: Messages;
  locale: Locale;
}) {
  const wpm = buildWpmChartGeometry(
    recentRaces.map((race) => ({ wpm: race.wpm, finishedAt: race.finishedAt })),
    locale,
  );
  const daily = buildRacesPerDayGeometry(dailyCounts, days, locale);

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <WpmChart geometry={wpm} messages={messages} locale={locale} />
      <RacesChart geometry={daily} messages={messages} locale={locale} />
    </section>
  );
}

function EmptyChart({ messages }: { messages: Messages }) {
  return (
    <div
      data-testid="account-chart-empty"
      className="stone-card flex min-h-44 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-low p-4"
    >
      <p className="max-w-sm text-center font-body-sm text-body-sm text-dwarf-parchmentMuted">
        {messages['account.chart.empty']}
      </p>
    </div>
  );
}

function WpmChart({
  geometry,
  messages,
  locale,
}: {
  geometry: WpmChartGeometry | null;
  messages: Messages;
  locale: Locale;
}) {
  return (
    <div className="stone-card space-y-3 rounded-lg border border-outline-variant bg-surface-container-low p-4">
      <div className="flex items-center gap-2">
        <Icon name="show_chart" className="text-headline-sm text-primary" />
        <span className="font-display text-label-md font-bold uppercase tracking-wider text-on-surface">
          {messages['account.chart.wpm.title']}
        </span>
      </div>

      {geometry === null ? (
        <EmptyChart messages={messages} />
      ) : (
        <>
          <div className="flex items-baseline justify-between border-b border-outline-variant pb-1 font-mono font-label-sm text-label-sm uppercase tracking-wider text-outline">
            <span>
              {messages['account.chart.wpm.apex']} : {formatNumber(Math.round(geometry.maxWpm), locale)}{' '}
              {messages['account.stats.wpmUnit']}
            </span>
            <span>
              {messages['account.chart.wpm.low']} : {formatNumber(Math.round(geometry.minWpm), locale)}
            </span>
            <span className="font-bold text-primary">
              {messages['account.chart.wpm.current']} :{' '}
              {formatNumber(Math.round(geometry.latestWpm), locale)}
            </span>
          </div>

          <div className="relative h-44 w-full pt-2">
            <svg
              data-testid="account-wpm-chart"
              className="h-full w-full overflow-visible"
              viewBox="0 0 500 150"
              preserveAspectRatio="none"
              role="img"
              aria-label={messages['account.chart.wpm.title']}
            >
              <defs>
                <linearGradient id="goldAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#eec14b" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#eec14b" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="30" x2="500" y2="30" stroke="#4e4635" strokeDasharray="3 3" strokeWidth="0.8" />
              <line x1="0" y1="75" x2="500" y2="75" stroke="#4e4635" strokeDasharray="3 3" strokeWidth="0.8" />
              <line x1="0" y1="120" x2="500" y2="120" stroke="#4e4635" strokeDasharray="3 3" strokeWidth="0.8" />
              <polygon points={geometry.areaPoints} fill="url(#goldAreaGrad)" />
              <polyline
                data-testid="account-wpm-chart-line"
                points={geometry.linePoints}
                fill="none"
                stroke="#eec14b"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {geometry.nodes.map((node, index) => (
                <circle
                  key={index}
                  cx={node.x}
                  cy={node.y}
                  r={node.r}
                  fill={index === geometry.nodes.length - 1 ? '#eec14b' : '#131313'}
                  stroke={index === geometry.nodes.length - 1 ? '#131313' : '#eec14b'}
                  strokeWidth="2"
                />
              ))}
            </svg>
          </div>

          <div className="flex items-center justify-between font-mono font-label-sm text-label-sm text-outline-variant">
            {geometry.ticks.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RacesChart({
  geometry,
  messages,
  locale,
}: {
  geometry: RacesPerDayGeometry;
  messages: Messages;
  locale: Locale;
}) {
  return (
    <div className="stone-card space-y-3 rounded-lg border border-outline-variant bg-surface-container-low p-4">
      <div className="flex items-center gap-2">
        <Icon name="list_alt" className="text-headline-sm text-tertiary" />
        <span className="font-display text-label-md font-bold uppercase tracking-wider text-on-surface">
          {messages['account.chart.races.title']}
        </span>
      </div>

      <div className="flex items-baseline justify-between border-b border-outline-variant pb-1 font-mono font-label-sm text-label-sm uppercase tracking-wider text-outline">
        <span>
          {messages['account.chart.races.total']} : {formatNumber(geometry.totalInWindow, locale)}
        </span>
        <span>
          {messages['account.chart.races.streaks']} : {formatNumber(geometry.streakDays, locale)}
        </span>
        <span className="font-bold text-tertiary">
          {messages['account.chart.races.daily']} : {formatNumber(geometry.todayCount, locale)}
        </span>
      </div>

      <div className="relative h-44 w-full pt-2">
        <svg
          data-testid="account-races-chart"
          className="h-full w-full overflow-visible"
          viewBox="0 0 500 150"
          preserveAspectRatio="none"
          role="img"
          aria-label={messages['account.chart.races.title']}
        >
          <line x1="0" y1="30" x2="500" y2="30" stroke="#4e4635" strokeDasharray="3 3" strokeWidth="0.8" />
          <line x1="0" y1="75" x2="500" y2="75" stroke="#4e4635" strokeDasharray="3 3" strokeWidth="0.8" />
          <line x1="0" y1="120" x2="500" y2="120" stroke="#4e4635" strokeDasharray="3 3" strokeWidth="0.8" />
          {geometry.bars.map((bar, index) => (
            <rect
              key={index}
              data-testid="account-races-chart-bar"
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              fill="#a4d393"
              opacity={bar.opacity}
              rx="2"
            />
          ))}
        </svg>
      </div>

      <div className="flex items-center justify-between font-mono font-label-sm text-label-sm text-outline-variant">
        {geometry.ticks.map((tick, index) => (
          <span key={`${tick}-${index}`}>{tick}</span>
        ))}
      </div>
    </div>
  );
}
