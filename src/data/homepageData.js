// Mock content for the "Deep Delve // Typist Expedition" home page.
// Values are placeholders until the real-time backend, auth and i18n land.
// Class strings are Tailwind utilities resolved from tailwind.config.js.

export const GUILD = {
  title: 'Dwarven Scriptures',
  runes: '[ᛞᛖᛖᛈ ᛞᛖᛚᚡᛖ]',
  tag: '[GUILD: IRONVEIN QUARRY - EXPEDITION #84]',
  streak: '🔥 STREAK: 14 STONES',
  logoUrl:
    'favicon.png',
  user: {
    name: 'Overseer Urist McTypist',
    role: '(Lvl 24 Stonewright)',
  },
};

export const NAV_LINKS = [
  { label: 'Mine Race', href: '#race-cavern' },
  { label: 'Guild Ranks', href: '#quarry-leaderboard' },
  { label: 'Runeworks', href: '#dwarven-armory' },
  { label: 'Ledgers', href: '#expedition-archives' },
];

export const BREADCRUMB = {
  left: '᚛ GUILD_HQ // EXPEDITION_#84 // CITADEL_OF_GRANITE ᚜',
  right: 'STATUS: FORTRESS_ACTIVE ▪ DEFENSE_RATING: 9400 ▪ SEAL: INTACT',
};

export const CREST = {
  chapter: 'CHAPTER 84',
  order: '[ANCIENT ORDER]',
  name: 'IRONVEIN QUARRY',
  motto:
    '\u201CStrike the Deepest Veins, Etch the Sacred Runes with Iron Quill.\u201D',
  level: 'L18',
  stats: ['⚔ 38 EXCAVATORS ACTIVE', 'HALL TIER: GRAND STRONGHOLD'],
};

export const VAULT_STATS = [
  {
    id: 'adamantine',
    label: 'ADAMANTINE',
    value: '4,820',
    caption: 'Ingots Stored',
    icon: 'diamond',
    iconClass: 'text-tertiary',
    valueClass: 'text-primary',
  },
  {
    id: 'magma-fuel',
    label: 'MAGMA FUEL',
    value: '94.2%',
    icon: 'local_fire_department',
    iconClass: 'text-secondary',
    valueClass: 'text-secondary',
    progress: { percent: 94, fillClass: 'bg-secondary-container' },
  },
  {
    id: 'raw-gems',
    label: 'RAW GEMS',
    value: '12,450',
    caption: 'Cut & Uncut',
    icon: 'flare',
    iconClass: 'text-tertiary',
    valueClass: 'text-on-surface',
  },
  {
    id: 'hourly-tithe',
    label: 'HOURLY TITHE',
    value: '+340/hr',
    caption: 'Active Surge Active',
    captionClass: 'text-tertiary',
    icon: 'search_music_note',
    iconClass: 'text-primary',
    valueClass: 'text-tertiary',
  },
];

export const ACTION_BUTTONS = [
  {
    id: 'contribute',
    label: '[CONTRIBUTE TO VAULT]',
    icon: 'add_circle',
    className:
      'bg-primary text-on-primary hover:bg-primary-fixed transition-transform shadow-md',
  },
  {
    id: 'declare-race',
    label: '[DECLARE NEW CAVERN RACE]',
    icon: 'swords',
    className:
      'bg-surface-container-high hover:bg-surface-container-highest text-primary transition-colors shadow-sm',
  },
  {
    id: 'manage-emblem',
    label: '[MANAGE EMBLEM & BANNER]',
    icon: 'shield',
    className:
      'bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors',
  },
];

export const ROSTER_FILTERS = [
  { id: 'all', label: '[ALL MINERS (38)]', active: true },
  { id: 'veterans', label: '[VETERAN ENGRAVERS (12)]' },
  { id: 'champions', label: '[CHAMPION TYPISTS (6)]' },
  { id: 'apprentices', label: '[APPRENTICES (20)]' },
];

export const ROSTER_COLUMNS = [
  { label: 'MINER IDENTITY', align: 'text-left' },
  { label: 'SPECIALIZATION', align: 'text-left' },
  { label: 'PEAK WPM', align: 'text-center' },
  { label: 'ACCURACY', align: 'text-center' },
  { label: 'STONES MINED', align: 'text-left' },
  { label: 'CHAMBER STATUS', align: 'text-left' },
  { label: 'ORDERS', align: 'text-right' },
];

export const MINERS = [
  {
    id: 'urist',
    initial: 'U',
    avatarClass: 'bg-primary text-on-primary',
    name: 'Urist McTypist',
    nameClass: 'text-primary',
    rank: '[OVERSEER // GRAND GOLD]',
    rankClass: 'text-secondary-fixed-dim',
    specialization: 'Master Engraver',
    specializationClass: 'text-on-surface',
    wpm: 112,
    wpmClass: 'text-primary',
    accuracy: '98.4%',
    accuracyClass: 'text-tertiary',
    stones: '148,920 STONES',
    progress: { percent: 92, fillClass: 'bg-primary' },
    status: {
      label: 'RACING #MINE-8449',
      pillClass: 'bg-secondary-container/40 text-on-secondary-container',
      dotClass: 'bg-secondary animate-pulse',
    },
    action: { label: '[INSPECT]', className: 'text-primary' },
  },
  {
    id: 'darin',
    initial: 'D',
    avatarClass: 'bg-surface-container-high text-on-surface',
    name: 'Darin Coppervein',
    nameClass: 'text-on-surface',
    rank: '[VETERAN FOREMAN]',
    rankClass: 'text-outline',
    specialization: 'Pickaxe Specialist',
    specializationClass: 'text-on-surface-variant',
    wpm: 89,
    wpmClass: 'text-on-surface',
    accuracy: '96.1%',
    accuracyClass: 'text-tertiary',
    stones: '82,400 STONES',
    progress: { percent: 65, fillClass: 'bg-tertiary' },
    status: {
      label: 'FORGING RUNES',
      pillClass: 'bg-surface-container-high text-on-surface-variant',
      dotClass: 'bg-tertiary',
    },
    action: { label: '[CHALLENGE]', className: 'text-on-surface' },
  },
  {
    id: 'thrum',
    initial: 'T',
    avatarClass: 'bg-surface-container-high text-on-surface',
    name: 'Thrum Stonebreaker',
    nameClass: 'text-on-surface',
    rank: '[HEAVY QUARRIER]',
    rankClass: 'text-outline',
    specialization: 'Bedrock Cleaver',
    specializationClass: 'text-on-surface-variant',
    wpm: 84,
    wpmClass: 'text-on-surface',
    accuracy: '94.0%',
    accuracyClass: 'text-tertiary',
    stones: '61,120 STONES',
    progress: { percent: 48, fillClass: 'bg-secondary' },
    status: {
      label: 'MEAD HALL REST',
      pillClass: 'bg-surface-container-high text-outline',
      dotClass: 'bg-outline',
    },
    action: { label: '[CHALLENGE]', className: 'text-on-surface-variant' },
  },
  {
    id: 'kogan',
    initial: 'K',
    avatarClass: 'bg-surface-container-high text-on-surface',
    name: 'Kogan Alelover',
    nameClass: 'text-on-surface',
    rank: '[UNSTABLE PROSPECTOR]',
    rankClass: 'text-error',
    specialization: 'Tunnel Breaker',
    specializationClass: 'text-on-surface-variant',
    wpm: 72,
    wpmClass: 'text-on-surface',
    accuracy: '89.2%',
    accuracyClass: 'text-error',
    stones: '34,500 STONES',
    progress: { percent: 28, fillClass: 'bg-error' },
    status: {
      label: 'SCOUTING MAGMA',
      pillClass: 'bg-error-container/30 text-error',
      dotClass: 'bg-error animate-ping',
    },
    action: { label: '[DISCIPLINE]', className: 'text-error' },
  },
];

export const BOUNTIES = [
  {
    id: 'adamantine-vein',
    dotClass: 'bg-secondary animate-pulse',
    title: 'CHAMBER #8849: ADAMANTINE VEIN RACE',
    titleClass: 'text-primary',
    meta: '4 TYPISTS IN TUNNEL ▪ APEX SPEED REQ: 90+ WPM ▪ TACTICAL DEPTH: -520Z',
    metaClass: 'text-on-surface-variant',
    reward: '+2,500 GUILD XP',
    rewardClass: 'bg-primary text-on-primary',
    action: '[JOIN CART]',
    actionClass:
      'bg-surface-container-high hover:bg-secondary-container hover:text-on-secondary-container text-on-surface',
    body: {
      kind: 'rail',
      start: '[ENTRANCE: RUNIC GATE]',
      lead: 'CURRENT LEAD: URIST (82% EXCAVATED)',
      end: '[DEEP VEIN CORE]',
      ascii: '[████████████████████████████░░░░░░] 82%',
      leader: '► URIST [▲]',
    },
  },
  {
    id: 'magma-trial',
    dotClass: 'bg-error',
    title: 'DEEP MAGMA CRAG SPEED TRIAL (SOLO ORDEAL)',
    titleClass: 'text-on-surface',
    meta: 'HARDCORE REQUIREMENT: >95 WPM ▪ ZERO FAULTS (100% ACCURACY)',
    metaClass: 'text-error',
    reward: 'LEGENDARY MAGMA PICKAXE SKIN',
    rewardClass: 'bg-secondary-container text-on-secondary-container',
    action: '[COMMENCE TRIAL]',
    actionClass:
      'bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface',
    body: {
      kind: 'status',
      text: 'Runes Remaining: 420 words of basalt glyphs under molten pressure.',
      status: 'STATUS: UNCLAIMED TODAY',
    },
  },
  {
    id: 'runic-decryption',
    dotClass: 'bg-tertiary',
    title: 'ANCIENT RUNIC SCRIPTURE DECRYPTION',
    titleClass: 'text-tertiary',
    meta: 'COOPERATIVE GUILD DELVE ▪ DUAL LINGUAL [ENG / LATIN LITURGY]',
    metaClass: 'text-on-surface-variant',
    reward: 'GOAL: 50,000 WORDS',
    rewardClass: 'bg-surface-container-high text-primary',
    action: '[TYPE RUNES]',
    actionClass:
      'bg-surface-container-high hover:bg-tertiary hover:text-on-tertiary text-on-surface',
    body: {
      kind: 'progress',
      label: 'PROGRESSION: 39,000 / 50,000 WORDS MINED',
      pctLabel: '78% DECRYPTED',
      ascii: '[====================>          ] 78% DECRYPTED',
    },
  },
];

export const PERKS = [
  {
    id: 'basalt-mastery',
    name: 'Ancient Basalt Mastery',
    nameClass: 'text-on-surface',
    status: '[UNLOCKED]',
    statusClass: 'bg-tertiary/20 text-tertiary',
    borderClass: 'border-l-tertiary',
    description:
      '+5% WPM velocity multiplier across all volcanic cavern and magma crag race courses.',
    footnote: 'TIER I ▪ APPLIED TO ALL BROTHERS',
  },
  {
    id: 'fault-tolerance',
    name: 'Fault Tolerance Reinforcement',
    nameClass: 'text-on-surface',
    status: '[UNLOCKED]',
    statusClass: 'bg-tertiary/20 text-tertiary',
    borderClass: 'border-l-tertiary',
    description:
      'Pickaxe withstands +1 typo fault without shattering rock streak momentum.',
    footnote: 'TIER II ▪ APPLIED TO ALL BROTHERS',
  },
  {
    id: 'magma-quill',
    name: 'Magma-Cooled Quill',
    nameClass: 'text-secondary',
    status: '82% FORGED',
    statusClass: 'bg-secondary-container text-on-secondary-container animate-pulse',
    borderClass: 'border-l-secondary',
    description:
      'Zero input lag buffering on frantic monospaced keystrokes. Heat dissipation runes.',
    progress: { percent: 82, fillClass: 'bg-secondary' },
    footer: { estimate: 'EST: 4 HOURS REMAINING', action: '[FEED ORE]' },
  },
  {
    id: 'forgotten-beast',
    name: 'Forgotten Beast Cleaver',
    nameClass: 'text-outline',
    status: '[LOCKED: LVL 20]',
    statusClass: 'bg-surface-container-high text-outline',
    borderClass: null,
    description: '+25% Adamantine yield harvested from Titan keystroke encounter phases.',
    locked: true,
  },
];

export const CHRONICLES = [
  {
    id: 'apex-record',
    author: 'URIST MCTYPIST',
    authorClass: 'text-primary',
    time: '02 MINS AGO',
    bodyClass: 'text-tertiary font-medium',
    segments: [
      { text: '⚡ New Apex Speed Record set in Chamber #8849: ' },
      { text: '112 WPM', className: 'font-bold' },
      { text: ' with 0 faults!' },
    ],
  },
  {
    id: 'tithe-deposit',
    author: 'DARIN COPPERVEIN',
    authorClass: 'text-on-surface',
    time: '14 MINS AGO',
    bodyClass: 'text-on-surface-variant',
    segments: [
      { text: 'Tithe deposited: ' },
      { text: '+400 Adamantine Ingots', className: 'text-primary font-bold' },
      { text: ' transferred to Vault.' },
    ],
  },
  {
    id: 'cave-in',
    author: 'KOGAN ALELOVER',
    authorClass: 'text-error',
    time: '28 MINS AGO',
    bodyClass: 'text-error',
    segments: [
      {
        text: '⚠ Minor Cave-in triggered in Sub-Vein C! Typo burst dropped tunnel stability by 4%.',
      },
    ],
  },
  {
    id: 'rune-pickaxes',
    author: 'THRUM STONEBREAKER',
    authorClass: 'text-secondary',
    time: '1 HOUR AGO',
    bodyClass: 'text-on-surface-variant',
    segments: [
      {
        text: 'Crafted 3x Rune Pickaxes for apprentice typists entering the magma trial.',
      },
    ],
  },
];

export const FOOTER = {
  left: '▪ DEPTH: -480 Z-LEVEL (MAGMA CRAG) ▪ ROOM: #EXP-84 (PUBLIC LANTERN) ▪ PROTOCOL: ASCII_SOCKET_v2',
  status: 'STATUS: [MINING SYNCHRONIZED]',
  optimal: '● SYSTEM OPTIMAL: 112 WPM APEX',
};
