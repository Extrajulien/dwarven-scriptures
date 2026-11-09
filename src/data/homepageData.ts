// Mock content for the "Deep Delve // Typist Expedition" home page.
// All user-visible strings live in `src/i18n/messages.ts` (I18N-01): each
// text field here is a message key resolved against the active fr/en bag by
// the rendering component. Only machine values stay in this file: ids,
// hrefs, icon names, Tailwind class strings, numbers, proper nouns and
// decorative runes. Class strings are Tailwind utilities resolved from
// tailwind.config.js.
import type { Messages } from '../i18n/messages';

export interface GuildInfo {
  nameKey: keyof Messages;
  /** Decorative runes — glyphs, not words, same in both languages. */
  runes: string;
  tagKey: keyof Messages;
  streakKey: keyof Messages;
  logoUrl: string;
}

export interface NavLink {
  labelKey: keyof Messages;
  href: string;
}

export interface BreadcrumbInfo {
  leftKey: keyof Messages;
  rightKey: keyof Messages;
}

export interface CrestInfo {
  chapterKey: keyof Messages;
  orderKey: keyof Messages;
  nameKey: keyof Messages;
  mottoKey: keyof Messages;
  level: string;
  statsKeys: readonly [keyof Messages, keyof Messages];
}

export interface ProgressData {
  percent: number;
  fillClass: string;
}

export interface VaultStat {
  id: string;
  labelKey: keyof Messages;
  value: string;
  captionKey?: keyof Messages;
  icon: string;
  iconClass: string;
  valueClass: string;
  captionClass?: string;
  progress?: ProgressData;
}

export interface ActionButtonData {
  id: string;
  labelKey: keyof Messages;
  icon: string;
  className: string;
}

export interface RosterFilter {
  id: string;
  labelKey: keyof Messages;
  active?: boolean;
}

export interface RosterColumn {
  labelKey: keyof Messages;
  align: 'text-left' | 'text-center' | 'text-right';
}

export interface MinerStatus {
  labelKey: keyof Messages;
  pillClass: string;
  dotClass: string;
}

export interface MinerAction {
  labelKey: keyof Messages;
  className: string;
}

export interface Miner {
  id: string;
  initial: string;
  avatarClass: string;
  /** Proper noun (dwarf name) — kept as data, not translated. */
  name: string;
  nameClass: string;
  rankKey: keyof Messages;
  rankClass: string;
  specializationKey: keyof Messages;
  specializationClass: string;
  wpm: number;
  wpmClass: string;
  accuracy: string;
  accuracyClass: string;
  stonesKey: keyof Messages;
  progress: ProgressData;
  status: MinerStatus;
  action: MinerAction;
}

export interface RailBountyBody {
  kind: 'rail';
  startKey: keyof Messages;
  leadKey: keyof Messages;
  endKey: keyof Messages;
  asciiKey: keyof Messages;
  /** Leader marker: a proper noun plus glyphs — kept as data. */
  leader: string;
}

export interface StatusBountyBody {
  kind: 'status';
  textKey: keyof Messages;
  statusKey: keyof Messages;
}

export interface ProgressBountyBody {
  kind: 'progress';
  labelKey: keyof Messages;
  pctLabelKey: keyof Messages;
  asciiKey: keyof Messages;
}

export type BountyBody = RailBountyBody | StatusBountyBody | ProgressBountyBody;

export interface Bounty {
  id: string;
  dotClass: string;
  titleKey: keyof Messages;
  titleClass: string;
  metaKey: keyof Messages;
  metaClass: string;
  rewardKey: keyof Messages;
  rewardClass: string;
  actionKey: keyof Messages;
  actionClass: string;
  body: BountyBody;
}

export interface PerkFooter {
  estimateKey: keyof Messages;
  actionKey: keyof Messages;
}

export interface Perk {
  id: string;
  nameKey: keyof Messages;
  nameClass: string;
  statusKey: keyof Messages;
  statusClass: string;
  borderClass: string | null;
  descriptionKey: keyof Messages;
  progress?: ProgressData;
  footer?: PerkFooter;
  footnoteKey?: keyof Messages;
  locked?: boolean;
}

export interface ChronicleSegment {
  textKey: keyof Messages;
  className?: string;
}

export interface ChronicleEntry {
  id: string;
  /** Proper noun (dwarf name) — kept as data, not translated. */
  author: string;
  authorClass: string;
  timeKey: keyof Messages;
  bodyClass: string;
  segments: ChronicleSegment[];
}

export interface FooterInfo {
  leftKey: keyof Messages;
  statusKey: keyof Messages;
  optimalKey: keyof Messages;
}

export const GUILD: GuildInfo = {
  nameKey: 'guild.name',
  runes: '[ᛞᛖᛖᛈ ᛞᛖᛚᚡᛖ]',
  tagKey: 'guild.tag',
  streakKey: 'guild.streak',
  logoUrl:
    'favicon.png',
};

export const NAV_LINKS: NavLink[] = [
  { labelKey: 'nav.mineRace', href: '#race-cavern' },
  { labelKey: 'nav.guildRanks', href: '#quarry-leaderboard' },
  { labelKey: 'nav.runeworks', href: '#dwarven-armory' },
  { labelKey: 'nav.ledgers', href: '#expedition-archives' },
];

export const BREADCRUMB: BreadcrumbInfo = {
  leftKey: 'home.breadcrumbLeft',
  rightKey: 'home.breadcrumbRight',
};

export const CREST: CrestInfo = {
  chapterKey: 'home.crest.chapter',
  orderKey: 'home.crest.order',
  nameKey: 'home.crest.name',
  mottoKey: 'home.crest.motto',
  level: 'L18',
  statsKeys: ['home.crest.statsExcavators', 'home.crest.statsHallTier'],
};

export const VAULT_STATS: VaultStat[] = [
  {
    id: 'adamantine',
    labelKey: 'home.vault.adamantine.label',
    value: '4,820',
    captionKey: 'home.vault.adamantine.caption',
    icon: 'diamond',
    iconClass: 'text-tertiary',
    valueClass: 'text-primary',
  },
  {
    id: 'magma-fuel',
    labelKey: 'home.vault.magmaFuel.label',
    value: '94.2%',
    icon: 'local_fire_department',
    iconClass: 'text-secondary',
    valueClass: 'text-secondary',
    progress: { percent: 94, fillClass: 'bg-secondary-container' },
  },
  {
    id: 'raw-gems',
    labelKey: 'home.vault.rawGems.label',
    value: '12,450',
    captionKey: 'home.vault.rawGems.caption',
    icon: 'flare',
    iconClass: 'text-tertiary',
    valueClass: 'text-on-surface',
  },
  {
    id: 'hourly-tithe',
    labelKey: 'home.vault.hourlyTithe.label',
    value: '+340/hr',
    captionKey: 'home.vault.hourlyTithe.caption',
    captionClass: 'text-tertiary',
    icon: 'search_music_note',
    iconClass: 'text-primary',
    valueClass: 'text-tertiary',
  },
];

export const ACTION_BUTTONS: ActionButtonData[] = [
  {
    id: 'contribute',
    labelKey: 'home.action.contribute',
    icon: 'add_circle',
    className:
      'bg-primary text-on-primary hover:bg-primary-fixed transition-transform shadow-md',
  },
  {
    id: 'declare-race',
    labelKey: 'home.action.declareRace',
    icon: 'swords',
    className:
      'bg-surface-container-high hover:bg-surface-container-highest text-primary transition-colors shadow-sm',
  },
  {
    id: 'manage-emblem',
    labelKey: 'home.action.manageEmblem',
    icon: 'shield',
    className:
      'bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors',
  },
];

export const ROSTER_FILTERS: RosterFilter[] = [
  { id: 'all', labelKey: 'home.roster.filterAll', active: true },
  { id: 'veterans', labelKey: 'home.roster.filterVeterans' },
  { id: 'champions', labelKey: 'home.roster.filterChampions' },
  { id: 'apprentices', labelKey: 'home.roster.filterApprentices' },
];

export const ROSTER_COLUMNS: RosterColumn[] = [
  { labelKey: 'home.roster.colIdentity', align: 'text-left' },
  { labelKey: 'home.roster.colSpecialization', align: 'text-left' },
  { labelKey: 'home.roster.colPeakWpm', align: 'text-center' },
  { labelKey: 'home.roster.colAccuracy', align: 'text-center' },
  { labelKey: 'home.roster.colStones', align: 'text-left' },
  { labelKey: 'home.roster.colStatus', align: 'text-left' },
  { labelKey: 'home.roster.colOrders', align: 'text-right' },
];

export const MINERS: Miner[] = [
  {
    id: 'urist',
    initial: 'U',
    avatarClass: 'bg-primary text-on-primary',
    name: 'Urist McTypist',
    nameClass: 'text-primary',
    rankKey: 'home.miners.urist.rank',
    rankClass: 'text-secondary-fixed-dim',
    specializationKey: 'home.miners.urist.specialization',
    specializationClass: 'text-on-surface',
    wpm: 112,
    wpmClass: 'text-primary',
    accuracy: '98.4%',
    accuracyClass: 'text-tertiary',
    stonesKey: 'home.miners.urist.stones',
    progress: { percent: 92, fillClass: 'bg-primary' },
    status: {
      labelKey: 'home.miners.urist.status',
      pillClass: 'bg-secondary-container/40 text-on-secondary-container',
      dotClass: 'bg-secondary animate-pulse',
    },
    action: { labelKey: 'home.miners.urist.action', className: 'text-primary' },
  },
  {
    id: 'darin',
    initial: 'D',
    avatarClass: 'bg-surface-container-high text-on-surface',
    name: 'Darin Coppervein',
    nameClass: 'text-on-surface',
    rankKey: 'home.miners.darin.rank',
    rankClass: 'text-outline',
    specializationKey: 'home.miners.darin.specialization',
    specializationClass: 'text-on-surface-variant',
    wpm: 89,
    wpmClass: 'text-on-surface',
    accuracy: '96.1%',
    accuracyClass: 'text-tertiary',
    stonesKey: 'home.miners.darin.stones',
    progress: { percent: 65, fillClass: 'bg-tertiary' },
    status: {
      labelKey: 'home.miners.darin.status',
      pillClass: 'bg-surface-container-high text-on-surface-variant',
      dotClass: 'bg-tertiary',
    },
    action: { labelKey: 'home.miners.darin.action', className: 'text-on-surface' },
  },
  {
    id: 'thrum',
    initial: 'T',
    avatarClass: 'bg-surface-container-high text-on-surface',
    name: 'Thrum Stonebreaker',
    nameClass: 'text-on-surface',
    rankKey: 'home.miners.thrum.rank',
    rankClass: 'text-outline',
    specializationKey: 'home.miners.thrum.specialization',
    specializationClass: 'text-on-surface-variant',
    wpm: 84,
    wpmClass: 'text-on-surface',
    accuracy: '94.0%',
    accuracyClass: 'text-tertiary',
    stonesKey: 'home.miners.thrum.stones',
    progress: { percent: 48, fillClass: 'bg-secondary' },
    status: {
      labelKey: 'home.miners.thrum.status',
      pillClass: 'bg-surface-container-high text-outline',
      dotClass: 'bg-outline',
    },
    action: { labelKey: 'home.miners.thrum.action', className: 'text-on-surface-variant' },
  },
  {
    id: 'kogan',
    initial: 'K',
    avatarClass: 'bg-surface-container-high text-on-surface',
    name: 'Kogan Alelover',
    nameClass: 'text-on-surface',
    rankKey: 'home.miners.kogan.rank',
    rankClass: 'text-error',
    specializationKey: 'home.miners.kogan.specialization',
    specializationClass: 'text-on-surface-variant',
    wpm: 72,
    wpmClass: 'text-on-surface',
    accuracy: '89.2%',
    accuracyClass: 'text-error',
    stonesKey: 'home.miners.kogan.stones',
    progress: { percent: 28, fillClass: 'bg-error' },
    status: {
      labelKey: 'home.miners.kogan.status',
      pillClass: 'bg-error-container/30 text-error',
      dotClass: 'bg-error animate-ping',
    },
    action: { labelKey: 'home.miners.kogan.action', className: 'text-error' },
  },
];

export const BOUNTIES: Bounty[] = [
  {
    id: 'adamantine-vein',
    dotClass: 'bg-secondary animate-pulse',
    titleKey: 'home.bounties.vein.title',
    titleClass: 'text-primary',
    metaKey: 'home.bounties.vein.meta',
    metaClass: 'text-on-surface-variant',
    rewardKey: 'home.bounties.vein.reward',
    rewardClass: 'bg-primary text-on-primary',
    actionKey: 'home.bounties.vein.action',
    actionClass:
      'bg-surface-container-high hover:bg-secondary-container hover:text-on-secondary-container text-on-surface',
    body: {
      kind: 'rail',
      startKey: 'home.bounties.vein.start',
      leadKey: 'home.bounties.vein.lead',
      endKey: 'home.bounties.vein.end',
      asciiKey: 'home.bounties.vein.ascii',
      leader: '► URIST [▲]',
    },
  },
  {
    id: 'magma-trial',
    dotClass: 'bg-error',
    titleKey: 'home.bounties.magma.title',
    titleClass: 'text-on-surface',
    metaKey: 'home.bounties.magma.meta',
    metaClass: 'text-error',
    rewardKey: 'home.bounties.magma.reward',
    rewardClass: 'bg-secondary-container text-on-secondary-container',
    actionKey: 'home.bounties.magma.action',
    actionClass:
      'bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface',
    body: {
      kind: 'status',
      textKey: 'home.bounties.magma.text',
      statusKey: 'home.bounties.magma.status',
    },
  },
  {
    id: 'runic-decryption',
    dotClass: 'bg-tertiary',
    titleKey: 'home.bounties.decryption.title',
    titleClass: 'text-tertiary',
    metaKey: 'home.bounties.decryption.meta',
    metaClass: 'text-on-surface-variant',
    rewardKey: 'home.bounties.decryption.reward',
    rewardClass: 'bg-surface-container-high text-primary',
    actionKey: 'home.bounties.decryption.action',
    actionClass:
      'bg-surface-container-high hover:bg-tertiary hover:text-on-tertiary text-on-surface',
    body: {
      kind: 'progress',
      labelKey: 'home.bounties.decryption.label',
      pctLabelKey: 'home.bounties.decryption.pctLabel',
      asciiKey: 'home.bounties.decryption.ascii',
    },
  },
];

export const PERKS: Perk[] = [
  {
    id: 'basalt-mastery',
    nameKey: 'home.perks.basalt.name',
    nameClass: 'text-on-surface',
    statusKey: 'home.perks.basalt.status',
    statusClass: 'bg-tertiary/20 text-tertiary',
    borderClass: 'border-l-tertiary',
    descriptionKey: 'home.perks.basalt.description',
    footnoteKey: 'home.perks.basalt.footnote',
  },
  {
    id: 'fault-tolerance',
    nameKey: 'home.perks.fault.name',
    nameClass: 'text-on-surface',
    statusKey: 'home.perks.fault.status',
    statusClass: 'bg-tertiary/20 text-tertiary',
    borderClass: 'border-l-tertiary',
    descriptionKey: 'home.perks.fault.description',
    footnoteKey: 'home.perks.fault.footnote',
  },
  {
    id: 'magma-quill',
    nameKey: 'home.perks.quill.name',
    nameClass: 'text-secondary',
    statusKey: 'home.perks.quill.status',
    // No `animate-pulse`: the opacity fade periodically drops the status text
    // below WCAG AA while it runs (flagged by the Lighthouse contrast audit).
    statusClass: 'bg-secondary-container text-on-secondary-container',
    borderClass: 'border-l-secondary',
    descriptionKey: 'home.perks.quill.description',
    progress: { percent: 82, fillClass: 'bg-secondary' },
    footer: {
      estimateKey: 'home.perks.quill.estimate',
      actionKey: 'home.perks.quill.action',
    },
  },
  {
    id: 'forgotten-beast',
    nameKey: 'home.perks.beast.name',
    nameClass: 'text-on-surface-variant',
    statusKey: 'home.perks.beast.status',
    statusClass: 'bg-surface-container-high text-on-surface-variant',
    borderClass: null,
    descriptionKey: 'home.perks.beast.description',
    locked: true,
  },
];

export const CHRONICLES: ChronicleEntry[] = [
  {
    id: 'apex-record',
    author: 'URIST MCTYPIST',
    authorClass: 'text-primary',
    timeKey: 'home.chronicles.apex.time',
    bodyClass: 'text-tertiary font-medium',
    segments: [
      { textKey: 'home.chronicles.apex.s1' },
      { textKey: 'home.chronicles.apex.s2', className: 'font-bold' },
      { textKey: 'home.chronicles.apex.s3' },
    ],
  },
  {
    id: 'tithe-deposit',
    author: 'DARIN COPPERVEIN',
    authorClass: 'text-on-surface',
    timeKey: 'home.chronicles.tithe.time',
    bodyClass: 'text-on-surface-variant',
    segments: [
      { textKey: 'home.chronicles.tithe.s1' },
      { textKey: 'home.chronicles.tithe.s2', className: 'text-primary font-bold' },
      { textKey: 'home.chronicles.tithe.s3' },
    ],
  },
  {
    id: 'cave-in',
    author: 'KOGAN ALELOVER',
    authorClass: 'text-error',
    timeKey: 'home.chronicles.caveIn.time',
    bodyClass: 'text-error',
    segments: [{ textKey: 'home.chronicles.caveIn.s1' }],
  },
  {
    id: 'rune-pickaxes',
    author: 'THRUM STONEBREAKER',
    authorClass: 'text-secondary',
    timeKey: 'home.chronicles.pickaxes.time',
    bodyClass: 'text-on-surface-variant',
    segments: [{ textKey: 'home.chronicles.pickaxes.s1' }],
  },
];

export const FOOTER: FooterInfo = {
  leftKey: 'footer.left',
  statusKey: 'footer.status',
  optimalKey: 'footer.optimal',
};
