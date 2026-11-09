import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import * as dotenv from 'dotenv';

/**
 * TEST-02 determinism: before the suite starts, release the seeded demo
 * accounts (demo/demo2/demo3) from any room a previous run or dev session
 * left open, and close the rooms they host. The specs themselves close every
 * room they open; this hook only repairs stale state so a rerun after a crash
 * keeps working (SALLE-06: one active room per person).
 *
 * Runs in Node (outside the browser): it loads `.env.local` like
 * `src/db/migrate.ts` and talks straight to the local PostgreSQL that the dev
 * server also uses.
 */
dotenv.config({ path: '.env.local' });

export default async function globalSetup(): Promise<void> {
  const { db } = await import('../src/db/index');
  const { rooms, roomMembers, users } = await import('../src/db/schema');

  const demoUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.username, ['demo', 'demo2', 'demo3']));
  const demoIds = demoUsers.map((row) => row.id);
  if (demoIds.length === 0) {
    return;
  }

  await db
    .update(roomMembers)
    .set({ leftAt: new Date() })
    .where(and(isNull(roomMembers.leftAt), inArray(roomMembers.userId, demoIds)));

  await db
    .update(rooms)
    .set({ status: 'fermee', closedAt: new Date() })
    .where(and(ne(rooms.status, 'fermee'), inArray(rooms.hostUserId, demoIds)));
}
