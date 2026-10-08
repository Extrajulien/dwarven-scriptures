/**
 * @jest-environment node
 *
 * Unit tests for the user queries. The driver is mocked so these assert the
 * statements we build — the counters must move inside the database rather than
 * through a JavaScript read-modify-write, which a mocked `db` cannot reveal.
 *
 * End-to-end behaviour (defaults, cascades, CHECK constraints) is covered by
 * `npm run db:verify` against a real database.
 */

type RecordedCall = {
  operation: 'insert' | 'update' | 'select' | 'delete';
  /** One entry per chained method call, in the order they were invoked. */
  args: unknown[][];
  /** Chained method names, in call order, for structural assertions. */
  methods: string[];
  queryResult: unknown[];
};

const calls: RecordedCall[] = [];
let selectResult: unknown[] = [];
let updateRowCount = 0;
let insertRow: unknown;

/** Creates the chain for one operation and records it exactly once. */
function newCall(operation: RecordedCall['operation'], args: unknown[] = []): RecordedCall {
  const call: RecordedCall = { operation, args: [args], methods: [operation], queryResult: [] };
  calls.push(call);
  return call;
}

function chainable(operation: RecordedCall['operation'], call: RecordedCall): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      call.methods.push(method);
      call.args.push(args);
      return chain;
    };

  for (const method of [
    'values',
    'set',
    'where',
    'from',
    'leftJoin',
    'onConflictDoUpdate',
    'limit',
    'orderBy',
  ]) {
    chain[method] = record(method);
  }

  chain.returning = (...args: unknown[]) => {
    call.args.push(args);
    if (operation === 'insert') {
      return Promise.resolve(insertRow === undefined ? [] : [insertRow]);
    }
    return Promise.resolve(Array.from({ length: updateRowCount }, (_value, index) => ({ index })));
  };

  chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(selectResult).then(resolve, reject);

  return chain;
}

const txStub = {
  insert: (...args: unknown[]) => chainable('insert', newCall('insert', args)),
};

jest.mock('../index', () => ({
  db: {
    insert: (...args: unknown[]) => chainable('insert', newCall('insert', args)),
    update: (...args: unknown[]) => chainable('update', newCall('update', args)),
    select: (...args: unknown[]) => chainable('select', newCall('select', args)),
    delete: (...args: unknown[]) => chainable('delete', newCall('delete', args)),
    transaction: async (callback: (tx: typeof txStub) => Promise<unknown>) => callback(txStub),
  },
}));

import { adjustUserCoins, createUserWithProfiles, getUserFullProfile, recordCompletedRace } from './users';

beforeEach(() => {
  calls.length = 0;
  selectResult = [];
  updateRowCount = 0;
  insertRow = undefined;
});

type Queryable = { toQuery: (config: unknown) => { sql: string; params: unknown[] } };

function isQueryable(value: unknown): value is Queryable {
  return typeof (value as Queryable | null)?.toQuery === 'function';
}

/**
 * `SQL.toQuery` expects a full build config; only the casing helper and the
 * escaping hooks are needed to render a fragment for assertions.
 */
const queryConfig = {
  casing: {
    getColumnCasing: (column: { name?: string }) => column.name ?? '',
  },
  escapeName: (name: string) => `"${name}"`,
  escapeParam: (num: number, value: unknown) => `${String(value)}$${num}`,
  invokeSource: undefined,
};

/**
 * Collects `SQL` fragments from a recorded argument group. It recurses because
 * a fragment can sit inside a config object, as it does for
 * `onConflictDoUpdate({ target, set })`.
 */
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

/** Every SQL fragment recorded while an operation ran. */
function sqlArgumentsOf(operation: RecordedCall['operation']): Queryable[] {
  const found: Queryable[] = [];

  calls
    .filter((call) => call.operation === operation)
    .forEach((call) => call.args.forEach((group) => collectSql(group, found, new Set<unknown>())));

  return found;
}

/** All SQL recorded for an operation, rendered with its bound parameters. */
function sqlTextOf(operation: RecordedCall['operation']): string {
  return sqlArgumentsOf(operation)
    .map((query) => {
      const built = query.toQuery(queryConfig);
      return [built.sql, ...built.params.map(String)].join(' | ');
    })
    .join(' ');
}

/** Chained method names recorded for an operation, in order. */
function methodsOf(operation: RecordedCall['operation']): string[] {
  return calls.filter((call) => call.operation === operation).flatMap((call) => call.methods);
}

describe('recordCompletedRace', () => {
  const params = { internalUserId: 7, wordsTyped: 600, timeMs: 60_000, wpm: 120 };

  test('increments every counter inside the statement instead of reading first', async () => {
    await recordCompletedRace(params);

    const text = sqlTextOf('insert');

    expect(text).toContain('"user_stats"."racesCompleted"');
    // The inserted baseline binds 1 as a parameter; the conflict branch adds it.
    expect(sqlTextOf('insert')).toContain('"user_stats"."racesCompleted" + 1');
    expect(text).toContain('"user_stats"."totalWords" + 600');
    expect(text).toContain('"user_stats"."totalTimeMs" + 60000');
    expect(text).toContain('GREATEST("user_stats"."bestWpm", 120.00');
    // No read-modify-write: the stats table is never selected from.
    expect(calls.some((call) => call.operation === 'select')).toBe(false);
  });

  test('upserts on the userId primary key so a missing stats row is still created', async () => {
    await recordCompletedRace(params);

    expect(methodsOf('insert')).toContain('onConflictDoUpdate');

    // The conflict target is the child primary key (a column, not an SQL
    // fragment), and the conflict branch is what carries the arithmetic.
    const conflict = calls[calls.length - 1].args.find((group) =>
      group.some((entry) => (entry as { target?: unknown })?.target),
    );
    const target = (conflict?.[0] as { target?: { name?: string } })?.target;
    expect(target?.name).toBe('userId');
    expect(sqlTextOf('insert')).toContain('"user_stats"."racesCompleted" + 1');
  });

  test.each([
    [{ ...params, internalUserId: 0 }, 'internalUserId'],
    [{ ...params, internalUserId: 1.5 }, 'internalUserId'],
    [{ ...params, wordsTyped: -1 }, 'wordsTyped'],
    [{ ...params, timeMs: -1 }, 'timeMs'],
    [{ ...params, wpm: -1 }, 'wpm'],
  ])('rejects invalid input %#', async (invalid, field) => {
    await expect(recordCompletedRace(invalid)).rejects.toThrow(field as string);
    expect(calls).toHaveLength(0);
  });
});

describe('createUserWithProfiles', () => {
  test('inserts the user and both child rows in one transaction', async () => {
    insertRow = { id: 42, publicId: 'uuid', username: 'ada', passwordHash: 'x', pfpUrl: null, createdAt: new Date() };

    const created = await createUserWithProfiles({ username: 'ada', passwordHash: 'x' });

    expect(created.id).toBe(42);
    // users + user_stats + user_resources
    expect(calls.filter((call) => call.operation === 'insert')).toHaveLength(3);
  });

  test('trims the username and rejects an empty one', async () => {
    insertRow = { id: 1, publicId: 'uuid', username: 'ada', passwordHash: 'x', pfpUrl: null, createdAt: new Date() };
    await createUserWithProfiles({ username: '  ada  ', passwordHash: 'x' });

    await expect(createUserWithProfiles({ username: '   ', passwordHash: 'x' })).rejects.toThrow(
      /username/,
    );
    await expect(createUserWithProfiles({ username: 'a'.repeat(33), passwordHash: 'x' })).rejects.toThrow(
      /at most 32/,
    );
    await expect(createUserWithProfiles({ username: 'ada', passwordHash: '' })).rejects.toThrow(
      /passwordHash/,
    );
  });
});

describe('adjustUserCoins', () => {
  test('guards the balance in the WHERE clause rather than in JavaScript', async () => {
    updateRowCount = 1;
    await adjustUserCoins(7, -100n);

    const where = sqlTextOf('update');
    expect(where).toContain('"user_resources"."coins" + -100');
    expect(where).toContain('>= 0');
    expect(where).toContain('"user_resources"."userId" =');
  });

  test('throws when the guarded update matches no row but the user exists', async () => {
    updateRowCount = 0;
    selectResult = [{ userId: 7 }];

    await expect(adjustUserCoins(7, -1n)).rejects.toThrow(/does not have enough coins/);
  });

  test('throws a not-found error when the resource row does not exist', async () => {
    updateRowCount = 0;
    selectResult = [];

    await expect(adjustUserCoins(7, -1n)).rejects.toThrow(/No user matches/);
  });

  test('rejects a non-positive internal id', async () => {
    await expect(adjustUserCoins(0, 1n)).rejects.toThrow(/positive integer/);
    expect(calls).toHaveLength(0);
  });
});

describe('getUserFullProfile', () => {
  const baseRow = {
    id: 3,
    publicId: '11111111-1111-4111-8111-111111111111',
    username: 'ada',
    pfpUrl: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    racesCompleted: 2,
    totalWords: 900n,
    totalTimeMs: 90_000n,
    bestWpm: '120.00',
    coins: 500n,
    gems: 3,
    passwordHash: 'secret',
  };

  test('returns null when nothing matches', async () => {
    selectResult = [];
    await expect(getUserFullProfile({ username: 'ghost' })).resolves.toBeNull();
  });

  test('derives avgWpm from the totals and never returns the password hash', async () => {
    selectResult = [baseRow];

    const profile = await getUserFullProfile({
      publicId: '11111111-1111-4111-8111-111111111111',
    });

    expect(profile?.avgWpm).toBe(600);
    expect(profile?.totalWords).toBe(900n);
    expect(profile).not.toHaveProperty('passwordHash');
  });

  test('reports avgWpm as zero when no time has been recorded', async () => {
    selectResult = [{ ...baseRow, totalWords: 0n, totalTimeMs: 0n }];

    await expect(getUserFullProfile({ username: 'ada' })).resolves.toMatchObject({ avgWpm: 0 });
  });

  test('tolerates totals that exceed the safe integer range', async () => {
    selectResult = [{ ...baseRow, totalWords: 10n ** 18n, totalTimeMs: 10n ** 9n }];

    const profile = await getUserFullProfile({ username: 'ada' });
    expect(Number.isFinite(profile?.avgWpm)).toBe(true);
    expect(profile?.totalWords).toBe(10n ** 18n);
  });

  test('fills in zeroed statistics when the child rows are missing', async () => {
    selectResult = [
      {
        ...baseRow,
        racesCompleted: null,
        totalWords: null,
        totalTimeMs: null,
        bestWpm: null,
        coins: null,
        gems: null,
      },
    ];

    const profile = await getUserFullProfile({ username: 'ada' });
    expect(profile?.racesCompleted).toBe(0);
    expect(profile?.coins).toBe(0n);
    expect(profile?.gems).toBe(0);
    expect(profile?.bestWpm).toBe('0.00');
    expect(profile?.avgWpm).toBe(0);
  });

  test('looks up by username slug', async () => {
    selectResult = [baseRow];
    await getUserFullProfile({ username: 'ada' });

    expect(sqlTextOf('select')).toContain('"users"."username" =');
  });

  test('looks up by publicId', async () => {
    selectResult = [baseRow];
    await getUserFullProfile({ publicId: '11111111-1111-4111-8111-111111111111' });

    expect(sqlTextOf('select')).toContain('"users"."publicId" =');
  });

  test('joins the statistics and the resources tables', async () => {
    selectResult = [baseRow];
    await getUserFullProfile({ username: 'ada' });

    // from(users) + leftJoin(user_stats) + leftJoin(user_resources)
    expect(methodsOf('select').filter((method) => method === 'leftJoin')).toHaveLength(2);
    expect(methodsOf('select')).toContain('where');
  });

  test('rejects a lookup with no identifier before touching the database', async () => {
    await expect(getUserFullProfile({})).rejects.toThrow(/publicId or username/);
    expect(calls).toHaveLength(0);
  });

  test('rejects a malformed publicId before touching the database', async () => {
    await expect(getUserFullProfile({ publicId: 'nope' })).rejects.toThrow(/UUID/);
    expect(calls).toHaveLength(0);
  });
});
