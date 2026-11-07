/**
 * @jest-environment node
 *
 * Unit tests for the OAuth account queries. The driver is mocked (like
 * `users.test.ts`) so these assert the statements we build and, crucially, the
 * find-or-create and username-collision retry behaviour.
 */

type ReturningResult = { resolve?: unknown; reject?: unknown };

const selectResult: unknown[] = [];
let insertCallCount = 0;
let returningCallCount = 0;
const returningQueue: ReturningResult[] = [];

function resetState(): void {
  selectResult.length = 0;
  insertCallCount = 0;
  returningCallCount = 0;
  returningQueue.length = 0;
}

function uniqueUsernameViolation(): unknown {
  return Object.assign(new Error('DrizzleQueryError'), {
    cause: Object.assign(
      new Error('duplicate key value violates unique constraint "users_username_unique"'),
      { code: '23505', constraint: 'users_username_unique' },
    ),
  });
}

function makeSelectChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'from', 'innerJoin', 'where', 'limit']) {
    chain[method] = () => chain;
  }
  chain.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve([...selectResult]).then(resolve, reject);
  return chain;
}

function makeInsertChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  chain.values = () => chain;
  chain.returning = () => {
    returningCallCount += 1;
    const result = returningQueue.shift();
    if (result?.reject !== undefined) {
      return Promise.reject(result.reject);
    }
    return Promise.resolve(result?.resolve === undefined ? [] : [result.resolve]);
  };
  // Non-returning inserts (user_stats / user_resources / oauth_accounts) are
  // awaited directly, so the chain itself must be thenable.
  chain.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve([]).then(resolve, reject);
  return chain;
}

const txStub = {
  insert: () => {
    insertCallCount += 1;
    return makeInsertChain();
  },
};

jest.mock('../index', () => ({
  db: {
    insert: () => {
      insertCallCount += 1;
      return makeInsertChain();
    },
    select: () => makeSelectChain(),
    transaction: async (callback: (tx: typeof txStub) => Promise<unknown>) => callback(txStub),
  },
}));

import {
  createOrLinkOAuthUser,
  createOAuthUser,
  findUserByOAuthAccount,
} from './oauth-accounts';
import { InvalidUserInputError, UsernameTakenError } from './users';

const profile = {
  provider: 'github' as const,
  providerAccountId: 'gh-123',
  username: 'ada',
  pfpUrl: 'https://avatars.githubusercontent.com/u/123',
};

beforeEach(resetState);

describe('findUserByOAuthAccount', () => {
  test('returns the linked user identifiers when a row exists', async () => {
    selectResult.push({ publicId: '11111111-1111-4111-8111-111111111111', username: 'ada' });

    await expect(findUserByOAuthAccount('github', 'gh-123')).resolves.toEqual({
      publicId: '11111111-1111-4111-8111-111111111111',
      username: 'ada',
    });
  });

  test('returns null when no link exists', async () => {
    await expect(findUserByOAuthAccount('github', 'gh-123')).resolves.toBeNull();
  });

  test('rejects an unknown provider before touching the database', async () => {
    await expect(findUserByOAuthAccount('twitter' as never, 'x-1')).rejects.toThrow(
      InvalidUserInputError,
    );
    expect(selectResult).toHaveLength(0);
  });
});

describe('createOrLinkOAuthUser', () => {
  test('returns the existing user without inserting anything', async () => {
    selectResult.push({ publicId: '11111111-1111-4111-8111-111111111111', username: 'ada' });

    const result = await createOrLinkOAuthUser(profile);

    expect(result).toEqual({
      publicId: '11111111-1111-4111-8111-111111111111',
      username: 'ada',
    });
    expect(insertCallCount).toBe(0);
  });

  test('creates user, child rows and the oauth link in one transaction', async () => {
    returningQueue.push({
      resolve: { id: 7, publicId: '11111111-1111-4111-8111-111111111111', username: 'ada' },
    });

    const result = await createOrLinkOAuthUser(profile);

    expect(result).toEqual({
      publicId: '11111111-1111-4111-8111-111111111111',
      username: 'ada',
    });
    // users + user_stats + user_resources + oauth_accounts
    expect(insertCallCount).toBe(4);
    expect(returningCallCount).toBe(1);
  });
});

describe('createOAuthUser', () => {
  test('retries with a suffix when the provider username is already taken', async () => {
    returningQueue.push(
      { reject: uniqueUsernameViolation() },
      { resolve: { id: 9, publicId: '11111111-1111-4111-8111-111111111111', username: 'ada-a1b2' } },
    );

    const result = await createOAuthUser(profile);

    expect(result.publicId).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.username).toMatch(/^ada-[0-9a-f]{4}$/);
    // First transaction aborted at the users insert; second succeeded with 4 inserts.
    expect(returningCallCount).toBe(2);
    expect(insertCallCount).toBe(5);
  });

  test('gives up with UsernameTakenError after exhausting retries', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      returningQueue.push({ reject: uniqueUsernameViolation() });
    }

    await expect(createOAuthUser(profile)).rejects.toThrow(UsernameTakenError);
    expect(returningCallCount).toBe(5);
  });

  test('rethrows an unrelated database error unchanged', async () => {
    returningQueue.push({ reject: new Error('connection refused') });

    await expect(createOAuthUser(profile)).rejects.toThrow('connection refused');
  });

  test.each([
    [{ ...profile, provider: 'twitter' }, /provider/],
    [{ ...profile, providerAccountId: '   ' }, /providerAccountId/],
    [{ ...profile, username: '   ' }, /username/],
    [{ ...profile, username: 'a'.repeat(33) }, /at most 32/],
    [{ ...profile, pfpUrl: 42 }, /pfpUrl/],
  ])('rejects invalid input %# before touching the database', async (invalid, pattern) => {
    await expect(createOAuthUser(invalid as never)).rejects.toThrow(pattern);
    expect(insertCallCount).toBe(0);
  });
});
