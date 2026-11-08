// Mock/placeholder content for the account ("Overseer Dossier") screen.
// All user-visible strings live in `src/i18n/messages.ts` (I18N-01): each
// text field is a message key resolved against the active fr/en bag by the
// rendering component. Machine values (icons, classes, chart geometry, mock
// lore dates/numbers) stay here. Values are placeholders until a `races`
// table, the keyboard heatmap statistics and profile-editing endpoints exist.
import type { Messages } from '../i18n/messages';

export interface RaceHistoryRow {
  id: string;
  /** Mock lore date — data, not copy. */
  date: string;
  /** Mock time — data, not copy. */
  time: string;
  wpmKey: keyof Messages;
  wpmClass: string;
  /** Mock percentage — data, not copy. */
  accuracy: string;
  placeKey: keyof Messages;
  placeClass: string;
  languageKey: keyof Messages;
  /** Mock duration — data, not copy. */
  duration: string;
}

export interface WpmChartData {
  titleKey: keyof Messages;
  icon: string;
  subheader: {
    apexKey: keyof Messages;
    lowKey: keyof Messages;
    currentKey: keyof Messages;
  };
  /** `x,y` pairs in the 500x150 viewBox. */
  linePoints: string;
  areaPoints: string;
  nodes: { x: number; y: number; r: number; fill: string; stroke: string }[];
  xTickKeys: readonly (keyof Messages)[];
}

export interface RacesChartData {
  titleKey: keyof Messages;
  icon: string;
  subheader: {
    totalKey: keyof Messages;
    streaksKey: keyof Messages;
    dailyKey: keyof Messages;
  };
  bars: { x: number; y: number; width: number; height: number; opacity: number }[];
  xTickKeys: readonly (keyof Messages)[];
}

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

export const WPM_CHART: WpmChartData = {
  titleKey: 'account.chart.wpm.title',
  icon: 'show_chart',
  subheader: {
    apexKey: 'account.chart.wpm.apex',
    lowKey: 'account.chart.wpm.low',
    currentKey: 'account.chart.wpm.current',
  },
  linePoints: '10,120 60,110 110,125 160,95 210,105 260,80 310,75 360,40 410,25 470,35',
  areaPoints: '10,120 60,110 110,125 160,95 210,105 260,80 310,75 360,40 410,25 470,35 470,145 10,145',
  nodes: [
    { x: 10, y: 120, r: 3.5, fill: '#131313', stroke: '#eec14b' },
    { x: 60, y: 110, r: 3.5, fill: '#131313', stroke: '#eec14b' },
    { x: 110, y: 125, r: 3.5, fill: '#131313', stroke: '#eec14b' },
    { x: 160, y: 95, r: 3.5, fill: '#131313', stroke: '#eec14b' },
    { x: 210, y: 105, r: 3.5, fill: '#131313', stroke: '#eec14b' },
    { x: 260, y: 80, r: 3.5, fill: '#131313', stroke: '#eec14b' },
    { x: 310, y: 75, r: 3.5, fill: '#131313', stroke: '#eec14b' },
    { x: 360, y: 40, r: 3.5, fill: '#131313', stroke: '#eec14b' },
    { x: 410, y: 25, r: 5, fill: '#eec14b', stroke: '#131313' },
    { x: 470, y: 35, r: 4, fill: '#131313', stroke: '#eec14b' },
  ],
  xTickKeys: [
    'account.chart.wpm.tick1',
    'account.chart.wpm.tick2',
    'account.chart.wpm.tick3',
    'account.chart.wpm.tick4',
    'account.chart.wpm.tick5',
    'account.chart.wpm.tick6',
  ],
};

export const RACES_CHART: RacesChartData = {
  titleKey: 'account.chart.races.title',
  icon: 'list_alt',
  subheader: {
    totalKey: 'account.chart.races.total',
    streaksKey: 'account.chart.races.streaks',
    dailyKey: 'account.chart.races.daily',
  },
  bars: [
    { x: 25, y: 70, width: 24, height: 65, opacity: 0.85 },
    { x: 75, y: 55, width: 24, height: 80, opacity: 0.85 },
    { x: 125, y: 90, width: 24, height: 45, opacity: 0.65 },
    { x: 175, y: 40, width: 24, height: 95, opacity: 0.9 },
    { x: 225, y: 60, width: 24, height: 75, opacity: 0.85 },
    { x: 275, y: 30, width: 24, height: 105, opacity: 0.95 },
    { x: 325, y: 45, width: 24, height: 90, opacity: 0.9 },
    { x: 375, y: 20, width: 24, height: 115, opacity: 1.0 },
    { x: 425, y: 35, width: 24, height: 100, opacity: 0.95 },
    { x: 470, y: 50, width: 24, height: 85, opacity: 0.85 },
  ],
  xTickKeys: [
    'account.chart.races.tickDay9',
    'account.chart.races.tickDay7',
    'account.chart.races.tickDay5',
    'account.chart.races.tickDay3',
    'account.chart.races.tickYesterday',
    'account.chart.races.tickToday',
  ],
};

export const RACE_HISTORY = {
  titleKey: 'account.history.title',
  captionKey: 'account.history.caption',
  filterLabelKey: 'account.history.filterLabel',
  columnKeys: [
    'account.history.colDate',
    'account.history.colWpm',
    'account.history.colAccuracy',
    'account.history.colPlace',
    'account.history.colLanguage',
    'account.history.colDuration',
  ],
  filters: [
    { id: 'all', labelKey: 'account.history.filterAll', active: true },
    { id: 'recent', labelKey: 'account.history.filterRecent', active: false },
    { id: 'best', labelKey: 'account.history.filterBest', active: false },
  ],
  rows: [
    {
      id: 'exp-84',
      date: '19 JAN 1054',
      time: '14:02:11',
      wpmKey: 'account.history.exp84.wpm',
      wpmClass: 'font-extrabold text-primary text-[14px]',
      accuracy: '99.2%',
      placeKey: 'account.history.exp84.place',
      placeClass: 'bg-primary/20 text-primary border border-primary/40',
      languageKey: 'account.history.exp84.language',
      duration: '01:14',
    },
    {
      id: 'exp-83',
      date: '19 JAN 1054',
      time: '13:10:45',
      wpmKey: 'account.history.exp83.wpm',
      wpmClass: 'font-extrabold text-primary text-[14px] shadow-gold-glow',
      accuracy: '100.0%',
      placeKey: 'account.history.exp83.place',
      placeClass: 'bg-primary text-on-primary',
      languageKey: 'account.history.exp83.language',
      duration: '00:58',
    },
    {
      id: 'exp-82',
      date: '18 JAN 1054',
      time: '21:44:02',
      wpmKey: 'account.history.exp82.wpm',
      wpmClass: 'font-bold text-on-surface text-[13px]',
      accuracy: '97.8%',
      placeKey: 'account.history.exp82.place',
      placeClass: 'bg-surface-container-highest text-secondary border border-outline-variant',
      languageKey: 'account.history.exp82.language',
      duration: '01:32',
    },
    {
      id: 'exp-81',
      date: '18 JAN 1054',
      time: '18:05:19',
      wpmKey: 'account.history.exp81.wpm',
      wpmClass: 'font-bold text-on-surface text-[13px]',
      accuracy: '98.5%',
      placeKey: 'account.history.exp81.place',
      placeClass: 'bg-surface-container-highest text-secondary border border-outline-variant',
      languageKey: 'account.history.exp81.language',
      duration: '01:45',
    },
    {
      id: 'exp-80',
      date: '17 JAN 1054',
      time: '11:20:00',
      wpmKey: 'account.history.exp80.wpm',
      wpmClass: 'font-bold text-on-surface text-[13px]',
      accuracy: '99.0%',
      placeKey: 'account.history.exp80.place',
      placeClass: 'bg-surface-container-highest text-outline border border-outline-variant',
      languageKey: 'account.history.exp80.language',
      duration: '02:01',
    },
  ] satisfies RaceHistoryRow[],
  footer: {
    showingKey: 'account.history.footerShowing',
    prevKey: 'account.history.footerPrev',
    pageKey: 'account.history.footerPage',
    nextKey: 'account.history.footerNext',
  },
} as const satisfies {
  titleKey: keyof Messages;
  captionKey: keyof Messages;
  filterLabelKey: keyof Messages;
  columnKeys: readonly (keyof Messages)[];
  filters: readonly { id: string; labelKey: keyof Messages; active: boolean }[];
  rows: readonly RaceHistoryRow[];
  footer: {
    showingKey: keyof Messages;
    prevKey: keyof Messages;
    pageKey: keyof Messages;
    nextKey: keyof Messages;
  };
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
