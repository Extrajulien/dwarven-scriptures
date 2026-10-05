import Icon from './Icon';

export default function ActionButton({ action }) {
  return (
    <button
      type="button"
      className={`flex items-center gap-space-xs px-space-md py-space-sm rounded font-label-md text-label-md uppercase tracking-wider active:translate-y-0.5 ${action.className}`}
    >
      <Icon name={action.icon} className="text-[18px]" />
      {action.label}
    </button>
  );
}
