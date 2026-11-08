import { RACE_HISTORY } from '../../data/accountData';
import type { Messages } from '../../i18n/messages';
import Icon from '../Icon';

// TODO: rows are placeholder entries from `accountData`. Wire this table to a
// real `races` table once race history is persisted (STAT-3 history).

const COLUMN_ALIGN = [
  'text-left',
  'text-right',
  'text-right',
  'text-center',
  'text-left',
  'text-right',
];

export default function RaceHistory({ messages }: { messages: Messages }) {
  const { titleKey, captionKey, filterLabelKey, columnKeys, filters, rows, footer } =
    RACE_HISTORY;

  return (
    <section className="stone-card space-y-4 rounded-lg border border-outline-variant bg-surface-container-low p-4 md:p-6">
      <div className="flex flex-col justify-between gap-3 border-b border-outline-variant pb-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Icon name="list_alt" className="text-[20px] text-primary" />
          <h2 className="font-display text-headline-sm font-bold uppercase tracking-wider text-on-surface">
            {messages[titleKey]}
          </h2>
          <span className="font-mono font-label-sm text-label-sm text-outline">
            {messages[captionKey]}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="mr-1 hidden font-label-sm text-label-sm uppercase tracking-wider text-outline md:inline">
            {messages[filterLabelKey]}:
          </span>
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={
                filter.active
                  ? 'rounded bg-primary px-2.5 py-1 font-label-sm text-label-sm font-bold uppercase tracking-wider text-on-primary'
                  : 'rounded border border-outline-variant bg-surface-container-high px-2.5 py-1 font-label-sm text-label-sm font-medium uppercase tracking-wider text-on-surface-variant transition-colors hover:text-on-surface'
              }
            >
              {messages[filter.labelKey]}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left font-mono text-body-sm">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-lowest/50 font-label-sm text-label-sm uppercase tracking-widest text-outline">
              {columnKeys.map((columnKey, index) => (
                <th key={columnKey} className={`px-3 py-2.5 ${COLUMN_ALIGN[index]}`}>
                  {messages[columnKey]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/60">
            {rows.map((row, index) => (
              <tr
                key={row.id}
                className={`transition-colors hover:bg-surface-container-high/40 ${
                  index === 1 ? 'bg-surface-container-highest/20' : ''
                }`}
              >
                <td className="px-3 py-3 text-on-surface-variant">
                  <span className="font-bold text-on-surface">{row.date}</span>
                  <span className="block font-label-sm text-label-sm text-outline">{row.time}</span>
                </td>
                <td className={`px-3 py-3 text-right ${row.wpmClass}`}>{messages[row.wpmKey]}</td>
                <td className="px-3 py-3 text-right font-bold text-tertiary">{row.accuracy}</td>
                <td className="px-3 py-3 text-center">
                  <span
                    className={`inline-block rounded px-2 py-0.5 font-label-sm text-label-sm font-bold ${row.placeClass}`}
                  >
                    {messages[row.placeKey]}
                  </span>
                </td>
                <td className="px-3 py-3 uppercase text-on-surface-variant">
                  {messages[row.languageKey]}
                </td>
                <td className="px-3 py-3 text-right text-outline">{row.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-outline-variant pt-3 font-mono text-body-sm text-outline">
        <span>{messages[footer.showingKey]}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-outline-variant bg-surface-container-high px-2.5 py-1 font-label-sm text-label-sm font-bold uppercase text-on-surface-variant transition-colors hover:text-on-surface"
          >
            {messages[footer.prevKey]}
          </button>
          <span className="px-1 font-bold text-primary">{messages[footer.pageKey]}</span>
          <button
            type="button"
            className="rounded border border-outline-variant bg-surface-container-high px-2.5 py-1 font-label-sm text-label-sm font-bold uppercase text-on-surface-variant transition-colors hover:text-on-surface"
          >
            {messages[footer.nextKey]}
          </button>
        </div>
      </div>
    </section>
  );
}
