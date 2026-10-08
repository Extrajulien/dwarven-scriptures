import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import { userResources, userStats, users } from './schema';

/**
 * Development helper that exercises the user schema and queries against a real
 * database (`npm run db:verify`). A unit test with a mocked driver cannot prove
 * that the generated DDL accepts these statements, so this checks the migration
 * itself: defaults, cascades, check constraints and atomic updates.
 */

// This script runs outside Next.js, so `.env.local` is not loaded for us. It
// must be read before `./index` is evaluated, and ESM evaluates the whole import
// graph before any module body runs, so the client and queries are imported
// inside `main` instead of at the top of this file.
dotenv.config({ path: '.env.local' });

let failures = 0;

/** JSON with bigints rendered as strings, since JSON cannot represent them. */
function stringify(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
}

function check(label: string, actual: unknown, expected: unknown): void {
  const actualJson = stringify(actual);
  const expectedJson = stringify(expected);

  if (actualJson === expectedJson) {
    console.log(`  ok   ${label}`);
    return;
  }

  failures += 1;
  console.error(
    `  FAIL ${label}\n       expected: ${expectedJson}\n       actual:   ${actualJson}`,
  );
}

/** Asserts that `run` rejects with an error matching `predicate`. */
async function expectRejects(
  label: string,
  run: () => Promise<unknown>,
  predicate: (error: unknown) => boolean,
  describeError: string,
): Promise<void> {
  try {
    await run();
    failures += 1;
    console.error(`  FAIL ${label} (resolved instead of throwing ${describeError})`);
  } catch (error) {
    check(label, predicate(error), true);
  }
}

function isNamed(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

/**
 * Postgres reports a violated CHECK constraint with SQLSTATE 23514. Drizzle
 * wraps driver errors in a `DrizzleQueryError`, so the code sits on the cause
 * chain rather than on the thrown error itself.
 */
function isCheckViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if ((current as { code?: unknown }).code === '23514') {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

async function main(): Promise<void> {
  const { db } = await import('./index');
  const {
    adjustUserCoins,
    createUserWithProfiles,
    getUserFullProfile,
    recordCompletedRace,
  } = await import('./queries/users');

  const username = `verify_${Date.now()}`;
  console.log(`\nUser tables verification (username: ${username})`);

  const created = await createUserWithProfiles({
    username,
    passwordHash: 'hashed-password-placeholder',
  });

  check(
    'users.id is a positive integer',
    Number.isSafeInteger(created.id) && created.id > 0,
    true,
  );
  check(
    'publicId is a generated uuid',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(created.publicId),
    true,
  );
  check('username is stored as given', created.username, username);

  try {
    const byUsername = await getUserFullProfile({ username });
    const byPublicId = await getUserFullProfile({ publicId: created.publicId });

    check('username lookup finds the user', byUsername?.id, created.id);
    check('publicId lookup finds the same user', byPublicId?.id, created.id);
    check('child rows start at zero', byUsername?.racesCompleted, 0);
    check('avgWpm is zero before any race', byUsername?.avgWpm, 0);
    check(
      'passwordHash is never part of the profile',
      byUsername ? 'passwordHash' in byUsername : true,
      false,
    );
    check('bestWpm defaults to 0.00', byUsername?.bestWpm, '0.00');
    check('coins default to 0', byUsername?.coins, '0');

    // 600 words in 60_000 ms would be 600 wpm; the reported wpm is separate.
    await recordCompletedRace({
      internalUserId: created.id,
      wordsTyped: 600,
      timeMs: 60_000,
      wpm: 120,
    });
    await recordCompletedRace({
      internalUserId: created.id,
      wordsTyped: 300,
      timeMs: 30_000,
      wpm: 95.5,
    });

    const afterTwoRaces = await getUserFullProfile({ username });
    check('races accumulate', afterTwoRaces?.racesCompleted, 2);
    check('totalWords accumulates', afterTwoRaces?.totalWords, '900');
    check('totalTimeMs accumulates', afterTwoRaces?.totalTimeMs, '90000');
    check('bestWpm keeps the personal best', afterTwoRaces?.bestWpm, '120.00');
    check('avgWpm is derived from the totals', afterTwoRaces?.avgWpm, 600);

    // A slower race must not lower the personal best.
    await recordCompletedRace({
      internalUserId: created.id,
      wordsTyped: 10,
      timeMs: 10_000,
      wpm: 40,
    });
    const afterSlowRace = await getUserFullProfile({ username });
    check('bestWpm survives a slower race', afterSlowRace?.bestWpm, '120.00');
    check('racesCompleted still increments', afterSlowRace?.racesCompleted, 3);

    await adjustUserCoins(created.id, 500n);
    check('coins increase by the delta', (await getUserFullProfile({ username }))?.coins, '500');

    await adjustUserCoins(created.id, -500n);
    check('coins can be spent back to zero', (await getUserFullProfile({ username }))?.coins, '0');

    await expectRejects(
      'overdrawing is rejected',
      () => adjustUserCoins(created.id, -1n),
      (error) => isNamed(error, 'InsufficientCoinsError'),
      'InsufficientCoinsError',
    );
    check(
      'the rejected spend left the balance untouched',
      (await getUserFullProfile({ username }))?.coins,
      '0',
    );

    await expectRejects(
      'spending for an unknown user is reported',
      () => adjustUserCoins(999_999_999, -1n),
      (error) => isNamed(error, 'UserNotFoundError'),
      'UserNotFoundError',
    );

    await expectRejects(
      'a lookup without an identifier is rejected',
      () => getUserFullProfile({}),
      (error) => isNamed(error, 'InvalidUserInputError'),
      'InvalidUserInputError',
    );
    await expectRejects(
      'a malformed publicId is rejected',
      () => getUserFullProfile({ publicId: 'not-a-uuid' }),
      (error) => isNamed(error, 'InvalidUserInputError'),
      'InvalidUserInputError',
    );
    await expectRejects(
      'a negative wpm is rejected',
      () =>
        recordCompletedRace({
          internalUserId: created.id,
          wordsTyped: 1,
          timeMs: 1,
          wpm: -1,
        }),
      (error) => isNamed(error, 'InvalidRaceReportError'),
      'InvalidRaceReportError',
    );

    check(
      'an unknown username returns null',
      await getUserFullProfile({ username: 'nobody_here' }),
      null,
    );

    // The check constraints back up the atomic WHERE clause of adjustUserCoins.
    await expectRejects(
      'the coins check constraint rejects a direct negative write',
      () =>
        db
          .update(userResources)
          .set({ coins: -1n })
          .where(eq(userResources.userId, created.id)),
      isCheckViolation,
      'a check constraint violation',
    );
  } finally {
    await db.delete(users).where(eq(users.id, created.id));

    const leftoverStats = await db
      .select({ userId: userStats.userId })
      .from(userStats)
      .where(eq(userStats.userId, created.id));
    const leftoverResources = await db
      .select({ userId: userResources.userId })
      .from(userResources)
      .where(eq(userResources.userId, created.id));

    check('deleting a user cascades to user_stats', leftoverStats.length, 0);
    check('deleting a user cascades to user_resources', leftoverResources.length, 0);
  }
}

main()
  .then(() => {
    if (failures > 0) {
      console.error(`\n❌ ${failures} check(s) failed\n`);
      process.exit(1);
    }
    console.log('\n✅ All checks passed\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification crashed:', error);
    process.exit(1);
  });
