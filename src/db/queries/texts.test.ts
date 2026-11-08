/**
 * @jest-environment node
 *
 * Unit tests for the corpus/dictionary queries (CONF-02/03/05). The driver is
 * mocked with a chain recorder (same convention as `users.test.ts`), so these
 * tests assert the statements we build and the row shapes we return. Live
 * behaviour against the seeded database is verified separately by a
 * throwaway tsx script during development and by the manual seed.
 */

type RecordedCall = {
  operation: 'select';
  args: unknown[][];
  methods: string[];
  queryResult: unknown[];
};

const calls: RecordedCall[] = [];
let selectResult: unknown[] = [];

function newCall(args: unknown[] = []): RecordedCall {
  const call: RecordedCall = { operation: 'select', args: [args], methods: ['select'], queryResult: [] };
  calls.push(call);
  return call;
}

function chainable(call: RecordedCall): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      call.methods.push(method);
      call.args.push(args);
      return chain;
    };

  for (const method of ['from', 'where', 'limit', 'orderBy']) {
    chain[method] = record(method);
  }

  chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(selectResult).then(resolve, reject);

  return chain;
}

jest.mock('../index', () => ({
  db: {
    select: (...args: unknown[]) => chainable(newCall(args)),
  },
}));

import {
  getDictionaryWords,
  getTextById,
  InvalidTextInputError,
  listCoherentCandidates,
  parseDictionaryWords,
} from './texts';

beforeEach(() => {
  calls.length = 0;
  selectResult = [];
});

type Queryable = { toQuery: (config: unknown) => { sql: string; params: unknown[] } };

function isQueryable(value: unknown): value is Queryable {
  return typeof (value as Queryable | null)?.toQuery === 'function';
}

/** Render helpers for the `SQL` fragments recorded as arguments. */
const queryConfig = {
  casing: {
    getColumnCasing: (column: { name?: string }) => column.name ?? '',
  },
  escapeName: (name: string) => `"${name}"`,
  escapeParam: (num: number, value: unknown) => `${String(value)}$${num}`,
  invokeSource: undefined,
};

function collectSql(value: unknown, found: Queryable[], seen: Set<unknown>): void {
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return;
  }
  seen.add(value);

  if (isQueryable(value)) {
    found.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectSql(entry, found, seen));
    return;
  }
  Object.values(value as Record<string, unknown>).forEach((entry) =>
    collectSql(entry, found, seen),
  );
}

function sqlTextOf(): string {
  const found: Queryable[] = [];
  calls.forEach((call) =>
    call.args.forEach((group) => collectSql(group, found, new Set<unknown>())),
  );

  return found
    .map((query) => {
      const built = query.toQuery(queryConfig);
      return [built.sql, ...built.params.map(String)].join(' | ');
    })
    .join(' ');
}

function methodsOf(): string[] {
  return calls.flatMap((call) => call.methods);
}

const CANDIDATE_ROW = {
  id: 3,
  title: 'La Cigale et la Fourmi',
  body: 'La Cigale...',
  language: 'fr',
  complexity: 'facile',
  wordCount: 84,
  hasPunctuation: true,
  hasNumbers: false,
  hasCapitals: true,
  hasAccents: true,
};

describe('listCoherentCandidates (CONF-02/03/05)', () => {
  test('filters texts by language and complexity and returns the rows', async () => {
    selectResult = [CANDIDATE_ROW];

    const rows = await listCoherentCandidates({ language: 'fr', complexity: 'facile' });

    expect(rows).toEqual([CANDIDATE_ROW]);
    expect(methodsOf()).toEqual(expect.arrayContaining(['from', 'where']));
    expect(sqlTextOf()).toContain('"texts"."language"');
    expect(sqlTextOf()).toContain('"texts"."complexity"');
  });

  test('rejects an unknown language before touching the database', async () => {
    await expect(
      listCoherentCandidates({ language: 'de' as never, complexity: 'facile' }),
    ).rejects.toThrow(InvalidTextInputError);
    expect(calls).toHaveLength(0);
  });

  test('rejects an unknown complexity before touching the database', async () => {
    await expect(
      listCoherentCandidates({ language: 'fr', complexity: 'expert' as never }),
    ).rejects.toThrow(/facile, moyen or difficile/);
    expect(calls).toHaveLength(0);
  });
});

describe('parseDictionaryWords (jsonb parsing)', () => {
  test('passes a parsed array through, keeping only strings', () => {
    expect(parseDictionaryWords(['le', 'la', 42, null])).toEqual(['le', 'la']);
  });

  test('parses a raw JSON string', () => {
    expect(parseDictionaryWords('["le","la","chat"]')).toEqual(['le', 'la', 'chat']);
  });

  test('returns an empty list for unparsable or non-array values', () => {
    expect(parseDictionaryWords('not json')).toEqual([]);
    expect(parseDictionaryWords({ words: ['le'] })).toEqual([]);
    expect(parseDictionaryWords(null)).toEqual([]);
    expect(parseDictionaryWords(undefined)).toEqual([]);
  });
});

describe('getDictionaryWords (CONF-03)', () => {
  test('parses the jsonb words column of the matching dictionary row', async () => {
    selectResult = [{ words: ['le', 'la', 'chat'] }];

    await expect(
      getDictionaryWords({ language: 'fr', complexity: 'facile' }),
    ).resolves.toEqual(['le', 'la', 'chat']);
    expect(sqlTextOf()).toContain('"word_dictionaries"."language"');
    expect(sqlTextOf()).toContain('"word_dictionaries"."complexity"');
    expect(methodsOf()).toContain('limit');
  });

  test('returns an empty list when the pair is missing', async () => {
    selectResult = [];
    await expect(
      getDictionaryWords({ language: 'en', complexity: 'difficile' }),
    ).resolves.toEqual([]);
  });

  test('rejects an unknown language or complexity before touching the database', async () => {
    await expect(
      getDictionaryWords({ language: 'it' as never, complexity: 'facile' }),
    ).rejects.toThrow(InvalidTextInputError);
    await expect(
      getDictionaryWords({ language: 'fr', complexity: 'hard' as never }),
    ).rejects.toThrow(InvalidTextInputError);
    expect(calls).toHaveLength(0);
  });
});

describe('getTextById', () => {
  test('returns the passage row when it exists', async () => {
    const row = { ...CANDIDATE_ROW, createdAt: new Date('2026-01-01T00:00:00Z') };
    selectResult = [row];

    await expect(getTextById(3)).resolves.toBe(row);
    expect(sqlTextOf()).toContain('"texts"."id"');
  });

  test('returns null when the passage does not exist', async () => {
    selectResult = [];
    await expect(getTextById(999)).resolves.toBeNull();
  });

  test('rejects a non-positive or non-integer id before touching the database', async () => {
    await expect(getTextById(0)).rejects.toThrow(/positive integer/);
    await expect(getTextById(-1)).rejects.toThrow(/positive integer/);
    await expect(getTextById(1.5)).rejects.toThrow(/positive integer/);
    expect(calls).toHaveLength(0);
  });
});
