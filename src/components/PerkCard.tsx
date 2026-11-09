import type { Perk } from '../data/homepageData';
import type { Messages } from '../i18n/messages';
import ProgressBar from './ProgressBar';

export default function PerkCard({
  perk,
  messages,
}: {
  perk: Perk;
  messages: Messages;
}) {
  const cardClass = perk.locked
    ? 'bg-surface-container-low p-space-sm rounded flex flex-col gap-1'
    : `bg-surface-container p-space-sm rounded flex flex-col gap-1 border-l-4 ${perk.borderClass} shadow-sm`;

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between">
        <span
          className={`font-label-md text-label-md font-bold uppercase ${perk.nameClass}`}
        >
          {messages[perk.nameKey]}
        </span>
        <span
          className={`font-label-sm text-label-sm px-1.5 py-0.5 rounded uppercase font-bold ${perk.statusClass}`}
        >
          {messages[perk.statusKey]}
        </span>
      </div>

      <p
        className={`font-body-sm text-body-sm ${
          perk.locked ? 'text-dwarf-parchment-muted' : 'text-on-surface-variant'
        }`}
      >
        {messages[perk.descriptionKey]}
      </p>

      {perk.progress && perk.footer && (
        <>
          <ProgressBar
            percent={perk.progress.percent}
            fillClass={perk.progress.fillClass}
            trackClass="w-full bg-surface-container-lowest h-1.5 mt-1"
          />
          <div className="flex justify-between font-label-sm text-label-sm text-outline mt-0.5">
            <span>{messages[perk.footer.estimateKey]}</span>
            <button type="button" className="text-primary hover:underline uppercase">
              {messages[perk.footer.actionKey]}
            </button>
          </div>
        </>
      )}

      {perk.footnoteKey && (
        <span className="font-label-sm text-label-sm text-outline">
          {messages[perk.footnoteKey]}
        </span>
      )}
    </div>
  );
}
