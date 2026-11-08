/**
 * @jest-environment node
 *
 * Unit tests for the invitation-link queries (SALLE-04). The driver is mocked
 * so these assert the transaction shape and the SQL-side guards: binding on
 * first use, identity-based reuse, revocation filters.
 */

import { invitationLinks, roomMembers, rooms } from '../schema';
import {
  InvalidInvitationInputError,
  InvitationBoundToOtherError,
  InvitationNotFoundError,
  InvitationRevokedError,
} from './invitations';
import { NotRoomHostError, RoomNotFoundError } from './rooms';

type RecordedCall = {
  operation: 'insert' | 'update' | 'select' | 'delete' | 'transaction';
  args: unknown[][];
  methods: string[];
};

const calls: RecordedCall[] = [];
let selectQueue: unknown[][] = [];
let insertErrors: unknown[] = [];

function newCall(operation: RecordedCall['operation'], args: unknown[] = []): RecordedCall {
  const call: RecordedCall = { operation, args: [args], methods: [operation] };
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

  for (const method of ['values', 'set', 'where', 'from', 'for', 'limit', 'innerJoin', 'leftJoin']) {
    chain[method] = record(method);
  }

  chain.returning = (...args: unknown[]) => {
    call.methods.push('returning');
    call.args.push(args);
    if (operation === 'insert' && insertErrors.length > 0) {
      return Promise.reject(insertErrors.shift());
    }
    return Promise.resolve([]);
  };

  chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
    if (operation === 'select') {
      return Promise.resolve(selectQueue.length > 0 ? selectQueue.shift() : []).then(
        resolve,
        reject,
      );
    }
    return Promise.resolve([]).then(resolve, reject);
  };

  return chain;
}

const txStub = {
  insert: (...args: unknown[]) => chainable('insert', newCall('insert', args)),
  update: (...args: unknown[]) => chainable('update', newCall('update', args)),
  select: (...args: unknown[]) => chainable('select', newCall('select', args)),
  delete: (...args: unknown[]) => chainable('delete', newCall('delete', args)),
};

jest.mock('../index', () => ({
  db: {
    insert: (...args: unknown[]) => chainable('insert', newCall('insert', args)),
    update: (...args: unknown[]) => chainable('update', newCall('update', args)),
    select: (...args: unknown[]) => chainable('select', newCall('select', args)),
    delete: (...args: unknown[]) => chainable('delete', newCall('delete', args)),
    transaction: async (callback: (tx: typeof txStub) => Promise<unknown>) => {
      calls.push({ operation: 'transaction', args: [[]], methods: ['transaction'] });
      return callback(txStub);
    },
  },
}));

import {
  consumeInvitationToken,
  createInvitationLinks,
  getInvitationByToken,
  revokeInvitationsForMember,
} from './invitations';

beforeEach(() => {
  calls.length = 0;
  selectQueue = [];
  insertErrors = [];
});

type Queryable = { toQuery: (config: unknown) => { sql: string; params: unknown[] } };

function isQueryable(value: unknown): value is Queryable {
  return typeof (value as Queryable | null)?.toQuery === 'function';
}

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

function sqlTextOf(operation: RecordedCall['operation']): string {
  const found: Queryable[] = [];
  calls
    .filter((call) => call.operation === operation)
    .forEach((call) => call.args.forEach((group) => collectSql(group, found, new Set<unknown>())));

  return found
    .map((query) => {
      const built = query.toQuery(queryConfig);
      return [built.sql, ...built.params.map(String)].join(' | ');
    })
    .join(' ');
}

function methodsOf(operation: RecordedCall['operation']): string[] {
  return calls.filter((call) => call.operation === operation).flatMap((call) => call.methods);
}

function transactionCount(): number {
  return calls.filter((call) => call.operation === 'transaction').length;
}

function updateSet(index: number): Record<string, unknown> {
  const updates = calls.filter((call) => call.operation === 'update');
  return updates[index].args[1][0] as Record<string, unknown>;
}

const linkRow = {
  id: 1,
  roomId: 42,
  token: 'abc123def456ghi789jkl012mno345',
  status: 'unused',
  boundIp: null,
  boundMemberId: null,
  usedAt: null,
  revokedAt: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
};

const GUEST_TOKEN = '11111111-1111-4111-8111-111111111111';

describe('createInvitationLinks (SALLE-04)', () => {
  test('verifies the host and inserts N unused links with unique tokens', async () => {
    selectQueue = [[{ hostUserId: 7 }]];

    const tokens = await createInvitationLinks({ roomId: 42, hostUserId: 7, count: 3 });

    expect(tokens).toHaveLength(3);
    // base64url, 24 random bytes → 32 characters
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    }
    expect(new Set(tokens).size).toBe(3);

    const inserts = calls.filter((call) => call.operation === 'insert');
    expect(inserts).toHaveLength(1);
    // one insert statement carrying all three rows
    const values = inserts[0].args[1][0] as Array<Record<string, unknown>>;
    expect(values).toHaveLength(3);
    expect(values[0]).toEqual({ roomId: 42, token: tokens[0], status: 'unused' });
    expect(values[1]).toEqual({ roomId: 42, token: tokens[1], status: 'unused' });
    expect(values[2]).toEqual({ roomId: 42, token: tokens[2], status: 'unused' });
  });

  test('refuses when the caller is not the host (SEC-01)', async () => {
    selectQueue = [[{ hostUserId: 8 }]];

    await expect(
      createInvitationLinks({ roomId: 42, hostUserId: 7, count: 1 }),
    ).rejects.toThrow(NotRoomHostError);
    expect(calls.filter((call) => call.operation === 'insert')).toHaveLength(0);
  });

  test('reports an unknown room', async () => {
    selectQueue = [[]];

    await expect(
      createInvitationLinks({ roomId: 42, hostUserId: 7, count: 1 }),
    ).rejects.toThrow(RoomNotFoundError);
  });

  test.each([[0], [101], [1.5], [-1]])('rejects count %s before touching the database', async (count) => {
    await expect(
      createInvitationLinks({ roomId: 42, hostUserId: 7, count }),
    ).rejects.toThrow(/count/);
    expect(calls).toHaveLength(0);
  });
});

describe('getInvitationByToken', () => {
  test('returns the link row for a known token', async () => {
    selectQueue = [[linkRow]];

    await expect(getInvitationByToken(linkRow.token)).resolves.toEqual(linkRow);
    expect(sqlTextOf('select')).toContain('"invitation_links"."token" =');
  });

  test('returns null for an empty token or an unknown one', async () => {
    await expect(getInvitationByToken('')).resolves.toBeNull();

    selectQueue = [[]];
    await expect(getInvitationByToken('nope')).resolves.toBeNull();
  });
});

describe('consumeInvitationToken (SALLE-04)', () => {
  const member = {
    id: 51,
    roomId: 42,
    userId: 7,
    guestToken: null,
  };

  test('binds an unused link to the member and IP', async () => {
    selectQueue = [[linkRow], [member]];

    const result = await consumeInvitationToken({
      token: linkRow.token,
      memberId: 51,
      ip: '203.0.113.7',
    });

    expect(result).toEqual({ roomId: 42, alreadyBound: false });
    expect(transactionCount()).toBe(1);
    expect(methodsOf('select')).toContain('for');

    const set = updateSet(0);
    expect(set.status).toBe('used');
    expect(set.boundIp).toBe('203.0.113.7');
    expect(set.boundMemberId).toBe(51);
    expect(set.usedAt).toBeInstanceOf(Date);
    expect(sqlTextOf('update')).toContain('"invitation_links"."id" =');
  });

  test('refuses a membership that belongs to another room', async () => {
    selectQueue = [[linkRow], [{ ...member, roomId: 99 }]];

    await expect(
      consumeInvitationToken({ token: linkRow.token, memberId: 51, ip: '203.0.113.7' }),
    ).rejects.toThrow(/does not belong to the linked room/);
    expect(calls.filter((call) => call.operation === 'update')).toHaveLength(0);
  });

  test('lets the bound member reuse their used link (reconnect)', async () => {
    const usedLink = {
      ...linkRow,
      status: 'used',
      boundIp: '203.0.113.7',
      boundMemberId: 51,
      usedAt: new Date('2024-01-01T01:00:00Z'),
    };
    selectQueue = [
      [usedLink],
      [member],
      [{ userId: 7, guestToken: null, roomId: 42 }],
    ];

    const result = await consumeInvitationToken({
      token: usedLink.token,
      memberId: 51,
      ip: '198.51.100.9', // a different network is fine for the bound member
    });

    expect(result).toEqual({ roomId: 42, alreadyBound: true });
    expect(calls.filter((call) => call.operation === 'update')).toHaveLength(0);
  });

  test('lets a guest bound member reuse the link by guest identity', async () => {
    const guestMember = { ...member, userId: null, guestToken: GUEST_TOKEN };
    const usedLink = {
      ...linkRow,
      status: 'used',
      boundIp: '203.0.113.7',
      boundMemberId: 51,
      usedAt: new Date('2024-01-01T01:00:00Z'),
    };
    selectQueue = [
      [usedLink],
      [guestMember],
      [{ userId: null, guestToken: GUEST_TOKEN, roomId: 42 }],
    ];

    await expect(
      consumeInvitationToken({ token: usedLink.token, memberId: 51, ip: '203.0.113.7' }),
    ).resolves.toEqual({ roomId: 42, alreadyBound: true });
  });

  test('refuses a used link for anyone else', async () => {
    const usedLink = {
      ...linkRow,
      status: 'used',
      boundIp: '203.0.113.7',
      boundMemberId: 51,
      usedAt: new Date('2024-01-01T01:00:00Z'),
    };
    selectQueue = [
      [usedLink],
      [member],
      [{ userId: 99, guestToken: null, roomId: 42 }],
    ];

    await expect(
      consumeInvitationToken({ token: usedLink.token, memberId: 51, ip: '203.0.113.7' }),
    ).rejects.toThrow(InvitationBoundToOtherError);
    expect(calls.filter((call) => call.operation === 'update')).toHaveLength(0);
  });

  test('refuses a revoked link', async () => {
    selectQueue = [[{ ...linkRow, status: 'revoked', revokedAt: new Date() }]];

    await expect(
      consumeInvitationToken({ token: linkRow.token, memberId: 51, ip: '203.0.113.7' }),
    ).rejects.toThrow(InvitationRevokedError);
  });

  test('refuses an unknown token', async () => {
    selectQueue = [[]];

    await expect(
      consumeInvitationToken({ token: 'missing', memberId: 51, ip: '203.0.113.7' }),
    ).rejects.toThrow(InvitationNotFoundError);
  });

  test('rejects invalid input before touching the database', async () => {
    await expect(
      consumeInvitationToken({ token: '', memberId: 51, ip: '203.0.113.7' }),
    ).rejects.toThrow(InvalidInvitationInputError);
    await expect(
      consumeInvitationToken({ token: 'x', memberId: 0, ip: '203.0.113.7' }),
    ).rejects.toThrow(InvalidInvitationInputError);
    await expect(
      consumeInvitationToken({ token: 'x', memberId: 51, ip: 'not an ip' }),
    ).rejects.toThrow(InvalidInvitationInputError);
    expect(calls).toHaveLength(0);
  });
});

describe('revokeInvitationsForMember (SALLE-04)', () => {
  test('revokes every non-revoked link bound to the member', async () => {
    await revokeInvitationsForMember(51);

    const set = updateSet(0);
    expect(set.status).toBe('revoked');
    expect(set.revokedAt).toBeInstanceOf(Date);
    expect(sqlTextOf('update')).toContain('"invitation_links"."boundMemberId" =');
    expect(sqlTextOf('update')).toContain('"invitation_links"."status" <>');
  });

  test('rejects a non-positive member id', async () => {
    await expect(revokeInvitationsForMember(0)).rejects.toThrow(/memberId/);
    expect(calls).toHaveLength(0);
  });
});

describe('table routing', () => {
  function callsOn(table: unknown): RecordedCall[] {
    return calls.filter(
      (call) =>
        call.operation === 'select' &&
        call.args.some((group) => group[0] === table),
    );
  }

  test('host verification reads the rooms table', async () => {
    selectQueue = [[{ hostUserId: 7 }]];
    await createInvitationLinks({ roomId: 42, hostUserId: 7, count: 1 });

    expect(callsOn(rooms)).toHaveLength(1);
  });

  test('consumption reads and locks the link, then the membership', async () => {
    selectQueue = [[linkRow], [{ id: 51, roomId: 42, userId: 7, guestToken: null }]];

    await consumeInvitationToken({ token: linkRow.token, memberId: 51, ip: '203.0.113.7' });

    expect(callsOn(invitationLinks)).toHaveLength(1);
    expect(callsOn(roomMembers)).toHaveLength(1);
    // the link select locks the row
    const linkSelect = callsOn(invitationLinks)[0];
    expect(linkSelect.methods).toContain('for');
  });
});
