import type { AccountProfile } from '../../app/account/profile';
import { ACCOUNT_STATS } from '../../data/accountData';
import Icon from '../Icon';
import StatTile from '../StatTile';

export default function AccountStats({ profile }: { profile: AccountProfile }) {
  const values: Record<string, { value: string; caption: string }> = {
    racesCompleted: { value: String(profile.racesCompleted), caption: '[EXPEDITIONS]' },
    bestWpm: { value: profile.bestWpm, caption: 'WPM' },
    avgWpm: { value: profile.avgWpm, caption: 'WPM' },
    totalWords: { value: profile.totalWords, caption: '[RUNES ENGRAVED]' },
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between font-label-md text-label-md font-bold uppercase tracking-wider text-outline">
        <span>{ACCOUNT_STATS.title}</span>
        <span className="font-mono font-label-sm text-label-sm text-outline-variant">
          {ACCOUNT_STATS.caption}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ACCOUNT_STATS.tiles.map((tile) => (
          <StatTile key={tile.id} stat={{ ...tile, ...values[tile.id] }} />
        ))}
      </div>

      {/* Currency strip: coins & gems */}
      <div className="stone-card flex flex-wrap items-center justify-between gap-4 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3">
        <div className="flex items-center gap-1.5 rounded border border-outline-variant bg-surface-container-high px-2.5 py-1">
          <span className="text-[14px] text-primary">🪙</span>
          <span className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-outline">
            {ACCOUNT_STATS.coinsLabel}:
          </span>
          <span className="font-mono text-body-sm font-bold text-primary">{profile.coins}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded border border-outline-variant bg-surface-container-high px-2.5 py-1">
          <Icon name="diamond" className="text-body-md text-tertiary" />
          <span className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-outline">
            {ACCOUNT_STATS.gemsLabel}:
          </span>
          <span className="font-mono text-body-sm font-bold text-tertiary">{profile.gems}</span>
        </div>
      </div>
    </section>
  );
}
