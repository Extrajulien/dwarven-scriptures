import type { AccountProfile } from '../../app/account/profile';
import { ACCOUNT_STATS } from '../../data/accountData';
import { formatGroupedDigits, formatNumber } from '../../i18n/format';
import type { Locale, Messages } from '../../i18n/messages';
import Icon from '../Icon';
import StatTile from '../StatTile';

type StatTileId = 'racesCompleted' | 'bestWpm' | 'avgWpm' | 'totalWords';

const CAPTION_KEYS: Record<StatTileId, keyof Messages> = {
  racesCompleted: 'account.stats.expeditionsCaption',
  bestWpm: 'account.stats.wpmUnit',
  avgWpm: 'account.stats.wpmUnit',
  totalWords: 'account.stats.runesEngravedCaption',
};

export default function AccountStats({
  profile,
  locale,
  messages,
}: {
  profile: AccountProfile;
  locale: Locale;
  messages: Messages;
}) {
  // I18N-03: every number is formatted with the active locale.
  const values: Record<StatTileId, { value: string }> = {
    racesCompleted: { value: formatNumber(profile.racesCompleted, locale) },
    bestWpm: {
      value: formatNumber(profile.bestWpm, locale, { maximumFractionDigits: 0 }),
    },
    avgWpm: {
      value: formatNumber(profile.avgWpm, locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    },
    totalWords: { value: formatGroupedDigits(profile.totalWords, locale) },
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between font-label-md text-label-md font-bold uppercase tracking-wider text-outline">
        <span>{messages[ACCOUNT_STATS.titleKey]}</span>
        <span className="font-mono font-label-sm text-label-sm text-outline-variant">
          {messages[ACCOUNT_STATS.captionKey]}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ACCOUNT_STATS.tiles.map((tile) => (
          <StatTile
            key={tile.id}
            messages={messages}
            stat={{
              ...tile,
              ...values[tile.id as StatTileId],
              captionKey: CAPTION_KEYS[tile.id as StatTileId],
            }}
          />
        ))}
      </div>

      {/* Currency strip: coins & gems */}
      <div className="stone-card flex flex-wrap items-center justify-between gap-4 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3">
        <div className="flex items-center gap-1.5 rounded border border-outline-variant bg-surface-container-high px-2.5 py-1">
          <span className="text-[14px] text-primary">🪙</span>
          <span className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-outline">
            {messages[ACCOUNT_STATS.coinsLabelKey]}:
          </span>
          <span className="font-mono text-body-sm font-bold text-primary">
            {formatGroupedDigits(profile.coins, locale)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded border border-outline-variant bg-surface-container-high px-2.5 py-1">
          <Icon name="diamond" className="text-body-md text-tertiary" />
          <span className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-outline">
            {messages[ACCOUNT_STATS.gemsLabelKey]}:
          </span>
          <span className="font-mono text-body-sm font-bold text-tertiary">
            {formatNumber(profile.gems, locale)}
          </span>
        </div>
      </div>
    </section>
  );
}
