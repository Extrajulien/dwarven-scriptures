import { MINERS, ROSTER_COLUMNS, ROSTER_FILTERS } from '../data/homepageData';
import ProgressBar from './ProgressBar';
import SectionHeader from './SectionHeader';

export default function MinerRoster() {
  return (
    <section className="bg-surface-container-lowest p-space-lg rounded shadow-xl flex flex-col gap-space-md">
      <SectionHeader
        title="[ CHAMBER // MINER_RANKS_&_TYPIST_ROSTER ]"
        tag="᚛ᛗᛁᚾᛖᚱᛋ᚜"
        right={
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
            REGISTRY: 38 OF 50 STONE SLOTS FILLED
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-space-xs bg-surface-container-low p-1 rounded">
        {ROSTER_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={
              filter.active
                ? 'bg-surface-container-high text-primary font-label-sm text-label-sm uppercase px-space-sm py-1 rounded shadow-inner'
                : 'hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm uppercase px-space-sm py-1 rounded transition-colors'
            }
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto w-full">
        <table className="w-full text-left font-body-sm text-body-sm">
          <thead>
            <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
              {ROSTER_COLUMNS.map((column) => (
                <th key={column.label} className={`py-2.5 px-space-sm ${column.align}`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container-low">
            {MINERS.map((miner) => (
              <tr
                key={miner.id}
                className="bg-surface-container-lowest hover:bg-surface-container transition-colors"
              >
                <td className="py-3 px-space-sm">
                  <div className="flex items-center gap-space-xs">
                    <div
                      className={`w-7 h-7 rounded flex items-center justify-center font-bold text-label-md shadow-sm ${miner.avatarClass}`}
                    >
                      {miner.initial}
                    </div>
                    <div className="flex flex-col">
                      <span
                        className={`font-label-md text-label-md font-bold ${miner.nameClass}`}
                      >
                        {miner.name}
                      </span>
                      <span
                        className={`font-label-sm text-label-sm uppercase ${miner.rankClass}`}
                      >
                        {miner.rank}
                      </span>
                    </div>
                  </div>
                </td>
                <td className={`py-3 px-space-sm ${miner.specializationClass}`}>
                  {miner.specialization}
                </td>
                <td className="py-3 px-space-sm text-center">
                  <span
                    className={`font-headline-sm text-headline-sm font-bold ${miner.wpmClass}`}
                  >
                    {miner.wpm}
                  </span>
                  <span className="font-label-sm text-label-sm text-outline block">
                    WPM
                  </span>
                </td>
                <td className="py-3 px-space-sm text-center">
                  <span
                    className={`font-bold font-body-md text-body-md ${miner.accuracyClass}`}
                  >
                    {miner.accuracy}
                  </span>
                </td>
                <td className="py-3 px-space-sm">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm text-on-surface">
                      {miner.stones}
                    </span>
                    <ProgressBar
                      percent={miner.progress.percent}
                      fillClass={miner.progress.fillClass}
                      trackClass="w-24 bg-surface-container-high h-1 mt-0.5"
                    />
                  </div>
                </td>
                <td className="py-3 px-space-sm">
                  <span
                    className={`inline-flex items-center gap-1 font-label-sm text-label-sm px-2 py-0.5 rounded ${miner.status.pillClass}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${miner.status.dotClass}`}
                    />
                    {miner.status.label}
                  </span>
                </td>
                <td className="py-3 px-space-sm text-right">
                  <button
                    type="button"
                    className={`bg-surface-container hover:bg-surface-container-high px-space-xs py-1 rounded font-label-sm text-label-sm uppercase shadow-sm ${miner.action.className}`}
                  >
                    {miner.action.label}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-outline font-label-sm text-label-sm pt-space-xs">
        <span>SHOWING 4 OF 38 RECOGNIZED GUILD BROTHERS</span>
        <button type="button" className="text-primary hover:underline uppercase">
          [EXPAND GUILD ARCHIVE LEDGER →]
        </button>
      </div>
    </section>
  );
}
