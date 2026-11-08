import { buildExplorerHref, parseExplorerFilters } from './explorer-filters';

describe('parseExplorerFilters (JOIN-02)', () => {
  test('accepts supported values', () => {
    expect(parseExplorerFilters({ lang: 'fr', complexity: 'difficile' })).toEqual({
      lang: 'fr',
      complexity: 'difficile',
    });
  });

  test('drops unsupported values instead of forwarding them', () => {
    expect(parseExplorerFilters({ lang: 'de', complexity: 'insane' })).toEqual({
      lang: null,
      complexity: null,
    });
    expect(parseExplorerFilters({ lang: ['fr', 'en'], complexity: ['moyen'] })).toEqual({
      lang: null,
      complexity: null,
    });
  });

  test('returns nulls for an empty search', () => {
    expect(parseExplorerFilters({})).toEqual({ lang: null, complexity: null });
  });
});

describe('buildExplorerHref (JOIN-02)', () => {
  test('sets one filter while preserving the other', () => {
    expect(buildExplorerHref({ lang: 'en', complexity: null }, { complexity: 'moyen' })).toBe(
      '/rooms?lang=en&complexity=moyen',
    );
    expect(buildExplorerHref({ lang: null, complexity: 'facile' }, { lang: 'fr' })).toBe(
      '/rooms?lang=fr&complexity=facile',
    );
  });

  test('clears a filter with null and collapses to /rooms when nothing is selected', () => {
    expect(buildExplorerHref({ lang: 'fr', complexity: 'moyen' }, { lang: null })).toBe(
      '/rooms?complexity=moyen',
    );
    expect(buildExplorerHref({ lang: 'fr', complexity: null }, { lang: null })).toBe('/rooms');
  });
});
