import Icon from './Icon';
import ProgressBar from './ProgressBar';

export default function StatTile({ stat }) {
  const {
    label,
    value,
    caption,
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
          {label}
        </span>
        <Icon name={icon} className={`text-[16px] ${iconClass}`} />
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
          {caption}
        </span>
      )}
    </div>
  );
}
