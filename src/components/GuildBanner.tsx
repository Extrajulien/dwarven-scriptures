import { ACTION_BUTTONS, BREADCRUMB, VAULT_STATS } from '../data/homepageData';
import ActionButton from './ActionButton';
import GuildCrest from './GuildCrest';
import StatTile from './StatTile';

export default function GuildBanner() {
  return (
    <section className="flex flex-col gap-space-md">
      <div className="flex items-center justify-between font-label-sm text-label-sm uppercase text-outline">
        <span className="tracking-widest">{BREADCRUMB.left}</span>
        <span className="text-tertiary">{BREADCRUMB.right}</span>
      </div>

      <div className="bg-surface-container-lowest p-space-lg rounded flex flex-col lg:flex-row gap-space-lg items-stretch shadow-xl relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-96 h-96 bg-secondary-container/20 rounded-full blur-3xl pointer-events-none" />
        <GuildCrest />

        <div className="flex-1 flex flex-col justify-between gap-space-md">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-space-sm">
            {VAULT_STATS.map((stat) => (
              <StatTile key={stat.id} stat={stat} />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-space-sm pt-space-xs">
            {ACTION_BUTTONS.map((action) => (
              <ActionButton key={action.id} action={action} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
