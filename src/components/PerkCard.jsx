import ProgressBar from './ProgressBar';

export default function PerkCard({ perk }) {
  const cardClass = perk.locked
    ? 'bg-surface-container-low p-space-sm rounded flex flex-col gap-1 opacity-60'
    : `bg-surface-container p-space-sm rounded flex flex-col gap-1 border-l-4 ${perk.borderClass} shadow-sm`;

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between">
        <span
          className={`font-label-md text-label-md font-bold uppercase ${perk.nameClass}`}
        >
          {perk.name}
        </span>
        <span
          className={`font-label-sm text-label-sm px-1.5 py-0.5 rounded uppercase font-bold ${perk.statusClass}`}
        >
          {perk.status}
        </span>
      </div>

      <p
        className={`font-body-sm text-body-sm ${
          perk.locked ? 'text-outline' : 'text-on-surface-variant'
        }`}
      >
        {perk.description}
      </p>

      {perk.progress && (
        <>
          <ProgressBar
            percent={perk.progress.percent}
            fillClass={perk.progress.fillClass}
            trackClass="w-full bg-surface-container-lowest h-1.5 mt-1"
          />
          <div className="flex justify-between font-label-sm text-label-sm text-outline mt-0.5">
            <span>{perk.footer.estimate}</span>
            <button type="button" className="text-primary hover:underline uppercase">
              {perk.footer.action}
            </button>
          </div>
        </>
      )}

      {perk.footnote && (
        <span className="font-label-sm text-label-sm text-outline">
          {perk.footnote}
        </span>
      )}
    </div>
  );
}
