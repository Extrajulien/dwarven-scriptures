import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
  conn: Pool | undefined;
};

/**
 * TECH-05 (build-time environment): the pool is created lazily, on the
 * first query, instead of at module evaluation. `next build` evaluates the
 * module graph of every route to collect its configuration — including
 * routes that never touch the database at build time — so an import-time
 * `DATABASE_URL` check made a build without the variable fail before any
 * page could be compiled. The platform (Railway) sets the variable both at
 * build and at runtime; the lazy pool only removes the import-time hazard,
 * and the first real use still fails loudly with a clear error.
 */

/** Reads and validates `DATABASE_URL`, throwing the documented error. */
function connectionStringOf(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set in environment variables');
  }
  return connectionString;
}

/**
 * Returns the process-wide pool, creating it on first use. In development
 * it is cached on `globalThis` so hot reloads reuse the connection; in
 * production the module instance itself caches it (single import).
 */
function poolOf(): Pool {
  const cached = globalForDb.conn;
  if (cached) {
    return cached;
  }

  const connectionString = connectionStringOf();
  const isProduction =
    process.env.NODE_ENV === 'production' || connectionString.includes('railway');

  const pool = new Pool({
    connectionString,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
  });

  if (process.env.NODE_ENV !== 'production') {
    globalForDb.conn = pool;
  }
  return pool;
}

let dbInstance: NodePgDatabase<typeof schema> | undefined;

/** Creates (once) the Drizzle client over the lazy pool. */
function dbOf(): NodePgDatabase<typeof schema> {
  if (!dbInstance) {
    dbInstance = drizzle(poolOf(), { schema });
  }
  return dbInstance;
}

/**
 * The Drizzle client, proxied so that neither the pool nor the client is
 * built until the first query actually runs. Property access is forwarded
 * to the lazily created instance; methods are bound to it so their `this`
 * never sees the proxy. This keeps the `db.select().from(...)` call shape
 * of every query module unchanged.
 */
export const db: NodePgDatabase<typeof schema> = new Proxy(
  {} as NodePgDatabase<typeof schema>,
  {
    get(_target, property) {
      const instance = dbOf();
      const value = Reflect.get(instance, property, instance);
      return typeof value === 'function' ? value.bind(instance) : value;
    },
    set(_target, property, value) {
      return Reflect.set(dbOf(), property, value);
    },
    has(_target, property) {
      return property in dbOf();
    },
  },
);
