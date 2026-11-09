import Link from 'next/link';
import type { RaceHistoryPage, UserRaceHistoryEntry } from '../../db/queries/races';
import { formatDateTime, formatDurationMmSs, formatNumber } from '../../i18n/format';
import type { Locale, Messages } from '../../i18n/messages';
import Icon from '../Icon';

/**
 * Race history table (HIST-01), fed by the user's REAL persisted races
 * (`listUserRaces`, LIMIT/OFFSET pagination documented in
 * `src/db/queries/races.ts`). Every row links to its full results replay
 * (`/races/[publicId]`, HIST-02). The language column shows the ISO code of
 * the race text (`FR`/`EN` — data, not copy); dates and numbers are
 * formatted with the active locale (I18N-03).
 */

const COLUMN_ALIGN = [
  'text-left',
  'text-right',
  'text-right',
  'text-center',
  'text-left',
  'text-right',
] as const;

const COLUMN_KEYS: readonly (keyof Messages)[] = [
  'account.history.colDate',
  'account.history.colWpm',
  'account.history.colAccuracy',
  'account.history.colPlace',
  'account.history.colLanguage',
  'account.history.colDuration',
];

function HistoryRow({
  entry,
  locale,
}: {
  entry: UserRaceHistoryEntry;
  locale: Locale;
}) {
  return (
    <tr className="transition-colors hover:bg-surface-container-high/40">
      <td className="px-3 py-3 text-on-surface-variant">
        <Link
          href={`/races/${entry.publicId}`}
          className="font-bold text-on-surface underline-offset-4 hover:underline"
        >
          {formatDateTime(entry.finishedAt, locale)}
        </Link>
      </td>
      <td className="px-3 py-3 text-right font-extrabold text-primary">
        {formatNumber(Math.round(entry.wpm), locale)}
      </td>
      <td className="px-3 py-3 text-right font-bold text-tertiary">
        {formatNumber(Math.round(entry.accuracy), locale)} %
      </td>
      <td className="px-3 py-3 text-center">
        <span
          data-testid="history-rank"
          className={`inline-block rounded px-2 py-0.5 font-label-sm text-label-sm font-bold ${
            entry.rank === 1
              ? 'bg-primary text-on-primary'
              : 'bg-surface-container-highest text-secondary border border-outline-variant'
          }`}
        >
          #{formatNumber(entry.rank, locale)}
        </span>
      </td>
      <td className="px-3 py-3 uppercase text-on-surface-variant">{entry.textLanguage}</td>
      <td className="px-3 py-3 text-right text-outline">
        {formatDurationMmSs(entry.finishedAtMs, locale)}
      </td>
    </tr>
  );
}

export default function RaceHistory({
  page,
  messages,
  locale,
}: {
  page: RaceHistoryPage;
  messages: Messages;
  locale: Locale;
}) {
  const hasPrev = page.page > 1;
  const hasNext = page.page < page.totalPages;
  const firstShown = page.entries.length === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const lastShown = (page.page - 1) * page.pageSize + page.entries.length;

  return (
    <section className="stone-card space-y-4 rounded-lg border border-outline-variant bg-surface-container-low p-4 md:p-6">
      <div className="flex flex-col justify-between gap-3 border-b border-outline-variant pb-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Icon name="list_alt" className="text-[20px] text-primary" />
          <h2 className="font-display text-headline-sm font-bold uppercase tracking-wider text-on-surface">
            {messages['account.history.title']}
          </h2>
          <span className="font-mono font-label-sm text-label-sm text-outline">
            {messages['account.history.caption']}
          </span>
        </div>
      </div>

      {page.entries.length === 0 ? (
        <p
          data-testid="history-empty"
          className="py-6 text-center font-body-sm text-body-sm text-dwarf-parchmentMuted"
        >
          {messages['account.history.empty']}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table
            data-testid="history-table"
            className="w-full min-w-[680px] border-collapse text-left font-mono text-body-sm"
          >
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-lowest/50 font-label-sm text-label-sm uppercase tracking-widest text-outline">
                {COLUMN_KEYS.map((columnKey, index) => (
                  <th key={columnKey} className={`px-3 py-2.5 ${COLUMN_ALIGN[index]}`}>
                    {messages[columnKey]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/60">
              {page.entries.map((entry) => (
                <HistoryRow key={entry.publicId} entry={entry} locale={locale} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant pt-3 font-mono text-body-sm text-outline">
        <span data-testid="history-showing">
          {messages['account.history.footerShowing']} : {formatNumber(firstShown, locale)}–{formatNumber(lastShown, locale)} / {formatNumber(page.totalCount, locale)}
        </span>
        <div className="flex items-center gap-2">
          {hasPrev ? (
            <Link
              href={`/account?page=${page.page - 1}`}
              className="rounded border border-outline-variant bg-surface-container-high px-2.5 py-1 font-label-sm text-label-sm font-bold uppercase text-on-surface-variant transition-colors hover:text-on-surface"
            >
              {messages['account.history.footerPrev']}
            </Link>
          ) : (
            <span className="rounded border border-outline-variant/50 px-2.5 py-1 font-label-sm text-label-sm font-bold uppercase text-outline/50">
              {messages['account.history.footerPrev']}
            </span>
          )}
          <span className="px-1 font-bold text-primary" data-testid="history-page">
            {messages['account.history.footerPage']} {formatNumber(page.page, locale)} /{' '}
            {formatNumber(page.totalPages, locale)}
          </span>
          {hasNext ? (
            <Link
              href={`/account?page=${page.page + 1}`}
              className="rounded border border-outline-variant bg-surface-container-high px-2.5 py-1 font-label-sm text-label-sm font-bold uppercase text-on-surface-variant transition-colors hover:text-on-surface"
            >
              {messages['account.history.footerNext']}
            </Link>
          ) : (
            <span className="rounded border border-outline-variant/50 px-2.5 py-1 font-label-sm text-label-sm font-bold uppercase text-outline/50">
              {messages['account.history.footerNext']}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
