/**
 * @jest-environment node
 *
 * Unit tests for the race persistence layer. The driver is mocked so these
 * assert the statements we build: one transaction per race, the bounded
 * participant batch, and `user_stats` updated only for human user
 * participants (AUTH-03) with SQL-side increments (no read-modify-write —
 * see `users.test.ts` for the increment SQL itself).
 *
 * The mapping engine payload → persistence input is pure and tested without
 * any mock. Live behaviour (defaults, cascades, CHECK constraints) is
 * exercised by the temporary smoke script against the real database.
 */

import { raceParticipants, races, userStats } from '../schema';
import type { RaceResultsPayload } from '../../realtime/race-engine';

type RecordedCall = {
  operation: 'insert' | 'update' | 'select' | 'delete';
  /** One entry per chained method call, in the order they were invoked. */
  args: unknown[][];
  /** Chained method names, in call order, for structural assertions. */
  methods: string[];
};

const calls: RecordedCall[] = [];
let insertRow: unknown = undefined;
let transactionRuns = 0;

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
    'onConflictDoUpdate',
    'limit',
    'offset',
    'orderBy',
    'groupBy',
  ]) {
    chain[method] = record(method);
  }

  chain.returning = (...args: unknown[]) => {
    call.args.push(args);
    if (operation === 'insert') {
      return Promise.resolve(insertRow === undefined ? [] : [insertRow]);
    }
    return Promise.resolve([]);
  };

  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve([]).then(resolve);

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
    transaction: async (callback: (tx: typeof txStub) => Promise<unknown>) => {
      transactionRuns += 1;
      return callback(txStub);
    },
  },
}));

import {
  InvalidRacePersistenceError,
  KEYSTROKES_PER_WORD,
  mapEngineResultsToPersistence,
  persistRaceResult,
  validateRacePersistence,
} from './races';

beforeEach(() => {
  calls.length = 0;
  insertRow = undefined;
  transactionRuns = 0;
});

/** Argument group recorded for one chained method, or `null`. */
function methodArgOf(call: RecordedCall, method: string): unknown[] | null {
  const index = call.methods.indexOf(method);
  return index >= 0 ? (call.args[index] as unknown[]) : null;
}

/** All inserts targeting one table (first argument identity). */
function insertsOf(table: unknown): RecordedCall[] {
  return calls.filter((call) => call.operation === 'insert' && call.args[0]?.[0] === table);
}

const ROOM_PUBLIC_ID = '11111111-1111-4111-8111-111111111111';
const USER_PUBLIC_ID = '22222222-2222-4222-8222-222222222222';
const GUEST_TOKEN = '33333333-3333-4333-8333-333333333333';

function payloadFixture(): RaceResultsPayload {
  return {
    roomId: 12,
    roomPublicId: ROOM_PUBLIC_ID,
    textBody: 'hello world',
    textLanguage: 'en',
    config: {
      textLanguage: 'en',
      textComplexity: 'facile',
      textType: 'random',
      wordCount: 20,
      timeLimitSeconds: null,
      errorMode: 'accumulate',
      options: { punctuation: false, numbers: false, capitals: false, accents: false },
      bonusesEnabled: false,
      bots: [],
    },
    startedAt: new Date('2026-01-01T12:00:00.000Z'),
    finishedAt: new Date('2026-01-01T12:01:00.000Z'),
    durationMs: 60_000,
    results: [
      {
        participantId: USER_PUBLIC_ID,
        memberId: '1',
        userId: 7,
        guestToken: null,
        displayName: 'ada',
        kind: 'user',
        wpm: 100.25,
        rawWpm: 110.99,
        accuracy: 97.4,
        errors: 3,
        correctKeystrokes: 120,
        totalKeystrokes: 123,
        status: 'finished',
        endedAtMs: 45_000,
        endedAt: new Date('2026-01-01T12:00:45.000Z'),
        progressChars: 120,
        rank: 1,
        wpmSeries: [{ elapsedMs: 1_000, wpm: 80.12 }],
      },
      {
        participantId: GUEST_TOKEN,
        memberId: '2',
        userId: null,
        guestToken: GUEST_TOKEN,
        displayName: 'Gimli',
        kind: 'guest',
        wpm: 90.5,
        rawWpm: 95.2,
        accuracy: 99.0,
        errors: 1,
        correctKeystrokes: 100,
        totalKeystrokes: 101,
        status: 'finished',
        endedAtMs: 50_000,
        endedAt: new Date('2026-01-01T12:00:50.000Z'),
        progressChars: 100,
        rank: 2,
        wpmSeries: [{ elapsedMs: 1_000, wpm: 70.0 }],
      },
    ],
  };
}

describe('mapEngineResultsToPersistence', () => {
  test('maps the race row from the engine payload', () => {
    const payload = payloadFixture();
    const mapped = mapEngineResultsToPersistence(payload);

    expect(mapped.race).toEqual({
      roomId: 12,
      roomPublicId: ROOM_PUBLIC_ID,
      textBody: 'hello world',
      textLanguage: 'en',
      config: payload.config,
      status: 'finished',
      durationMs: 60_000,
      startedAt: payload.startedAt,
      finishedAt: payload.finishedAt,
    });
  });

  test('clamps degenerate WPM values to the column capacity (numeric(8,2))', () => {
    const payload = payloadFixture();
    payload.results[0] = { ...payload.results[0], wpm: Infinity, rawWpm: 1_200_000 };
    payload.results[1] = { ...payload.results[1], wpm: -5 };

    const mapped = mapEngineResultsToPersistence(payload);

    // Infinity (a 0 ms race) lands at 0 so GREATEST keeps the old best;
    // an overflow and a negative value are bounded to the representable range.
    expect(mapped.participants[0].wpm).toBe(0);
    expect(mapped.participants[0].rawWpm).toBe(999_999.99);
    expect(mapped.participants[1].wpm).toBe(0);
  });

  test('maps participant rows with rounded numerics and the identity snapshot', () => {
    const mapped = mapEngineResultsToPersistence(payloadFixture());

    expect(mapped.participants).toHaveLength(2);
    expect(mapped.participants[0]).toMatchObject({
      kind: 'user',
      userId: 7,
      guestToken: null,
      displayName: 'ada',
      wpm: 100.25,
      rawWpm: 110.99,
      accuracy: 97.4,
      errors: 3,
      correctKeystrokes: 120,
      totalKeystrokes: 123,
      status: 'finished',
      finishedAtMs: 45_000,
      rank: 1,
      bonusesReceived: 0,
      wpmSeries: [{ elapsedMs: 1_000, wpm: 80.12 }],
    });
    expect(mapped.participants[1]).toMatchObject({
      kind: 'guest',
      userId: null,
      guestToken: GUEST_TOKEN,
    });
  });
});

describe('validateRacePersistence', () => {
  test('accepts a valid batch', () => {
    expect(() => validateRacePersistence(mapEngineResultsToPersistence(payloadFixture()))).not.toThrow();
  });

  test('rejects an empty participant list', () => {
    const mapped = mapEngineResultsToPersistence(payloadFixture());
    mapped.participants = [];
    expect(() => validateRacePersistence(mapped)).toThrow(InvalidRacePersistenceError);
  });

  test('rejects a batch above the room capacity bound', () => {
    const mapped = mapEngineResultsToPersistence(payloadFixture());
    mapped.participants = Array.from({ length: 31 }, () => ({ ...mapped.participants[0] }));
    expect(() => validateRacePersistence(mapped)).toThrow(/more than 30/);
  });

  test('rejects identity/kind incoherence (AUTH-03 mirrored)', () => {
    const mapped = mapEngineResultsToPersistence(payloadFixture());
    mapped.participants[0] = { ...mapped.participants[0], kind: 'guest' as const, userId: 7, guestToken: null };
    expect(() => validateRacePersistence(mapped)).toThrow(/guest/);
  });
});

describe('persistRaceResult', () => {
  test('writes race + participants + user stats in ONE transaction', async () => {
    insertRow = { id: 99 };

    await persistRaceResult(payloadFixture());

    expect(transactionRuns).toBe(1);

    const raceInserts = insertsOf(races);
    expect(raceInserts).toHaveLength(1);
    const raceValues = methodArgOf(raceInserts[0], 'values')?.[0] as Record<string, unknown>;
    expect(raceValues.roomPublicId).toBe(ROOM_PUBLIC_ID);
    expect(raceValues.status).toBe('finished');
    expect(raceValues.durationMs).toBe(60_000);
    expect(raceValues.textBody).toBe('hello world');

    const participantInserts = insertsOf(raceParticipants);
    expect(participantInserts).toHaveLength(1);
    const batch = methodArgOf(participantInserts[0], 'values')?.[0] as Array<Record<string, unknown>>;
    expect(batch).toHaveLength(2);
    expect(batch[0]).toMatchObject({ raceId: 99, kind: 'user', rank: 1, wpm: '100.25' });
    expect(batch[1]).toMatchObject({ raceId: 99, kind: 'guest', rank: 2 });

    // Human user participants only (AUTH-03): the guest line never reaches stats.
    const statInserts = insertsOf(userStats);
    expect(statInserts).toHaveLength(1);
    expect(statInserts[0].methods).toContain('onConflictDoUpdate');
  });

  test('credits the rank-1 finish as a win and skips a quit rank-1', async () => {
    insertRow = { id: 99 };
    const payload = payloadFixture();
    // A second user participant who quit: rank is not 1, so no win either way.
    payload.results[1] = { ...payload.results[1], participantId: '44444444-4444-4444-8444-444444444444', memberId: '2', userId: 8, guestToken: null, kind: 'user', status: 'quit', rank: 2 };

    await persistRaceResult(payload);

    const statInserts = insertsOf(userStats);
    expect(statInserts).toHaveLength(2);

    const firstValues = methodArgOf(statInserts[0], 'values')?.[0] as Record<string, unknown>;
    expect(firstValues.wins).toBe(1);
    // wordsTyped = floor(totalKeystrokes / 5) — the Annexe A word size.
    expect(firstValues.totalWords).toBe(BigInt(Math.floor(123 / KEYSTROKES_PER_WORD)));
    expect(firstValues.correctKeystrokes).toBe(120n);
    expect(firstValues.totalKeystrokes).toBe(123n);

    const secondValues = methodArgOf(statInserts[1], 'values')?.[0] as Record<string, unknown>;
    expect(secondValues.wins).toBe(0);
  });

  test('never writes user stats for guests or bots (AUTH-03)', async () => {
    insertRow = { id: 99 };
    const payload = payloadFixture();
    payload.results[0] = { ...payload.results[0], kind: 'guest', userId: null, guestToken: GUEST_TOKEN };
    payload.results[1] = {
      ...payload.results[1],
      kind: 'bot',
      userId: null,
      guestToken: null,
      participantId: '55555555-5555-4555-8555-555555555555',
    };

    await persistRaceResult(payload);

    expect(insertsOf(userStats)).toHaveLength(0);
  });
});
