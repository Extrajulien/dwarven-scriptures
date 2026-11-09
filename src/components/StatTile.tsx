import type { ProgressData } from '../data/homepageData';
import type { Messages } from '../i18n/messages';
import Icon from './Icon';
import ProgressBar from './ProgressBar';

/** Structural tile shape; every consumer passes message keys (I18N-01). */
export interface StatTileData {
  labelKey: keyof Messages;
  value: string;
  captionKey?: keyof Messages;
  icon: string;
  iconClass: string;
  valueClass: string;
  captionClass?: string;
  progress?: ProgressData;
}

export default function StatTile({
  stat,
  messages,
}: {
  stat: StatTileData;
  messages: Messages;
}) {
  const {
    labelKey,
    value,
    captionKey,
    icon,
    iconClass,
    valueClass,
    captionClass = 'text-on-surface-variant',
    progress,
  } = stat;

  return (
    <div className="bg-surface-container p-space-sm rounded flex flex-col gap-0.5 shadow-sm">
      <div className="flex items-center justify-between text-outline">
        <span className="font-label-sm text-label-sm uppercase tracking-wider">
          {messages[labelKey]}
        </span>
        <Icon name={icon} className={`text-body-md ${iconClass}`} />
      </div>
      <div className={`font-headline-md text-headline-md font-bold ${valueClass}`}>
        {value}
      </div>
      {progress ? (
        <ProgressBar
          percent={progress.percent}
          fillClass={progress.fillClass}
          trackClass="w-full bg-surface-container-lowest h-1.5 mt-1"
        />
      ) : (
        <span className={`font-label-sm text-label-sm ${captionClass}`}>
          {captionKey ? messages[captionKey] : null}
        </span>
      )}
    </div>
  );
}
