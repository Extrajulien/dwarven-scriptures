import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
  conn: Pool | undefined;
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set in environment variables');
}

const isProduction =
  process.env.NODE_ENV === 'production' || connectionString.includes('railway');

const pool =
  globalForDb.conn ??
  new Pool({
    connectionString,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.conn = pool;
}

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });
