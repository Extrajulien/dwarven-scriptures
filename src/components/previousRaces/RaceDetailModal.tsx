'use client';

import { useEffect } from 'react';
import type { ArchiveRaceEntry } from '../../db/queries/races';
import { formatDateTime, formatDurationMmSs, formatNumber } from '../../i18n/format';
import type { Locale, Messages } from '../../i18n/messages';
import ButtonPrimary from '../ButtonPrimary';
import ButtonSecondary from '../ButtonSecondary';
import Icon from '../Icon';
import { rankBadgeClass } from '../../data/previousRacesData';

/**
 * Full "race dossier" dialog opened by clicking a row. Renders the real
 * persisted standings, the text excerpt and the viewer's position, with the
 * full results reachable through the replay link. Closes on Escape, backdrop
 * click or the close button (A11Y-01).
 */
export default function RaceDetailModal({
  entry,
  onClose,
  messages,
  locale,
}: {
  entry: ArchiveRaceEntry | null;
  onClose: () => void;
  messages: Messages;
  locale: Locale;
}) {
  useEffect(() => {
    if (!entry) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [entry, onClose]);

  if (!entry) {
    return null;
  }

  const isPrivate = entry.visibility !== 'public';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={messages['previousRaces.title']}
        className="stone-card max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-outline-variant bg-surface p-6 font-mono text-xs text-on-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          autoFocus
          onClick={onClose}
          aria-label={messages['previousRaces.modal.close']}
          className="absolute top-5 right-5 rounded p-1.5 text-outline transition hover:bg-surface-container hover:text-primary"
        >
          <Icon name="close" className="text-xl" />
        </button>

        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-widest text-outline">
          <span>{messages['previousRaces.breadcrumb']}</span>
        </div>

        <div className="mb-6 flex flex-col justify-between gap-4 border-b border-outline-variant pb-4 md:flex-row md:items-center">
          <div>
            <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-on-surface">
              #{entry.publicId.slice(0, 8)}
            </h2>
            <p className="mt-1 text-on-surface-variant">
              {messages['previousRaces.modal.completedOn']}{' '}
              {formatDateTime(entry.finishedAt, locale)}.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`flex items-center rounded px-2.5 py-1 text-xs font-bold ${
                isPrivate
                  ? 'border border-secondary/40 bg-secondary/10 text-secondary'
                  : 'border border-outline-variant bg-surface-container text-on-surface-variant'
              }`}
            >
              <Icon name={isPrivate ? 'lock' : 'public'} className="mr-1 text-sm" />
              {isPrivate
                ? messages['previousRaces.badge.private']
                : messages['previousRaces.badge.public']}
            </span>
            <span className="rounded border border-outline-variant bg-surface-container px-2.5 py-1 text-on-surface-variant">
              {entry.textLanguage.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded border border-outline-variant bg-surface-container-low p-3">
            <div className="text-[10px] uppercase text-outline">
              {messages['previousRaces.col.champion']}
            </div>
            <div className="mt-1 text-sm font-bold text-primary">{entry.champion?.displayName}</div>
            <div className="text-[10px] text-outline">
              {entry.champion
                ? `${formatNumber(Math.round(entry.champion.wpm), locale)} ${messages['previousRaces.metrics.wpmUnit']}`
                : '—'}
            </div>
          </div>

          <div className="rounded border border-outline-variant bg-surface-container-low p-3">
            <div className="text-[10px] uppercase text-outline">
              {messages['previousRaces.modal.yourPosition']}
            </div>
            <div className="mt-1 text-sm font-bold text-tertiary">
              {entry.viewer
                ? `#${formatNumber(entry.viewer.rank, locale)}`
                : messages['previousRaces.didNotJoin']}
            </div>
            <div className="text-[10px] text-outline">
              {entry.viewer
                ? `${formatNumber(Math.round(entry.viewer.wpm), locale)} ${messages['previousRaces.metrics.wpmUnit']}`
                : '—'}
            </div>
          </div>

          <div className="rounded border border-outline-variant bg-surface-container-low p-3">
            <div className="text-[10px] uppercase text-outline">
              {messages['previousRaces.modal.participantsLabel']}
            </div>
            <div className="mt-1 text-sm font-bold text-on-surface">
              {formatNumber(entry.participantCount, locale)}
            </div>
          </div>

          <div className="rounded border border-outline-variant bg-surface-container-low p-3">
            <div className="text-[10px] uppercase text-outline">
              {messages['previousRaces.modal.colDuration']}
            </div>
            <div className="mt-1 text-sm font-bold text-on-surface">
              {formatDurationMmSs(entry.durationMs, locale)}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between font-bold uppercase text-on-surface">
            <span className="flex items-center gap-1.5">
              <Icon name="format_list_numbered" className="text-base text-primary" />
              {messages['previousRaces.modal.participantsLabel']} {entry.participantCount}
            </span>
            <span className="text-[11px] font-normal text-outline">
              {messages['previousRaces.modal.sortedBy']}
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-lowest/50 text-[10px] uppercase text-outline">
                  <th className="px-3 py-2.5">{messages['previousRaces.modal.colRank']}</th>
                  <th className="px-3 py-2.5">{messages['previousRaces.modal.colScribe']}</th>
                  <th className="px-3 py-2.5">{messages['previousRaces.modal.colSpeed']}</th>
                  <th className="px-3 py-2.5">{messages['previousRaces.modal.colAccuracy']}</th>
                  <th className="px-3 py-2.5">{messages['previousRaces.modal.colFaults']}</th>
                  <th className="px-3 py-2.5">{messages['previousRaces.modal.colDuration']}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/60">
                {entry.standings.map((standing) => (
                  <tr
                    key={standing.rank}
                    className={`transition-colors hover:bg-surface-container-high/40 ${
                      standing.isViewer ? 'bg-primary/10' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-block rounded px-2 py-0.5 font-label-sm text-label-sm font-bold ${rankBadgeClass(
                          standing.rank,
                        )}`}
                      >
                        #{formatNumber(standing.rank, locale)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={standing.isViewer ? 'font-bold text-primary' : ''}>
                        {standing.displayName}
                      </span>
                      {standing.isViewer && (
                        <span className="ml-1.5 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-on-primary">
                          {messages['previousRaces.you']}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-bold">
                      {formatNumber(Math.round(standing.wpm), locale)}{' '}
                      {messages['previousRaces.metrics.wpmUnit']}
                    </td>
                    <td className="px-3 py-2.5 text-tertiary">
                      {formatNumber(Math.round(standing.accuracy), locale)}%
                    </td>
                    <td className="px-3 py-2.5 text-error">
                      {formatNumber(standing.errors, locale)}
                    </td>
                    <td className="px-3 py-2.5 text-outline">
                      {formatDurationMmSs(standing.durationMs, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-outline-variant bg-surface-container-low p-4">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-outline">
            <span>{messages['previousRaces.modal.textExtract']}</span>
            <span>
              {formatNumber(entry.wordCount, locale)} {messages['previousRaces.wordsUnit']}
            </span>
          </div>
          <p className="rounded border border-outline-variant bg-surface-container-lowest p-3 text-sm leading-relaxed text-on-surface-variant italic">
            {entry.textSnippet}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant pt-4">
          <div className="text-[11px] text-outline">
            {messages['previousRaces.modal.chamberId']}:{' '}
            <span className="font-mono text-on-surface-variant">{entry.publicId}</span>
          </div>
          <div className="flex items-center gap-3">
            <ButtonSecondary onClick={onClose}>
              {messages['previousRaces.modal.close']}
            </ButtonSecondary>
            <ButtonSecondary href={`/races/${entry.publicId}`}>
              {messages['previousRaces.modal.viewReplay']}
            </ButtonSecondary>
            <ButtonPrimary href="/race">{messages['previousRaces.modal.rematch']}</ButtonPrimary>
          </div>
        </div>
      </div>
    </div>
  );
}
