import { buildArchiveHref, parseArchiveFilters } from './archive-filters';

describe('parseArchiveFilters', () => {
  test('accepts supported scope, query and page', () => {
    expect(parseArchiveFilters({ scope: 'mine', q: 'urist', page: '3' })).toEqual({
      scope: 'mine',
      query: 'urist',
      page: 3,
    });
  });

  test('drops unsupported values instead of forwarding them', () => {
    expect(parseArchiveFilters({ scope: 'hidden', q: ['a', 'b'], page: 'nope' })).toEqual({
      scope: 'all',
      query: '',
      page: 1,
    });
  });

  test('trims and caps the query, and rejects non-positive pages', () => {
    expect(parseArchiveFilters({ q: '  padded  ', page: '0' })).toEqual({
      scope: 'all',
      query: 'padded',
      page: 1,
    });
    expect(parseArchiveFilters({ q: 'x'.repeat(200) }).query).toHaveLength(80);
  });

  test('returns defaults for an empty search', () => {
    expect(parseArchiveFilters({})).toEqual({ scope: 'all', query: '', page: 1 });
  });
});

describe('buildArchiveHref', () => {
  test('sets one filter while preserving the others and the page', () => {
    expect(
      buildArchiveHref({ scope: 'all', query: 'urist', page: 3 }, { scope: 'mine' }),
    ).toBe('/previous-races?scope=mine&q=urist');
    expect(
      buildArchiveHref({ scope: 'public', query: '', page: 2 }, { query: 'kogan' }),
    ).toBe('/previous-races?scope=public&q=kogan&page=2');
  });

  test('collapses to the base path when nothing is selected', () => {
    expect(buildArchiveHref({ scope: 'all', query: '', page: 1 }, {})).toBe('/previous-races');
  });

  test('resets the page when the scope changes', () => {
    expect(
      buildArchiveHref({ scope: 'all', query: '', page: 5 }, { scope: 'private' }),
    ).toBe('/previous-races?scope=private');
  });
});
