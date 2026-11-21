// Static labels and structure for the "previous races" archive ledger.
// User-visible strings live in `src/i18n/messages.ts` (I18N-01): each label
// here is a message key resolved against the active fr/en bag by the rendering
// component. Machine values (icons, alignment, scope ids) stay here. Real data
// (champion, standings, your result, summary) comes from PostgreSQL through
// `src/db/queries/races.ts`.
import type { Messages } from '../i18n/messages';

export type ArchiveColumn = {
  labelKey: keyof Messages;
  align: 'text-left' | 'text-center' | 'text-right';
  /** Login-only column, hidden for guests (they have no "your result"). */
  authOnly?: boolean;
};

export const ARCHIVE_COLUMNS: ArchiveColumn[] = [
  { labelKey: 'previousRaces.col.chamber', align: 'text-left' },
  { labelKey: 'previousRaces.col.type', align: 'text-left' },
  { labelKey: 'previousRaces.col.champion', align: 'text-left' },
  { labelKey: 'previousRaces.col.yourResult', align: 'text-left', authOnly: true },
  { labelKey: 'previousRaces.col.scribes', align: 'text-center' },
  { labelKey: 'previousRaces.col.scripture', align: 'text-left' },
  { labelKey: 'previousRaces.col.finished', align: 'text-right' },
];

export type ArchiveScope = 'all' | 'mine' | 'private' | 'public';

export type ArchiveFilterTab = {
  id: ArchiveScope;
  labelKey: keyof Messages;
  icon: string | null;
  /** Login-only filter (guests can only browse public races). */
  authOnly?: boolean;
};

export const ARCHIVE_FILTER_TABS: ArchiveFilterTab[] = [
  { id: 'all', labelKey: 'previousRaces.filter.all', icon: null },
  { id: 'mine', labelKey: 'previousRaces.filter.mine', icon: 'person', authOnly: true },
  { id: 'private', labelKey: 'previousRaces.filter.private', icon: 'lock', authOnly: true },
  { id: 'public', labelKey: 'previousRaces.filter.public', icon: 'public' },
];

/** Rank badge colour pair (DES-04: a styled `#N` badge, no medal emojis). */
export function rankBadgeClass(rank: number): string {
  return rank === 1
    ? 'bg-primary text-on-primary'
    : 'bg-surface-container-highest text-on-surface-variant border border-outline-variant';
}
