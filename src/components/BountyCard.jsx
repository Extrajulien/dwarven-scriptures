function RailBody({ body }) {
  return (
    <div className="bg-surface-container-lowest p-space-sm rounded font-label-sm text-label-sm flex flex-col gap-1">
      <div className="flex justify-between text-outline text-[11px]">
        <span>{body.start}</span>
        <span className="text-tertiary">{body.lead}</span>
        <span>{body.end}</span>
      </div>
      <div className="font-body-sm text-body-sm text-primary tracking-widest overflow-hidden whitespace-nowrap">
        {body.ascii} <span className="text-secondary">{body.leader}</span>
      </div>
    </div>
  );
}

function StatusBody({ body }) {
  return (
    <div className="bg-surface-container-lowest p-space-sm rounded font-label-sm text-label-sm flex items-center justify-between">
      <span className="text-on-surface-variant font-body-sm text-body-sm">
        {body.text}
      </span>
      <span className="text-secondary font-bold">{body.status}</span>
    </div>
  );
}

function DecryptionBody({ body }) {
  return (
    <div className="bg-surface-container-lowest p-space-sm rounded font-label-sm text-label-sm flex flex-col gap-1">
      <div className="flex justify-between text-outline text-[11px]">
        <span>{body.label}</span>
        <span className="text-tertiary font-bold">{body.pctLabel}</span>
      </div>
      <div className="font-body-sm text-body-sm text-tertiary tracking-widest overflow-hidden whitespace-nowrap">
        {body.ascii}
      </div>
    </div>
  );
}

const BODY_RENDERERS = {
  rail: RailBody,
  status: StatusBody,
  progress: DecryptionBody,
};

export default function BountyCard({ bounty }) {
  const Body = BODY_RENDERERS[bounty.body.kind];

  return (
    <div className="bg-surface-container p-space-md rounded flex flex-col gap-space-sm relative overflow-hidden shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
        <div className="flex items-center gap-space-sm">
          <span className={`w-2.5 h-2.5 rounded-full ${bounty.dotClass}`} />
          <div>
            <h2
              className={`font-headline-sm text-headline-sm uppercase ${bounty.titleClass}`}
            >
              {bounty.title}
            </h2>
            <span
              className={`font-label-sm text-label-sm uppercase ${bounty.metaClass}`}
            >
              {bounty.meta}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-space-xs">
          <span
            className={`font-label-sm text-label-sm px-space-xs py-0.5 rounded font-bold uppercase ${bounty.rewardClass}`}
          >
            {bounty.reward}
          </span>
          <button
            type="button"
            className={`bg-surface-container-high px-space-sm py-1 rounded font-label-sm text-label-sm uppercase transition-colors ${bounty.actionClass}`}
          >
            {bounty.action}
          </button>
        </div>
      </div>

      <Body body={bounty.body} />
    </div>
  );
}
