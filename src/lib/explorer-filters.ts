/**
 * JOIN-02 pure helpers for the room explorer filters (language, complexity).
 * Kept free of framework imports so the href building and searchParams
 * parsing are unit-testable; the explorer page applies them to render the
 * filter links and pass validated values to `listPublicRoomsForPage`.
 */

export type ExplorerFilters = {
  lang: 'fr' | 'en' | null;
  complexity: 'facile' | 'moyen' | 'difficile' | null;
};

export const EXPLORER_LANGUAGES = ['fr', 'en'] as const;
export const EXPLORER_COMPLEXITIES = ['facile', 'moyen', 'difficile'] as const;

/**
 * Validates the raw searchParams into filter values: anything unsupported is
 * dropped (`null`), never forwarded to the query.
 */
export function parseExplorerFilters(search: {
  lang?: string | string[];
  complexity?: string | string[];
}): ExplorerFilters {
  const rawLang = search.lang;
  const rawComplexity = search.complexity;

  const lang =
    typeof rawLang === 'string' && (EXPLORER_LANGUAGES as readonly string[]).includes(rawLang)
      ? (rawLang as 'fr' | 'en')
      : null;

  const complexity =
    typeof rawComplexity === 'string' &&
    (EXPLORER_COMPLEXITIES as readonly string[]).includes(rawComplexity)
      ? (rawComplexity as 'facile' | 'moyen' | 'difficile')
      : null;

  return { lang, complexity };
}

/**
 * Builds the explorer URL for a filter combination, preserving the other
 * filter: `overrides` wins, `null` clears a filter, and an empty selection
 * produces the plain `/rooms` href.
 */
export function buildExplorerHref(
  filters: ExplorerFilters,
  overrides: Partial<ExplorerFilters>,
): string {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.lang) {
    params.set('lang', next.lang);
  }
  if (next.complexity) {
    params.set('complexity', next.complexity);
  }
  const query = params.toString();
  return query ? `/rooms?${query}` : '/rooms';
}
