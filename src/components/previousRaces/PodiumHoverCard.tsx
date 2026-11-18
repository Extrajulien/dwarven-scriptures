'use client';

import type { ArchiveRaceEntry } from '../../db/queries/races';
import { formatNumber } from '../../i18n/format';
import type { Locale, Messages } from '../../i18n/messages';
import Icon from '../Icon';

const RANK_TONE = [
  'border-primary/40 bg-primary/10 text-primary',
  'border-outline-variant bg-surface-container-high/40 text-on-surface',
  'border-secondary/40 bg-secondary/10 text-secondary-fixed-dim',
] as const;

/**
 * Mouse-only podium preview shown while a row is hovered (desktop). The
 * accessible path is the full detail modal on click/Enter — this card is an
 * enhancement, not a dependency. `entry` is null when nothing is hovered.
 */
export default function PodiumHoverCard({
  entry,
  messages,
  locale,
}: {
  entry: ArchiveRaceEntry | null;
  messages: Messages;
  locale: Locale;
}) {
  if (!entry) {
    return null;
  }

  const topFive = entry.standings.slice(0, 5);
  const last = entry.standings[entry.standings.length - 1];

  return (
    <div className="pointer-events-none fixed right-4 top-24 z-40 hidden w-[380px] rounded-lg border border-primary/60 bg-surface-container-lowest p-4 font-mono text-xs text-on-surface shadow-2xl md:block">
      <div className="flex items-center justify-between border-b border-outline-variant pb-2 mb-3">
        <div className="flex items-center gap-2">
          <Icon name="military_tech" className="text-base text-primary" />
          <span className="font-display font-bold tracking-wider text-primary">
            #{entry.publicId.slice(0, 8)} {messages['previousRaces.hover.podiumSuffix']}
          </span>
        </div>
        <span className="rounded border border-outline-variant bg-surface-container px-1.5 py-0.5 text-[10px] uppercase text-on-surface-variant">
          {entry.visibility === 'public'
            ? messages['previousRaces.badge.public']
            : messages['previousRaces.badge.private']}
        </span>
      </div>

      <div className="mb-3 space-y-1">
        {topFive.map((standing, index) => (
          <div
            key={standing.rank}
            className={`flex items-center justify-between rounded border px-2 py-1 ${
              RANK_TONE[index] ?? 'border-transparent bg-surface-container-low'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-4 font-bold">{formatNumber(standing.rank, locale)}.</span>
              <span className="font-bold">{standing.displayName}</span>
              {standing.isViewer && (
                <span className="rounded bg-primary px-1 text-[9px] font-bold text-on-primary">
                  {messages['previousRaces.you']}
                </span>
              )}
            </div>
            <div className="text-right">
              <span className="font-bold">
                {formatNumber(Math.round(standing.wpm), locale)}{' '}
                {messages['previousRaces.metrics.wpmUnit']}
              </span>
              <span className="ml-1 text-[10px] text-outline">
                {formatNumber(Math.round(standing.accuracy), locale)}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {last && (
        <div className="rounded border border-error/50 bg-error/10 px-2.5 py-1.5 text-on-surface">
          <div className="text-[9px] font-bold uppercase tracking-wider text-error">
            {messages['previousRaces.hover.lastPlace']}
          </div>
          <div className="flex items-center justify-between">
            <span className="font-bold">
              #{formatNumber(last.rank, locale)} {last.displayName}
            </span>
            <span className="font-bold text-error">
              {formatNumber(Math.round(last.wpm), locale)}{' '}
              {messages['previousRaces.metrics.wpmUnit']}
            </span>
          </div>
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-center gap-1 border-t border-outline-variant pt-2 text-[10px] text-outline">
        <Icon name="touch_app" className="text-[12px] text-primary" />
        <span>{messages['previousRaces.hover.hint']}</span>
      </div>
    </div>
  );
}
