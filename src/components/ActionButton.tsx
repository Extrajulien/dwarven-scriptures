import type { ActionButtonData } from '../data/homepageData';
import type { Messages } from '../i18n/messages';
import Icon from './Icon';

export default function ActionButton({
  action,
  messages,
}: {
  action: ActionButtonData;
  messages: Messages;
}) {
  return (
    <button
      type="button"
      className={`flex items-center gap-space-xs px-space-md py-space-sm rounded font-label-md text-label-md uppercase tracking-wider active:translate-y-0.5 ${action.className}`}
    >
      <Icon name={action.icon} className="text-headline-sm" />
      {messages[action.labelKey]}
    </button>
  );
}
