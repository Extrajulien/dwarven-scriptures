/**
 * Pure helpers for the "previous races" archive filters (scope, free-text
 * search, pagination). Framework-free so the parsing and href building are
 * unit-testable; the archive page applies them to render the filter links and
 * pass validated values to `listFinishedRacesArchive`.
 */

export type ArchiveScope = 'all' | 'mine' | 'private' | 'public';

export type ArchiveFilters = {
  scope: ArchiveScope;
  /** Trimmed, length-capped free-text search; empty when absent. */
  query: string;
  /** 1-based page; defaults to 1 and rejects anything invalid. */
  page: number;
};

export const ARCHIVE_SCOPES = ['all', 'mine', 'private', 'public'] as const;

const QUERY_MAX_LENGTH = 80;

/**
 * Validates the raw searchParams into archive filter values: an unsupported
 * scope falls back to `'all'`, an empty/oversized query is dropped, and a
 * non-positive page falls back to 1. Nothing invalid is forwarded to the query.
 */
export function parseArchiveFilters(search: {
  scope?: string | string[];
  q?: string | string[];
  page?: string | string[];
}): ArchiveFilters {
  const rawScope = typeof search.scope === 'string' ? search.scope : '';
  const scope = (ARCHIVE_SCOPES as readonly string[]).includes(rawScope)
    ? (rawScope as ArchiveScope)
    : 'all';

  const rawQuery = typeof search.q === 'string' ? search.q : '';
  const query = rawQuery.slice(0, QUERY_MAX_LENGTH).trim();

  const rawPage = typeof search.page === 'string' ? search.page : '';
  const parsedPage = Number.parseInt(rawPage, 10);
  const page = Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  return { scope, query, page };
}

/**
 * Builds the archive URL for a filter combination, preserving the other
 * filters and the page. An empty selection produces the plain `/previous-races`
 * href; changing scope resets the page to 1 (a new filter starts at the top).
 */
export function buildArchiveHref(
  filters: ArchiveFilters,
  overrides: Partial<ArchiveFilters>,
): string {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.scope !== 'all') {
    params.set('scope', next.scope);
  }
  if (next.query !== '') {
    params.set('q', next.query);
  }
  // Scope changes reset pagination; only keep the page when it is explicit.
  const scopeChanged = overrides.scope !== undefined && overrides.scope !== filters.scope;
  if (!scopeChanged && next.page > 1) {
    params.set('page', String(next.page));
  }
  const query = params.toString();
  return query ? `/previous-races?${query}` : '/previous-races';
}
