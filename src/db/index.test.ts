/**
 * @jest-environment node
 *
 * Tests for the Drizzle connection singleton (`src/db/index.ts`).
 *
 * `pg` and `drizzle-orm/node-postgres` are mocked so the tests assert the
 * contract of our own module (pool options, single pool per process) without
 * opening real sockets.
 */

type PoolOptions = {
  connectionString?: string;
  ssl?: false | { rejectUnauthorized: boolean };
};

const poolInstances: { options: PoolOptions }[] = [];
const drizzleCalls: { pool: unknown; config: { schema: Record<string, unknown> } }[] = [];

jest.mock('pg', () => ({
  Pool: class MockPool {
    options: PoolOptions;

    constructor(options: PoolOptions) {
      this.options = options;
      poolInstances.push(this);
    }
  },
}));

jest.mock('drizzle-orm/node-postgres', () => ({
  drizzle: (pool: unknown, config: { schema: Record<string, unknown> }) => {
    drizzleCalls.push({ pool, config });
    return { __mockDrizzle: true, pool, config };
  },
}));

const LOCAL_URL = 'postgresql://postgres:postgres@localhost:5432/app_db';

const originalEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
};

/**
 * `@types/node` exposes `process.env.NODE_ENV` as read-only, but tests need to
 * drive both branches of the production check. This cast is the narrowest way
 * to do so.
 */
const mutableEnv = process.env as Record<string, string | undefined>;

/**
 * Re-imports `./index` with a fresh module registry.
 *
 * `DATABASE_URL` is deleted (not assigned `undefined`, which Node would coerce
 * to the string "undefined") so the missing-variable path can be exercised.
 */
async function loadDbModule(env: { DATABASE_URL?: string; NODE_ENV?: string }) {
  jest.resetModules();
  poolInstances.length = 0;
  drizzleCalls.length = 0;

  if (env.DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = env.DATABASE_URL;
  }
  mutableEnv.NODE_ENV = env.NODE_ENV;

  return import('./index');
}

afterEach(() => {
  delete (globalThis as { conn?: unknown }).conn;
  process.env.DATABASE_URL = originalEnv.DATABASE_URL;
  mutableEnv.NODE_ENV = originalEnv.NODE_ENV;
});

describe('db client', () => {
  test('throws when DATABASE_URL is missing', async () => {
    await expect(loadDbModule({ NODE_ENV: 'development' })).rejects.toThrow(
      'DATABASE_URL is not set in environment variables',
    );
    expect(poolInstances).toHaveLength(0);
  });

  test('disables TLS for a plain local connection', async () => {
    await loadDbModule({ DATABASE_URL: LOCAL_URL, NODE_ENV: 'development' });

    expect(poolInstances).toHaveLength(1);
    expect(poolInstances[0].options).toEqual({
      connectionString: LOCAL_URL,
      ssl: false,
    });
  });

  test('enables TLS with relaxed certificate verification in production', async () => {
    await loadDbModule({ DATABASE_URL: LOCAL_URL, NODE_ENV: 'production' });

    expect(poolInstances[0].options.ssl).toEqual({ rejectUnauthorized: false });
  });

  test('enables TLS for a hosted Railway connection even in development', async () => {
    await loadDbModule({
      DATABASE_URL: 'postgresql://postgres:secret@containers-us-west.railway.app:6543/railway',
      NODE_ENV: 'development',
    });

    expect(poolInstances[0].options.ssl).toEqual({ rejectUnauthorized: false });
  });

  test('reuses one pool and one drizzle instance across imports', async () => {
    await loadDbModule({ DATABASE_URL: LOCAL_URL, NODE_ENV: 'development' });
    // Resolved after resetModules, so it is the same module instance the db
    // module registered (a top-level import would be a different instance).
    const schema = await import('./schema');

    const first = await import('./index');
    const second = await import('./index');

    expect(first.db).toBe(second.db);
    expect(poolInstances).toHaveLength(1);
    expect(drizzleCalls).toHaveLength(1);
    expect(drizzleCalls[0].pool).toBe(poolInstances[0]);
    // The whole schema module is registered, so relational queries keep types.
    expect(drizzleCalls[0].config.schema).toBe(schema);
  });
});
