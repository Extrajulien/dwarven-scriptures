import type {
  Bounty,
  ProgressBountyBody,
  RailBountyBody,
  StatusBountyBody,
} from '../data/homepageData';
import type { Messages } from '../i18n/messages';

function RailBody({ body, messages }: { body: RailBountyBody; messages: Messages }) {
  return (
    <div className="bg-surface-container-lowest p-space-sm rounded font-label-sm text-label-sm flex flex-col gap-1">
      <div className="flex justify-between text-outline text-label-sm">
        <span>{messages[body.startKey]}</span>
        <span className="text-tertiary">{messages[body.leadKey]}</span>
        <span>{messages[body.endKey]}</span>
      </div>
      <div className="font-body-sm text-body-sm text-primary tracking-widest overflow-hidden whitespace-nowrap">
        {messages[body.asciiKey]} <span className="text-secondary">{body.leader}</span>
      </div>
    </div>
  );
}

function StatusBody({ body, messages }: { body: StatusBountyBody; messages: Messages }) {
  return (
    <div className="bg-surface-container-lowest p-space-sm rounded font-label-sm text-label-sm flex items-center justify-between">
      <span className="text-on-surface-variant font-body-sm text-body-sm">
        {messages[body.textKey]}
      </span>
      <span className="text-secondary font-bold">{messages[body.statusKey]}</span>
    </div>
  );
}

function DecryptionBody({
  body,
  messages,
}: {
  body: ProgressBountyBody;
  messages: Messages;
}) {
  return (
    <div className="bg-surface-container-lowest p-space-sm rounded font-label-sm text-label-sm flex flex-col gap-1">
      <div className="flex justify-between text-outline text-label-sm">
        <span>{messages[body.labelKey]}</span>
        <span className="text-tertiary font-bold">{messages[body.pctLabelKey]}</span>
      </div>
      <div className="font-body-sm text-body-sm text-tertiary tracking-widest overflow-hidden whitespace-nowrap">
        {messages[body.asciiKey]}
      </div>
    </div>
  );
}

export default function BountyCard({
  bounty,
  messages,
}: {
  bounty: Bounty;
  messages: Messages;
}) {
  const { body } = bounty;

  return (
    <div className="bg-surface-container p-space-md rounded flex flex-col gap-space-sm relative overflow-hidden shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
        <div className="flex items-center gap-space-sm">
          <span className={`w-2.5 h-2.5 rounded-full ${bounty.dotClass}`} />
          <div>
            <h2
              className={`font-headline-sm text-headline-sm uppercase ${bounty.titleClass}`}
            >
              {messages[bounty.titleKey]}
            </h2>
            <span
              className={`font-label-sm text-label-sm uppercase ${bounty.metaClass}`}
            >
              {messages[bounty.metaKey]}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-space-xs">
          <span
            className={`font-label-sm text-label-sm px-space-xs py-0.5 rounded font-bold uppercase ${bounty.rewardClass}`}
          >
            {messages[bounty.rewardKey]}
          </span>
          <button
            type="button"
            className={`bg-surface-container-high px-space-sm py-1 rounded font-label-sm text-label-sm uppercase transition-colors ${bounty.actionClass}`}
          >
            {messages[bounty.actionKey]}
          </button>
        </div>
      </div>

      {body.kind === 'rail' && <RailBody body={body} messages={messages} />}
      {body.kind === 'status' && <StatusBody body={body} messages={messages} />}
      {body.kind === 'progress' && <DecryptionBody body={body} messages={messages} />}
    </div>
  );
}
