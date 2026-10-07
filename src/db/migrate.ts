import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as dotenv from 'dotenv';

// This module is run directly by `tsx` (see the `db:migrate` script), so
// nothing has loaded Next.js' `.env.local` for us yet.
//
// `src/db/index.ts` reads DATABASE_URL while it is being evaluated, and ESM
// evaluates the whole import graph before any module body runs. A top-level
// `import { db } from './index'` would therefore read the variable before the
// call below had a chance to set it, so the connection is imported lazily
// inside the function instead.
async function runMigrations() {
  dotenv.config({ path: '.env.local' });

  const { db } = await import('./index');

  console.log('⏳ Running database migrations...');
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('✅ Migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
