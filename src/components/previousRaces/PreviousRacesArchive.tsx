'use client';

import { useState } from 'react';
import type { ArchiveRaceEntry, ArchiveSummary, RaceArchivePage } from '../../db/queries/races';
import { ARCHIVE_COLUMNS, ARCHIVE_FILTER_TABS, rankBadgeClass } from '../../data/previousRacesData';
import { formatDateTime, formatNumber } from '../../i18n/format';
import type { Locale, Messages } from '../../i18n/messages';
import { buildArchiveHref, type ArchiveFilters } from '../../lib/archive-filters';
import ButtonSecondary from '../ButtonSecondary';
import Icon from '../Icon';
import PodiumHoverCard from './PodiumHoverCard';
import RaceDetailModal from './RaceDetailModal';

const TEXT_TYPE_KEYS = {
  coherent: 'lobby.textType.coherent',
  random: 'lobby.textType.random',
} as const;

function textTypeKey(textType: string): keyof Messages {
  return textType === 'coherent' ? TEXT_TYPE_KEYS.coherent : TEXT_TYPE_KEYS.random;
}

/**
 * The "previous races" archive ledger (real persisted races). Filter tabs,
 * search and pagination are server-driven through `searchParams` links; the
 * hover podium card and the detail modal are client-side (ephemeral UI).
 */
export default function PreviousRacesArchive({
  page,
  summary,
  filters,
  viewerIsGuest,
  locale,
  messages,
}: {
  page: RaceArchivePage;
  summary: ArchiveSummary | null;
  filters: ArchiveFilters;
  viewerIsGuest: boolean;
  locale: Locale;
  messages: Messages;
}) {
  const [hovered, setHovered] = useState<ArchiveRaceEntry | null>(null);
  const [selected, setSelected] = useState<ArchiveRaceEntry | null>(null);

  const columns = ARCHIVE_COLUMNS.filter((column) => !(viewerIsGuest && column.authOnly));
  const tabs = ARCHIVE_FILTER_TABS.filter((tab) => !(viewerIsGuest && tab.authOnly));

  return (
    <div className="flex flex-col gap-space-lg">
      {/* Header title banner */}
      <div className="flex flex-col justify-between gap-6 border-b border-outline-variant pb-6 md:flex-row md:items-end">
        <div>
          <div className="mb-1 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-outline">
            <span>{messages['previousRaces.breadcrumb']}</span>
          </div>
          <h1 className="flex items-center gap-3 font-display text-3xl font-bold tracking-tight text-on-surface md:text-4xl">
            {messages['previousRaces.title']}
          </h1>
          <p className="mt-2 max-w-2xl font-mono text-sm text-on-surface-variant">
            {messages['previousRaces.subtitle']}
          </p>
        </div>

        {summary && (
          <div className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <div className="border-r border-outline-variant px-3">
              <div className="text-[10px] uppercase text-outline">
                {messages['previousRaces.metrics.races']}
              </div>
              <div className="font-display text-lg font-bold text-primary">
                {formatNumber(summary.racesCount, locale)}
              </div>
            </div>
            <div className="border-r border-outline-variant px-3">
              <div className="text-[10px] uppercase text-outline">
                {messages['previousRaces.metrics.podiumRate']}
              </div>
              <div className="font-display text-lg font-bold text-tertiary">
                {formatNumber(summary.podiumRate, locale, { maximumFractionDigits: 1 })}%
              </div>
            </div>
            <div className="px-3">
              <div className="text-[10px] uppercase text-outline">
                {messages['previousRaces.metrics.avgSpeed']}
              </div>
              <div className="font-display text-lg font-bold text-secondary">
                {formatNumber(summary.avgWpm, locale, { maximumFractionDigits: 1 })}{' '}
                <span className="text-[10px] text-outline">
                  {messages['previousRaces.metrics.wpmUnit']}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filters & search toolbar */}
      <div className="stone-card flex flex-col justify-between gap-4 rounded-lg border border-outline-variant bg-surface-container-low p-4 lg:flex-row lg:items-center">
        <form action="/previous-races" method="get" className="relative flex-1" role="search">
          {filters.scope !== 'all' && (
            <input type="hidden" name="scope" value={filters.scope} />
          )}
          <Icon name="search" className="absolute top-1/2 left-3 -translate-y-1/2 text-lg text-outline" />
          <input
            type="text"
            name="q"
            defaultValue={filters.query}
            placeholder={messages['previousRaces.search.placeholder']}
            aria-label={messages['previousRaces.search.label']}
            className="w-full rounded border border-outline-variant bg-surface-container-lowest py-2 pr-4 pl-10 font-mono text-xs text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs uppercase text-outline">
            {messages['previousRaces.filter.label']}
          </span>
          {tabs.map((tab) => {
            const active = filters.scope === tab.id;
            const href = buildArchiveHref(filters, { scope: tab.id });
            return (
              <a
                key={tab.id}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-xs font-medium transition ${
                  active
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-outline-variant bg-surface-container text-on-surface-variant hover:border-primary hover:text-primary'
                }`}
              >
                {tab.icon && <Icon name={tab.icon} className="text-[13px]" />}
                {messages[tab.labelKey]}
              </a>
            );
          })}
        </div>
      </div>

      {/* Ledger table */}
      <div className="relative overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-low shadow-2xl">
        {page.entries.length === 0 ? (
          <p
            data-testid="archive-empty"
            className="py-10 text-center font-body-sm text-body-sm text-dwarf-parchmentMuted"
          >
            {messages['previousRaces.empty']}
          </p>
        ) : (
          <table data-testid="archive-table" className="w-full min-w-[760px] border-collapse text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-lowest text-[11px] uppercase tracking-wider text-outline">
                {columns.map((column) => (
                  <th key={column.labelKey} className={`px-4 py-3.5 ${column.align}`}>
                    {messages[column.labelKey]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/60">
              {page.entries.map((entry) => {
                const isPrivate = entry.visibility !== 'public';
                return (
                  <tr
                    key={entry.publicId}
                    data-testid="archive-row"
                    tabIndex={0}
                    role="button"
                    aria-label={`#${entry.publicId.slice(0, 8)} — ${entry.champion?.displayName ?? ''}`}
                    className="cursor-pointer transition-colors hover:bg-surface-container-high/40"
                    onClick={() => setSelected(entry)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelected(entry);
                      }
                    }}
                    onMouseEnter={() => setHovered(entry)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <td className="px-4 py-4">
                      <div className="font-display font-bold text-on-surface group-hover:text-primary">
                        #{entry.publicId.slice(0, 8)}
                      </div>
                      <div className="text-[10px] text-outline">
                        {formatNumber(entry.wordCount, locale)} {messages['previousRaces.wordsUnit']}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium ${
                          isPrivate
                            ? 'border border-secondary/40 bg-secondary/10 text-secondary'
                            : 'border border-outline-variant bg-surface-container-high text-on-surface-variant'
                        }`}
                      >
                        <Icon name={isPrivate ? 'lock' : 'public'} className="text-[11px]" />
                        {isPrivate
                          ? messages['previousRaces.badge.private']
                          : messages['previousRaces.badge.public']}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {entry.champion && (
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${rankBadgeClass(
                              1,
                            )}`}
                          >
                            1
                          </span>
                        )}
                        <div>
                          <div className="font-bold text-on-surface">
                            {entry.champion?.displayName ?? '—'}
                          </div>
                          {entry.champion && (
                            <div className="text-[10px] text-outline">
                              {formatNumber(Math.round(entry.champion.wpm), locale)}{' '}
                              {messages['previousRaces.metrics.wpmUnit']} •{' '}
                              {formatNumber(Math.round(entry.champion.accuracy), locale)}%
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {!viewerIsGuest && (
                      <td className="px-4 py-4">
                        {entry.viewer ? (
                          <div className="inline-flex items-center gap-2 rounded border border-primary/50 bg-surface-container-lowest px-2.5 py-1">
                            <span
                              className={`rounded px-1.5 py-0.5 font-label-sm text-label-sm font-bold ${rankBadgeClass(
                                entry.viewer.rank,
                              )}`}
                            >
                              #{formatNumber(entry.viewer.rank, locale)}
                            </span>
                            <span className="font-bold text-tertiary">
                              {formatNumber(Math.round(entry.viewer.wpm), locale)}{' '}
                              {messages['previousRaces.metrics.wpmUnit']}
                            </span>
                          </div>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] italic text-outline">
                            <Icon name="visibility" className="text-[13px]" />
                            {messages['previousRaces.didNotJoin']}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-4 text-center text-on-surface">
                      <span className="font-medium">{formatNumber(entry.participantCount, locale)}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded border border-outline-variant bg-surface-container-lowest px-2 py-0.5 text-[10px] text-on-surface">
                          {entry.textLanguage.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-on-surface-variant">
                          {messages[textTypeKey(entry.textType)]}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right text-[11px] text-outline">
                      {formatDateTime(entry.finishedAt, locale)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination footer */}
        <div className="flex flex-col items-center justify-between gap-3 border-t border-outline-variant bg-surface-container-lowest p-4 font-mono text-xs text-outline sm:flex-row">
          <div>
            {messages['previousRaces.showingPrefix']}
            {formatNumber(page.entries.length, locale)} {messages['previousRaces.showingInfix']}{' '}
            <span className="font-bold text-on-surface-variant">
              {formatNumber(page.totalCount, locale)}
            </span>{' '}
            {messages['previousRaces.showingSuffix']}
          </div>
          <div className="flex items-center gap-1.5">
            {page.page > 1 ? (
              <ButtonSecondary href={buildArchiveHref(filters, { page: page.page - 1 })}>
                {messages['previousRaces.footerPrev']}
              </ButtonSecondary>
            ) : (
              <span className="rounded border border-outline-variant/50 px-3 py-2.5 font-label-sm text-label-sm font-bold uppercase text-outline/50">
                {messages['previousRaces.footerPrev']}
              </span>
            )}
            <span className="px-1 font-bold text-primary" data-testid="archive-page">
              {formatNumber(page.page, locale)} / {formatNumber(page.totalPages, locale)}
            </span>
            {page.page < page.totalPages ? (
              <ButtonSecondary href={buildArchiveHref(filters, { page: page.page + 1 })}>
                {messages['previousRaces.footerNext']}
              </ButtonSecondary>
            ) : (
              <span className="rounded border border-outline-variant/50 px-3 py-2.5 font-label-sm text-label-sm font-bold uppercase text-outline/50">
                {messages['previousRaces.footerNext']}
              </span>
            )}
          </div>
        </div>
      </div>

      <PodiumHoverCard entry={hovered} messages={messages} locale={locale} />
      <RaceDetailModal entry={selected} onClose={() => setSelected(null)} messages={messages} locale={locale} />
    </div>
  );
}
