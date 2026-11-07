// Mock/placeholder content for the account ("Overseer Dossier") screen.
// Values are placeholders until a `races` table, the keyboard heatmap
// statistics and profile-editing endpoints exist. Class strings are Tailwind
// utilities resolved from tailwind.config.js (same convention as
// homepageData.js / loginData.ts).

export interface RaceHistoryRow {
  id: string;
  date: string;
  time: string;
  wpm: string;
  wpmClass: string;
  accuracy: string;
  place: string;
  placeClass: string;
  language: string;
  duration: string;
}

export interface WpmChartData {
  title: string;
  icon: string;
  subheader: { apex: string; low: string; current: string };
  /** `x,y` pairs in the 500x150 viewBox. */
  linePoints: string;
  areaPoints: string;
  nodes: { x: number; y: number; r: number; fill: string; stroke: string }[];
  xTicks: string[];
}

export interface RacesChartData {
  title: string;
  icon: string;
  subheader: { total: string; streaks: string; daily: string };
  bars: { x: number; y: number; width: number; height: number; opacity: number }[];
  xTicks: string[];
}

export const ACCOUNT_BREADCRUMB = {
  left: 'ᛞ [DOSSIER_TERMINAL]',
  node: '[NODE: BASALT_CRAG_01]',
  synced: '[SYNCED]',
  right: ['[Z-LEVEL: -480]', '[PROTOCOL: DWARVEN_SCRIPT_V4]'],
};

export const ACCOUNT_IDENTITY = {
  memberSincePrefix: '[MEMBER SINCE:',
  memberSinceSuffix: ']',
  citadel: '[CITADEL OF GRANITE]',
  actions: {
    edit: '[EDIT PROFILE]',
    logout: '[LOG OUT]',
  },
};

export const ACCOUNT_STATS = {
  title: '[LIFETIME STATS DASHBOARD]',
  caption: '[AGGREGATED ACROSS ALL DELVES]',
  tiles: [
    {
      id: 'racesCompleted',
      label: '[RACES COMPLETED]',
      icon: 'local_fire_department',
      iconClass: 'text-secondary',
      valueClass: 'text-on-surface',
    },
    {
      id: 'bestWpm',
      label: '[BEST WPM]',
      icon: 'speed',
      iconClass: 'text-primary',
      valueClass: 'text-primary',
    },
    {
      id: 'avgWpm',
      label: '[AVERAGE WPM]',
      icon: 'show_chart',
      iconClass: 'text-tertiary',
      valueClass: 'text-on-surface',
    },
    {
      id: 'totalWords',
      label: '[TOTAL WORDS TYPED]',
      icon: 'keyboard',
      iconClass: 'text-secondary',
      valueClass: 'text-on-surface',
    },
  ],
  coinsLabel: '[COINS]',
  gemsLabel: '[GEMS]',
};

export const WPM_CHART: WpmChartData = {
  title: '[WPM OVER TIME]',
  icon: 'show_chart',
  subheader: { apex: '[APEX: 112 WPM]', low: '[LOW: 76 WPM]', current: '[CURRENT: 108 WPM]' },
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
  xTicks: ['[EXP-75]', '[EXP-77]', '[EXP-79]', '[EXP-81]', '[EXP-83 (APEX)]', '[EXP-84]'],
};

export const RACES_CHART: RacesChartData = {
  title: '[RACES OVER TIME]',
  icon: 'list_alt',
  subheader: { total: '[TOTAL LOGGED: 412]', streaks: '[FAULTLESS STREAKS: 22]', daily: '[DAILY VOLUME: 28]' },
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
  xTicks: ['[DAY -9]', '[DAY -7]', '[DAY -5]', '[DAY -3]', '[YESTERDAY]', '[TODAY]'],
};

export const RACE_HISTORY = {
  title: '[RACE HISTORY]',
  caption: '[LOGGED EXPEDITIONS]',
  filterLabel: '[FILTER]',
  columns: ['[DATE]', '[WPM]', '[ACCURACY]', '[PLACE]', '[LANGUAGE]', '[DURATION]'],
  filters: [
    { id: 'all', label: '[ALL]', active: true },
    { id: 'recent', label: '[RECENT]', active: false },
    { id: 'best', label: '[BEST]', active: false },
  ],
  rows: [
    {
      id: 'exp-84',
      date: '19 JAN 1054',
      time: '14:02:11',
      wpm: '108 WPM',
      wpmClass: 'font-extrabold text-primary text-[14px]',
      accuracy: '99.2%',
      place: '[1ST 🥇]',
      placeClass: 'bg-primary/20 text-primary border border-primary/40',
      language: '[ENG / RUNIC]',
      duration: '01:14',
    },
    {
      id: 'exp-83',
      date: '19 JAN 1054',
      time: '13:10:45',
      wpm: '112 WPM 🔥',
      wpmClass: 'font-extrabold text-primary text-[14px] shadow-gold-glow',
      accuracy: '100.0%',
      place: '[1ST 👑]',
      placeClass: 'bg-primary text-on-primary',
      language: '[LATIN LITURGY]',
      duration: '00:58',
    },
    {
      id: 'exp-82',
      date: '18 JAN 1054',
      time: '21:44:02',
      wpm: '94 WPM',
      wpmClass: 'font-bold text-on-surface text-[13px]',
      accuracy: '97.8%',
      place: '[2ND 🥈]',
      placeClass: 'bg-surface-container-highest text-secondary border border-outline-variant',
      language: '[ENG / CODE]',
      duration: '01:32',
    },
    {
      id: 'exp-81',
      date: '18 JAN 1054',
      time: '18:05:19',
      wpm: '88 WPM',
      wpmClass: 'font-bold text-on-surface text-[13px]',
      accuracy: '98.5%',
      place: '[2ND 🥈]',
      placeClass: 'bg-surface-container-highest text-secondary border border-outline-variant',
      language: '[FRENCH / TALE]',
      duration: '01:45',
    },
    {
      id: 'exp-80',
      date: '17 JAN 1054',
      time: '11:20:00',
      wpm: '82 WPM',
      wpmClass: 'font-bold text-on-surface text-[13px]',
      accuracy: '99.0%',
      place: '[3RD 🥉]',
      placeClass: 'bg-surface-container-highest text-outline border border-outline-variant',
      language: '[ENG / BASALT]',
      duration: '02:01',
    },
  ] satisfies RaceHistoryRow[],
  footer: {
    showing: '[SHOWING 5 OF 412]',
    prev: '[PREV]',
    page: '[PAGE 1 / 83]',
    next: '[NEXT]',
  },
};

export const HEATMAP = {
  title: '[KEYBOARD HEATMAP]',
  caption: '[ERROR FREQUENCY BY KEYSTROKE]',
  legendLabel: '[LEGEND]',
  legend: [
    { id: 'accurate', swatchClass: 'bg-tertiary/20 border border-tertiary', labelClass: 'text-tertiary', label: '[ACCURATE]' },
    { id: 'medium', swatchClass: 'bg-primary/20 border border-primary', labelClass: 'text-primary', label: '[MEDIUM]' },
    { id: 'weak', swatchClass: 'bg-error/20 border border-error', labelClass: 'text-error', label: '[WEAK / FREQ ERROR]' },
  ],
  analysis: {
    weakestLabel: '⚠ [WEAKEST KEYS]:',
    weakestValue: "P (84.1%), ' (86.4%), - (87.0%), / (88.2%)",
    drill: '[RECOMMENDED DRILL: "PUNCTUATION & RIGHT PINKY RUNES"]',
  },
};
