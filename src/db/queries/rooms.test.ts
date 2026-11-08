/**
 * @jest-environment node
 *
 * Unit tests for the room queries. The driver is mocked so these assert the
 * statements we build — the SQL-side guards (status in the WHERE clause,
 * capacity counted in SQL, `FOR UPDATE` locking, link revocation inside the
 * kick/close transactions) are what a mocked `db` can reveal. End-to-end
 * behaviour (defaults, cascades, CHECK constraints, partial unique indexes)
 * is covered by `npm run db:verify` against a real database.
 */

import { z } from 'zod';
import { rooms, roomMembers, invitationLinks } from '../schema';
import { defaultRoomConfig } from '../../lib/room-config';

type RecordedCall = {
  operation: 'insert' | 'update' | 'select' | 'delete' | 'transaction';
  /** One entry per chained method call, in the order they were invoked. */
  args: unknown[][];
  /** Chained method names, in call order, for structural assertions. */
  methods: string[];
};

const calls: RecordedCall[] = [];
let selectQueue: unknown[][] = [];
let insertQueue: unknown[] = [];
let insertErrors: unknown[] = [];
let updateErrors: unknown[] = [];

/** Creates the chain for one operation and records it exactly once. */
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

  for (const method of [
    'values',
    'set',
    'where',
    'from',
    'leftJoin',
    'innerJoin',
    'for',
    'onConflictDoUpdate',
    'limit',
    'orderBy',
    'groupBy',
    'offset',
  ]) {
    chain[method] = record(method);
  }

  chain.returning = (...args: unknown[]) => {
    call.methods.push('returning');
    call.args.push(args);
    if (operation === 'insert') {
      if (insertErrors.length > 0) {
        return Promise.reject(insertErrors.shift());
      }
      return Promise.resolve(insertQueue.length > 0 ? [insertQueue.shift()] : []);
    }
    return Promise.resolve([]);
  };

  chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
    if (operation === 'insert' && insertErrors.length > 0) {
      return Promise.reject(insertErrors.shift()).then(resolve, reject);
    }
    if (operation === 'update' && updateErrors.length > 0) {
      return Promise.reject(updateErrors.shift()).then(resolve, reject);
    }
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
  AlreadyInRoomError,
  closeRoom,
  createRoom,
  findHostSuccessorForRoom,
  getRoomByCode,
  getRoomForJoin,
  getRoomInternalByPublicId,
  getRoomPublic,
  joinRoom,
  kickMember,
  leaveRoom,
  listPublicRooms,
  markMemberLeft,
  NotHostCandidateError,
  NotRoomHostError,
  RoomFullError,
  RoomMemberKickedError,
  RoomMemberNotFoundError,
  RoomNotFoundError,
  RoomNotJoinableError,
  transferHost,
  updateRoomConfig,
} from './rooms';

beforeEach(() => {
  calls.length = 0;
  selectQueue = [];
  insertQueue = [];
  insertErrors = [];
  updateErrors = [];
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

function methodsOf(operation: RecordedCall['operation']): string[] {
  return calls.filter((call) => call.operation === operation).flatMap((call) => call.methods);
}

function transactionCount(): number {
  return calls.filter((call) => call.operation === 'transaction').length;
}

/** The `values`/`set` argument of the n-th insert call (0-based). */
function insertValues(index: number): Record<string, unknown> {
  const inserts = calls.filter((call) => call.operation === 'insert');
  return inserts[index].args[1][0] as Record<string, unknown>;
}

/** The `set` argument of the n-th update call (0-based). */
function updateSet(index: number): Record<string, unknown> {
  const updates = calls.filter((call) => call.operation === 'update');
  return updates[index].args[1][0] as Record<string, unknown>;
}

const ROOM_PUBLIC_ID = '11111111-1111-4111-8111-111111111111';

const roomRow = {
  id: 42,
  publicId: ROOM_PUBLIC_ID,
  code: 'ABCDEF',
  hostUserId: 7,
  visibility: 'public',
  status: 'en_attente',
  capacity: 10,
  config: defaultRoomConfig,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  closedAt: null,
};

const memberRow = {
  id: 51,
  roomId: 42,
  userId: 7,
  guestToken: null,
  role: 'participant',
  joinedAt: new Date('2024-01-01T00:00:00Z'),
  leftAt: null,
  kicked: false,
};

function codeUniqueError(): unknown {
  return Object.assign(new Error('DrizzleQueryError'), {
    cause: Object.assign(
      new Error('duplicate key value violates unique constraint "rooms_code_unique"'),
      { code: '23505', constraint: 'rooms_code_unique' },
    ),
  });
}

function oneActiveUniqueError(): unknown {
  return Object.assign(new Error('DrizzleQueryError'), {
    cause: Object.assign(
      new Error('duplicate key value violates unique constraint "room_members_one_active_user_idx"'),
      { code: '23505', constraint: 'room_members_one_active_user_idx' },
    ),
  });
}

describe('createRoom (SALLE-01/02)', () => {
  test('inserts the room and the host membership in one transaction', async () => {
    insertQueue = [roomRow];

    const created = await createRoom({ hostUserId: 7, visibility: 'public' });

    expect(transactionCount()).toBe(1);
    expect(calls.filter((call) => call.operation === 'insert')).toHaveLength(2);

    const roomValues = insertValues(0);
    expect(roomValues.hostUserId).toBe(7);
    expect(roomValues.visibility).toBe('public');
    expect(roomValues.capacity).toBe(10);
    expect(roomValues.config).toEqual(defaultRoomConfig);
    expect(roomValues.code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);

    const hostValues = insertValues(1);
    expect(hostValues.roomId).toBe(42);
    expect(hostValues.userId).toBe(7);
    expect(hostValues.role).toBe('participant');

    // Public shape only: no internal id, no hostUserId.
    expect(created).toEqual({
      publicId: ROOM_PUBLIC_ID,
      code: 'ABCDEF',
      visibility: 'public',
      status: 'en_attente',
      capacity: 10,
      config: defaultRoomConfig,
      createdAt: roomRow.createdAt,
    });
  });

  test('supports a spectator host (SALLE-01)', async () => {
    insertQueue = [roomRow];

    await createRoom({ hostUserId: 7, visibility: 'private', hostRole: 'spectator' });

    expect(insertValues(1).role).toBe('spectator');
  });

  test('retries with a fresh code when the generated code collides', async () => {
    insertErrors = [codeUniqueError()];
    insertQueue = [roomRow];

    const created = await createRoom({ hostUserId: 7, visibility: 'public' });

    expect(transactionCount()).toBe(2);
    expect(created.code).toBe('ABCDEF');
  });

  test('gives up after repeated code collisions', async () => {
    insertErrors = Array.from({ length: 10 }, () => codeUniqueError());

    await expect(createRoom({ hostUserId: 7, visibility: 'public' })).rejects.toThrow(
      /could not allocate/,
    );
    expect(transactionCount()).toBe(10);
  });

  test('rethrows an unrelated insert error unchanged', async () => {
    insertErrors = [new Error('connection refused')];

    await expect(createRoom({ hostUserId: 7, visibility: 'public' })).rejects.toThrow(
      'connection refused',
    );
  });

  test.each([
    [{ hostUserId: 0, visibility: 'public' }, 'hostUserId'],
    [{ hostUserId: 7, visibility: 'hidden' }, 'visibility'],
    [{ hostUserId: 7, visibility: 'public', capacity: 1 }, 'capacity'],
    [{ hostUserId: 7, visibility: 'public', capacity: 31 }, 'capacity'],
    [{ hostUserId: 7, visibility: 'public', hostRole: 'host' }, 'hostRole'],
  ])('rejects invalid input %#', async (invalid, field) => {
    await expect(createRoom(invalid as never)).rejects.toThrow(field as string);
    expect(calls).toHaveLength(0);
  });

  test('rejects an invalid config before touching the database', async () => {
    await expect(
      createRoom({ hostUserId: 7, visibility: 'public', config: { wordCount: 5 } }),
    ).rejects.toThrow(z.ZodError);
    expect(calls).toHaveLength(0);
  });

  test('refuses when the host is already active in another room (SALLE-06)', async () => {
    selectQueue = [[{ id: 9 }]];

    await expect(createRoom({ hostUserId: 7, visibility: 'public' })).rejects.toThrow(
      AlreadyInRoomError,
    );
    expect(calls.filter((call) => call.operation === 'insert')).toHaveLength(0);
  });

  test('maps a lost one-active-room race to AlreadyInRoomError', async () => {
    insertErrors = [oneActiveUniqueError()];

    await expect(createRoom({ hostUserId: 7, visibility: 'public' })).rejects.toThrow(
      AlreadyInRoomError,
    );
    expect(transactionCount()).toBe(1);
  });
});

describe('getRoomByCode', () => {
  test('normalises the code to upper case', async () => {
    selectQueue = [[roomRow]];

    await getRoomByCode(' abcdef ');

    expect(sqlTextOf('select')).toContain('"rooms"."code" =');
    expect(sqlTextOf('select')).toContain('ABCDEF');
  });

  test('returns null for a code outside the room-code alphabet, without querying', async () => {
    await expect(getRoomByCode('AB1CDE')).resolves.toBeNull();
    await expect(getRoomByCode('short')).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  test('returns null when no room matches', async () => {
    selectQueue = [[]];
    await expect(getRoomByCode('ABCDEF')).resolves.toBeNull();
  });
});

describe('getRoomInternalByPublicId', () => {
  test('loads the internal row for a valid publicId', async () => {
    selectQueue = [[roomRow]];

    await expect(getRoomInternalByPublicId(ROOM_PUBLIC_ID)).resolves.toEqual(roomRow);
    expect(sqlTextOf('select')).toContain('"rooms"."publicId" =');
  });

  test('rejects a malformed publicId before touching the database', async () => {
    await expect(getRoomInternalByPublicId('nope')).rejects.toThrow(/UUID/);
    expect(calls).toHaveLength(0);
  });
});

describe('getRoomPublic', () => {
  test('joins the host user and counts present participants in SQL', async () => {
    selectQueue = [
      [
        {
          ...roomRow,
          hostName: 'ada',
          participantCount: '3',
        },
      ],
    ];

    const summary = await getRoomPublic(ROOM_PUBLIC_ID);

    expect(summary).toEqual({
      publicId: ROOM_PUBLIC_ID,
      code: 'ABCDEF',
      visibility: 'public',
      status: 'en_attente',
      capacity: 10,
      config: defaultRoomConfig,
      createdAt: roomRow.createdAt,
      hostName: 'ada',
      participantCount: 3,
    });
    expect(methodsOf('select')).toContain('innerJoin');
    expect(methodsOf('select')).toContain('groupBy');
    expect(sqlTextOf('select')).toContain('filter (where');
    expect(sqlTextOf('select')).toContain('"room_members"."leftAt" is null');
  });

  test('returns null when the room does not exist', async () => {
    selectQueue = [[]];
    await expect(getRoomPublic(ROOM_PUBLIC_ID)).resolves.toBeNull();
  });
});

describe('listPublicRooms (JOIN-02)', () => {
  test('lists only waiting public rooms, oldest first', async () => {
    selectQueue = [[]];

    await listPublicRooms();

    expect(sqlTextOf('select')).toContain('"rooms"."status" =');
    expect(sqlTextOf('select')).toContain('en_attente');
    expect(sqlTextOf('select')).toContain('"rooms"."visibility" =');
    expect(sqlTextOf('select')).toContain('public');
    expect(methodsOf('select')).toContain('orderBy');
    expect(sqlTextOf('select')).toContain('"rooms"."createdAt"');
  });

  test('filters by the configured text language and complexity', async () => {
    selectQueue = [[]];

    await listPublicRooms({ textLanguage: 'fr', textComplexity: 'difficile' });

    expect(sqlTextOf('select')).toContain("->>'textLanguage'");
    expect(sqlTextOf('select')).toContain('fr');
    expect(sqlTextOf('select')).toContain("->>'textComplexity'");
    expect(sqlTextOf('select')).toContain('difficile');
  });

  test('rejects an unknown filter value before touching the database', async () => {
    await expect(listPublicRooms({ textLanguage: 'de' })).rejects.toThrow(/textLanguage/);
    await expect(listPublicRooms({ textComplexity: 'impossible' })).rejects.toThrow(
      /textComplexity/,
    );
    expect(calls).toHaveLength(0);
  });
});

describe('joinRoom (SALLE-05/06/07/09)', () => {
  test('locks the room and inserts the membership in one transaction', async () => {
    selectQueue = [
      [roomRow], // room, FOR UPDATE
      [], // kick history
      [{ count: '1' }], // present participants
      [], // active memberships
    ];
    insertQueue = [memberRow];

    const joined = await joinRoom({ roomId: 42, role: 'participant', userId: 7 });

    expect(joined).toEqual({
      roomPublicId: ROOM_PUBLIC_ID,
      role: 'participant',
      joinedAt: memberRow.joinedAt,
    });
    expect(transactionCount()).toBe(1);
    expect(methodsOf('select')).toContain('for');
    expect(insertValues(0)).toEqual({
      roomId: 42,
      userId: 7,
      guestToken: null,
      role: 'participant',
      joinedAt: expect.any(Date),
    });
  });

  test('accepts a guest identity', async () => {
    const guestToken = '11111111-1111-4111-8111-111111111111';
    selectQueue = [[roomRow], [], [{ count: '0' }], []];
    insertQueue = [{ ...memberRow, userId: null, guestToken }];

    await joinRoom({ roomId: 42, role: 'participant', guestToken });

    expect(insertValues(0).guestToken).toBe(guestToken);
  });

  test('rejects an unknown room', async () => {
    selectQueue = [[], [], [], []];

    await expect(joinRoom({ roomId: 42, role: 'participant', userId: 7 })).rejects.toThrow(
      RoomNotFoundError,
    );
  });

  test('rejects a room that is not joinable (SALLE-09)', async () => {
    selectQueue = [[{ ...roomRow, status: 'en_course' }], [], [], []];

    await expect(joinRoom({ roomId: 42, role: 'participant', userId: 7 })).rejects.toThrow(
      RoomNotJoinableError,
    );
  });

  test('rejects a person kicked from this room (SALLE-07)', async () => {
    selectQueue = [[roomRow], [{ id: 51, kicked: true }], [], []];

    await expect(joinRoom({ roomId: 42, role: 'participant', userId: 7 })).rejects.toThrow(
      RoomMemberKickedError,
    );
  });

  test('rejects a full room for participants (SALLE-05)', async () => {
    selectQueue = [[roomRow], [], [{ count: '10' }], []];

    await expect(joinRoom({ roomId: 42, role: 'participant', userId: 7 })).rejects.toThrow(
      RoomFullError,
    );
  });

  test('spectators bypass the participant capacity', async () => {
    selectQueue = [
      [roomRow],
      [], // kick history
      // no capacity count select is issued for spectators
      [], // active memberships
    ];
    insertQueue = [{ ...memberRow, role: 'spectator' }];

    await joinRoom({ roomId: 42, role: 'spectator', userId: 7 });

    expect(selectQueue).toHaveLength(0); // only room, kick and active selects ran
  });

  test('moves the person out of their previous room (SALLE-06)', async () => {
    selectQueue = [
      [roomRow],
      [],
      [{ count: '0' }],
      [{ id: 9, roomId: 40 }], // active in another room
    ];
    insertQueue = [memberRow];

    await joinRoom({ roomId: 42, role: 'participant', userId: 7 });

    const memberUpdates = calls.filter(
      (call) => call.operation === 'update' && call.args[0][0] === roomMembers,
    );
    expect(memberUpdates).toHaveLength(1);
    expect(memberUpdates[0].args[1][0]).toEqual({ leftAt: expect.any(Date) });
    expect(sqlTextOf('update')).toContain('"room_members"."id" =');
    expect(sqlTextOf('update')).toContain('9');
  });

  test('rejects joining the same room twice (second tab, SALLE-06)', async () => {
    selectQueue = [[roomRow], [], [{ count: '0' }], [{ id: 9, roomId: 42 }]];

    await expect(joinRoom({ roomId: 42, role: 'participant', userId: 7 })).rejects.toThrow(
      AlreadyInRoomError,
    );
    expect(calls.filter((call) => call.operation === 'insert')).toHaveLength(0);
  });

  test('retries when a concurrent join wins the one-active-room race', async () => {
    selectQueue = [
      [roomRow],
      [],
      [{ count: '0' }],
      [], // first pass: no active membership, insert loses the unique race
      [roomRow],
      [],
      [{ count: '0' }],
      [{ id: 9, roomId: 40 }], // second pass: sees the winner, moves them
    ];
    insertErrors = [oneActiveUniqueError()];
    insertQueue = [memberRow];

    const joined = await joinRoom({ roomId: 42, role: 'participant', userId: 7 });

    expect(transactionCount()).toBe(2);
    expect(joined.roomPublicId).toBe(ROOM_PUBLIC_ID);
  });

  test.each([
    [{ roomId: 42, role: 'participant' }, 'exactly one'],
    [{ roomId: 42, role: 'participant', userId: 7, guestToken: '11111111-1111-4111-8111-111111111111' }, 'exactly one'],
    [{ roomId: 42, role: 'participant', guestToken: 'not-a-uuid' }, 'UUID'],
    [{ roomId: 42, role: 'watcher', userId: 7 }, 'role'],
  ])('rejects invalid input %#', async (invalid, message) => {
    await expect(joinRoom(invalid as never)).rejects.toThrow(message as string);
    expect(calls).toHaveLength(0);
  });
});

describe('leaveRoom / markMemberLeft', () => {
  test('sets leftAt on the active membership only', async () => {
    await leaveRoom(42, { userId: 7 });

    expect(updateSet(0)).toEqual({ leftAt: expect.any(Date) });
    expect(sqlTextOf('update')).toContain('"room_members"."roomId" =');
    expect(sqlTextOf('update')).toContain('"room_members"."userId" =');
    expect(sqlTextOf('update')).toContain('"room_members"."leftAt" is null');
  });

  test('markMemberLeft targets one membership row', async () => {
    await markMemberLeft(51);

    expect(sqlTextOf('update')).toContain('"room_members"."id" =');
    expect(sqlTextOf('update')).toContain('"room_members"."leftAt" is null');
  });

  test('rejects an invalid identity before touching the database', async () => {
    await expect(leaveRoom(42, {})).rejects.toThrow(/exactly one/);
    expect(calls).toHaveLength(0);
  });
});

describe('transferHost (SALLE-08)', () => {
  test('passes the host role to an eligible member', async () => {
    selectQueue = [
      [{ id: 42, hostUserId: 7 }],
      [{ id: 52, userId: 9, kicked: false, leftAt: null }],
    ];

    await transferHost(42, 9);

    expect(updateSet(0).hostUserId).toBe(9);
    expect(sqlTextOf('update')).toContain('"rooms"."id" =');
    expect(methodsOf('select')).toContain('for');
  });

  test('does nothing when the target is already the host', async () => {
    selectQueue = [[{ id: 42, hostUserId: 7 }]];

    await transferHost(42, 7);

    expect(calls.filter((call) => call.operation === 'update')).toHaveLength(0);
  });

  test('refuses a target who is not present or was kicked', async () => {
    selectQueue = [[{ id: 42, hostUserId: 7 }], []];
    await expect(transferHost(42, 9)).rejects.toThrow(NotHostCandidateError);

    selectQueue = [
      [{ id: 42, hostUserId: 7 }],
      [{ id: 52, userId: 9, kicked: true, leftAt: null }],
    ];
    await expect(transferHost(42, 9)).rejects.toThrow(NotHostCandidateError);

    selectQueue = [
      [{ id: 42, hostUserId: 7 }],
      [{ id: 52, userId: 9, kicked: false, leftAt: new Date() }],
    ];
    await expect(transferHost(42, 9)).rejects.toThrow(NotHostCandidateError);
  });
});

describe('kickMember (SALLE-04/07, SEC-01)', () => {
  test('kicks the member and revokes their invitation links in one transaction', async () => {
    selectQueue = [
      [{ id: 42, hostUserId: 7 }],
      [{ id: 52, userId: 9, kicked: false, leftAt: null }],
    ];

    await kickMember({ roomId: 42, hostUserId: 7, targetMemberId: 52 });

    const updates = calls.filter((call) => call.operation === 'update');
    expect(updates).toHaveLength(2);

    const memberUpdate = updates.find((call) => call.args[0][0] === roomMembers);
    expect(memberUpdate).toBeDefined();
    const memberSet = memberUpdate!.args[1][0] as Record<string, unknown>;
    expect(memberSet.kicked).toBe(true);
    expect(memberSet.leftAt).toBeInstanceOf(Date);

    const linkUpdate = updates.find((call) => call.args[0][0] === invitationLinks);
    expect(linkUpdate).toBeDefined();
    const linkSet = linkUpdate!.args[1][0] as Record<string, unknown>;
    expect(linkSet.status).toBe('revoked');
    expect(linkSet.revokedAt).toBeInstanceOf(Date);
    expect(sqlTextOf('update')).toContain('"invitation_links"."boundMemberId" =');
    expect(sqlTextOf('update')).toContain('"invitation_links"."status" <>');
  });

  test('refuses when the caller is not the host (SEC-01)', async () => {
    selectQueue = [[{ id: 42, hostUserId: 8 }]];

    await expect(
      kickMember({ roomId: 42, hostUserId: 7, targetMemberId: 52 }),
    ).rejects.toThrow(NotRoomHostError);
    expect(calls.filter((call) => call.operation === 'update')).toHaveLength(0);
  });

  test('refuses to kick the host themselves', async () => {
    selectQueue = [
      [{ id: 42, hostUserId: 7 }],
      [{ id: 51, userId: 7, kicked: false, leftAt: null }],
    ];

    await expect(
      kickMember({ roomId: 42, hostUserId: 7, targetMemberId: 51 }),
    ).rejects.toThrow(/host cannot be kicked/);
  });

  test('ignores an unknown or departed target', async () => {
    selectQueue = [[{ id: 42, hostUserId: 7 }], []];
    await expect(
      kickMember({ roomId: 42, hostUserId: 7, targetMemberId: 52 }),
    ).rejects.toThrow(RoomMemberNotFoundError);

    selectQueue = [
      [{ id: 42, hostUserId: 7 }],
      [{ id: 52, userId: 9, kicked: false, leftAt: new Date() }],
    ];
    await expect(
      kickMember({ roomId: 42, hostUserId: 7, targetMemberId: 52 }),
    ).rejects.toThrow(RoomMemberNotFoundError);
  });
});

describe('closeRoom (SALLE-04, COURSE-01)', () => {
  test('closes the room, revokes all links and evicts every member', async () => {
    selectQueue = [[{ id: 42, hostUserId: 7 }]];

    await closeRoom({ roomId: 42, hostUserId: 7 });

    const updates = calls.filter((call) => call.operation === 'update');
    expect(updates).toHaveLength(3);

    const roomUpdate = updates.find((call) => call.args[0][0] === rooms);
    const roomSet = roomUpdate!.args[1][0] as Record<string, unknown>;
    expect(roomSet.status).toBe('fermee');
    expect(roomSet.closedAt).toBeInstanceOf(Date);

    const linkUpdate = updates.find((call) => call.args[0][0] === invitationLinks);
    expect((linkUpdate!.args[1][0] as Record<string, unknown>).status).toBe('revoked');

    const memberUpdate = updates.find((call) => call.args[0][0] === roomMembers);
    expect((memberUpdate!.args[1][0] as Record<string, unknown>).leftAt).toBeInstanceOf(Date);
    expect(sqlTextOf('update')).toContain('"room_members"."leftAt" is null');
  });

  test('refuses when the caller is not the host (SEC-01)', async () => {
    selectQueue = [[{ id: 42, hostUserId: 8 }]];

    await expect(closeRoom({ roomId: 42, hostUserId: 7 })).rejects.toThrow(NotRoomHostError);
    expect(calls.filter((call) => call.operation === 'update')).toHaveLength(0);
  });
});

describe('updateRoomConfig (CONF-01..12)', () => {
  test('stores the parsed config for the host', async () => {
    selectQueue = [[{ id: 42, hostUserId: 7 }]];

    await updateRoomConfig({ roomId: 42, hostUserId: 7, config: defaultRoomConfig });

    const roomUpdate = calls
      .filter((call) => call.operation === 'update')
      .find((call) => call.args[0][0] === rooms);
    const set = roomUpdate!.args[1][0] as Record<string, unknown>;
    expect(set.config).toEqual(defaultRoomConfig);
    expect(set.updatedAt).toBeInstanceOf(Date);
  });

  test('rejects an invalid config before touching the database', async () => {
    await expect(
      updateRoomConfig({ roomId: 42, hostUserId: 7, config: { wordCount: 5 } }),
    ).rejects.toThrow(z.ZodError);
    expect(calls).toHaveLength(0);
  });

  test('refuses when the caller is not the host (SEC-01)', async () => {
    selectQueue = [[{ id: 42, hostUserId: 8 }]];

    await expect(
      updateRoomConfig({ roomId: 42, hostUserId: 7, config: defaultRoomConfig }),
    ).rejects.toThrow(NotRoomHostError);
  });
});

describe('getRoomForJoin (SP-1B seam)', () => {
  test('returns the room and its present members with display names', async () => {
    selectQueue = [
      [roomRow],
      [
        {
          memberId: 51,
          role: 'participant',
          userId: 7,
          guestToken: null,
          username: 'ada',
          joinedAt: memberRow.joinedAt,
        },
      ],
    ];

    const state = await getRoomForJoin(42);

    expect(state?.roomId).toBe(42);
    expect(state?.members[0]).toEqual({
      memberId: 51,
      role: 'participant',
      userId: 7,
      guestToken: null,
      username: 'ada',
      joinedAt: memberRow.joinedAt,
    });
    expect(methodsOf('select')).toContain('leftJoin');
    expect(sqlTextOf('select')).toContain('"room_members"."leftAt" is null');
  });

  test('returns null for an unknown room', async () => {
    selectQueue = [[]];
    await expect(getRoomForJoin(42)).resolves.toBeNull();
  });
});

describe('findHostSuccessorForRoom (SALLE-08)', () => {
  test('applies the pure rule to the present members', async () => {
    selectQueue = [
      [
        { ...memberRow, id: 61, userId: 11, joinedAt: new Date('2024-01-03T00:00:00Z') },
        { ...memberRow, id: 62, userId: 12, joinedAt: new Date('2024-01-01T00:00:00Z') },
      ],
    ];

    const successor = await findHostSuccessorForRoom(42);

    expect(successor?.userId).toBe(12);
  });

  test('returns null when no human member is eligible', async () => {
    selectQueue = [
      [
        {
          ...memberRow,
          userId: null,
          guestToken: '11111111-1111-4111-8111-111111111111',
        },
      ],
    ];

    await expect(findHostSuccessorForRoom(42)).resolves.toBeNull();
  });
});
