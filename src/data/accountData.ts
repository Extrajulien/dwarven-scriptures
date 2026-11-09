// Static labels and structure for the account ("Overseer Dossier") screen.
// All user-visible strings live in `src/i18n/messages.ts` (I18N-01): each
// text field is a message key resolved against the active fr/en bag by the
// rendering component. Machine values (icons, classes) stay here. Real data
// (profile stats, race history, progression charts) comes from PostgreSQL
// through `src/db/queries/races.ts` — only the keyboard heatmap remains on
// placeholder values until per-key aggregate statistics are persisted.
import type { Messages } from '../i18n/messages';

export const ACCOUNT_BREADCRUMB = {
  leftKey: 'account.breadcrumb.left',
  nodeKey: 'account.breadcrumb.node',
  syncedKey: 'account.breadcrumb.synced',
  rightKeys: ['account.breadcrumb.rightZ', 'account.breadcrumb.rightProtocol'],
} as const satisfies {
  leftKey: keyof Messages;
  nodeKey: keyof Messages;
  syncedKey: keyof Messages;
  rightKeys: readonly (keyof Messages)[];
};

export const ACCOUNT_IDENTITY = {
  memberSincePrefixKey: 'account.identity.memberSincePrefix',
  memberSinceSuffixKey: 'account.identity.memberSinceSuffix',
  citadelKey: 'account.identity.citadel',
  actions: {
    editKey: 'account.identity.edit',
    logoutKey: 'account.identity.logout',
  },
} as const satisfies {
  memberSincePrefixKey: keyof Messages;
  memberSinceSuffixKey: keyof Messages;
  citadelKey: keyof Messages;
  actions: { editKey: keyof Messages; logoutKey: keyof Messages };
};

export const ACCOUNT_STATS = {
  titleKey: 'account.stats.title',
  captionKey: 'account.stats.caption',
  tiles: [
    {
      id: 'racesCompleted',
      labelKey: 'account.stats.tile.racesCompleted',
      icon: 'local_fire_department',
      iconClass: 'text-secondary',
      valueClass: 'text-on-surface',
    },
    {
      id: 'bestWpm',
      labelKey: 'account.stats.tile.bestWpm',
      icon: 'speed',
      iconClass: 'text-primary',
      valueClass: 'text-primary',
    },
    {
      id: 'avgWpm',
      labelKey: 'account.stats.tile.avgWpm',
      icon: 'show_chart',
      iconClass: 'text-tertiary',
      valueClass: 'text-on-surface',
    },
    {
      id: 'totalWords',
      labelKey: 'account.stats.tile.totalWords',
      icon: 'keyboard',
      iconClass: 'text-secondary',
      valueClass: 'text-on-surface',
    },
    {
      id: 'wins',
      labelKey: 'account.stats.tile.wins',
      icon: 'emoji_events',
      iconClass: 'text-dwarf-gold',
      valueClass: 'text-on-surface',
    },
    {
      id: 'avgAccuracy',
      labelKey: 'account.stats.tile.avgAccuracy',
      icon: 'my_location',
      iconClass: 'text-primary',
      valueClass: 'text-on-surface',
    },
  ],
  coinsLabelKey: 'account.stats.coinsLabel',
  gemsLabelKey: 'account.stats.gemsLabel',
} as const satisfies {
  titleKey: keyof Messages;
  captionKey: keyof Messages;
  tiles: readonly {
    id: string;
    labelKey: keyof Messages;
    icon: string;
    iconClass: string;
    valueClass: string;
  }[];
  coinsLabelKey: keyof Messages;
  gemsLabelKey: keyof Messages;
};

export const HEATMAP = {
  titleKey: 'account.heatmap.title',
  captionKey: 'account.heatmap.caption',
  legendLabelKey: 'account.heatmap.legendLabel',
  legend: [
    { id: 'accurate', swatchClass: 'bg-tertiary/20 border border-tertiary', labelClass: 'text-tertiary', labelKey: 'account.heatmap.legendAccurate' },
    { id: 'medium', swatchClass: 'bg-primary/20 border border-primary', labelClass: 'text-primary', labelKey: 'account.heatmap.legendMedium' },
    { id: 'weak', swatchClass: 'bg-error/20 border border-error', labelClass: 'text-error', labelKey: 'account.heatmap.legendWeak' },
  ],
  analysis: {
    weakestLabelKey: 'account.heatmap.weakestLabel',
    /** Mock per-key percentages — data, not copy. */
    weakestValue: "P (84.1%), ' (86.4%), - (87.0%), / (88.2%)",
    drillKey: 'account.heatmap.drill',
  },
} as const satisfies {
  titleKey: keyof Messages;
  captionKey: keyof Messages;
  legendLabelKey: keyof Messages;
  legend: readonly {
    id: string;
    swatchClass: string;
    labelClass: string;
    labelKey: keyof Messages;
  }[];
  analysis: {
    weakestLabelKey: keyof Messages;
    weakestValue: string;
    drillKey: keyof Messages;
  };
};
