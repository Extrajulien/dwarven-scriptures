import { RACES_CHART, WPM_CHART } from '../../data/accountData';
import Icon from '../Icon';

// TODO: both charts render placeholder series from `accountData`. Wire them to a
// real `races` table once race history is persisted (STAT-3 progression charts).

export default function ProgressionCharts() {
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <WpmChart />
      <RacesChart />
    </section>
  );
}

function WpmChart() {
  const { title, icon, subheader, linePoints, areaPoints, nodes, xTicks } = WPM_CHART;

  return (
    <div className="stone-card space-y-3 rounded-lg border border-outline-variant bg-surface-container-low p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name={icon} className="text-headline-sm text-primary" />
          <span className="font-display text-label-md font-bold uppercase tracking-wider text-on-surface">
            {title}
          </span>
        </div>
        <div className="inline-flex rounded border border-outline-variant bg-surface-container-highest p-0.5 font-label-sm text-label-sm uppercase tracking-wider">
          <button type="button" className="rounded bg-primary px-2 py-0.5 font-bold text-on-primary">
            [LAST 10 RACES]
          </button>
          <button type="button" className="rounded px-2 py-0.5 text-on-surface-variant transition-colors hover:text-on-surface">
            [ALL TIME]
          </button>
        </div>
      </div>

      <div className="flex items-baseline justify-between border-b border-outline-variant pb-1 font-mono font-label-sm text-label-sm uppercase tracking-wider text-outline">
        <span>{subheader.apex}</span>
        <span>{subheader.low}</span>
        <span className="font-bold text-primary">{subheader.current}</span>
      </div>

      <div className="relative h-44 w-full pt-2">
        <svg className="h-full w-full overflow-visible" viewBox="0 0 500 150" preserveAspectRatio="none">
          <defs>
            <linearGradient id="goldAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#eec14b" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#eec14b" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <line x1="0" y1="30" x2="500" y2="30" stroke="#4e4635" strokeDasharray="3 3" strokeWidth="0.8" />
          <line x1="0" y1="75" x2="500" y2="75" stroke="#4e4635" strokeDasharray="3 3" strokeWidth="0.8" />
          <line x1="0" y1="120" x2="500" y2="120" stroke="#4e4635" strokeDasharray="3 3" strokeWidth="0.8" />
          <polygon points={areaPoints} fill="url(#goldAreaGrad)" />
          <polyline
            points={linePoints}
            fill="none"
            stroke="#eec14b"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {nodes.map((node, index) => (
            <circle key={index} cx={node.x} cy={node.y} r={node.r} fill={node.fill} stroke={node.stroke} strokeWidth="2" />
          ))}
        </svg>
      </div>

      <div className="flex items-center justify-between font-mono font-label-sm text-label-sm text-outline-variant">
        {xTicks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </div>
  );
}

function RacesChart() {
  const { title, icon, subheader, bars, xTicks } = RACES_CHART;

  return (
    <div className="stone-card space-y-3 rounded-lg border border-outline-variant bg-surface-container-low p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name={icon} className="text-headline-sm text-tertiary" />
          <span className="font-display text-label-md font-bold uppercase tracking-wider text-on-surface">
            {title}
          </span>
        </div>
        <div className="inline-flex rounded border border-outline-variant bg-surface-container-highest p-0.5 font-label-sm text-label-sm uppercase tracking-wider">
          <button type="button" className="rounded bg-tertiary px-2 py-0.5 font-bold text-surface">
            [LAST 10 RACES]
          </button>
          <button type="button" className="rounded px-2 py-0.5 text-on-surface-variant transition-colors hover:text-on-surface">
            [ALL TIME]
          </button>
        </div>
      </div>

      <div className="flex items-baseline justify-between border-b border-outline-variant pb-1 font-mono font-label-sm text-label-sm uppercase tracking-wider text-outline">
        <span>{subheader.total}</span>
        <span>{subheader.streaks}</span>
        <span className="font-bold text-tertiary">{subheader.daily}</span>
      </div>

      <div className="relative h-44 w-full pt-2">
        <svg className="h-full w-full overflow-visible" viewBox="0 0 500 150" preserveAspectRatio="none">
          <line x1="0" y1="30" x2="500" y2="30" stroke="#4e4635" strokeDasharray="3 3" strokeWidth="0.8" />
          <line x1="0" y1="75" x2="500" y2="75" stroke="#4e4635" strokeDasharray="3 3" strokeWidth="0.8" />
          <line x1="0" y1="120" x2="500" y2="120" stroke="#4e4635" strokeDasharray="3 3" strokeWidth="0.8" />
          {bars.map((bar, index) => (
            <rect
              key={index}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              fill="#a4d393"
              opacity={bar.opacity}
              rx="2"
            />
          ))}
        </svg>
      </div>

      <div className="flex items-center justify-between font-mono font-label-sm text-label-sm text-outline-variant">
        {xTicks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </div>
  );
}
