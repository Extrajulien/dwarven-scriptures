/**
 * @jest-environment node
 *
 * Zod validation tests for the realtime protocol (TECH-07): every message
 * shape in both directions, the strictness rules and the error-code mapping.
 */

import { defaultRoomConfig } from '../lib/room-config';
import {
  clientMessageSchema,
  countdownStartedMessageSchema,
  errorMessageSchema,
  joinRoomMessageSchema,
  raceFinishedMessageSchema,
  raceSnapshotMessageSchema,
  raceTickMessageSchema,
  roomSnapshotMessageSchema,
  serverMessageSchema,
  WS_ERROR_CODES,
  type ClientMessage,
  type ServerMessage,
} from './protocol';

const ROOM_PUBLIC_ID = '8f9c2a55-3b4a-4c1e-8a2d-9e7f6a5b4c3d';
const USER_PUBLIC_ID = '1f2e3d4c-5b6a-4978-8c9d-0e1f2a3b4c5d';
const GUEST_TOKEN = '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d';

const validUserMember = {
  kind: 'user',
  publicId: USER_PUBLIC_ID,
  username: 'ada',
  pfpUrl: null,
  role: 'participant',
  joinedAt: '2026-11-07T21:00:00.000Z',
  connected: true,
};

const validGuestMember = {
  kind: 'guest',
  guestToken: GUEST_TOKEN,
  nickname: 'Dwarf42',
  role: 'participant',
  joinedAt: '2026-11-07T21:00:00.000Z',
  connected: true,
};

const validRoom = {
  publicId: ROOM_PUBLIC_ID,
  code: 'DWRF42',
  visibility: 'public',
  status: 'en_attente',
  capacity: 10,
  config: defaultRoomConfig,
  host: { publicId: USER_PUBLIC_ID, username: 'ada' },
  createdAt: '2026-11-07T20:00:00.000Z',
};

describe('client → server messages', () => {
  test('accepts a joinRoom by code', () => {
    const parsed = clientMessageSchema.safeParse({ type: 'joinRoom', code: ' dwrf42 ' });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ type: 'joinRoom', code: 'DWRF42' });
    }
  });

  test('accepts a joinRoom by invitation token, with a guest nickname', () => {
    const parsed = clientMessageSchema.safeParse({
      type: 'joinRoom',
      invitationToken: 'abc123-_',
      nickname: '  Gimli  ',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        type: 'joinRoom',
        invitationToken: 'abc123-_',
        nickname: 'Gimli',
      });
    }
  });

  test('rejects joinRoom with both code and token, or neither', () => {
    expect(
      clientMessageSchema.safeParse({ type: 'joinRoom', code: 'DWRF42', invitationToken: 'x' })
        .success,
    ).toBe(false);
    expect(clientMessageSchema.safeParse({ type: 'joinRoom' }).success).toBe(false);
  });

  test('rejects a code outside the SALLE-02 alphabet and a too-short nickname', () => {
    expect(clientMessageSchema.safeParse({ type: 'joinRoom', code: 'DWRF0O' }).success).toBe(
      false,
    );
    expect(
      clientMessageSchema.safeParse({ type: 'joinRoom', code: 'DWRF42', nickname: 'ab' }).success,
    ).toBe(false);
  });

  test('rejects unknown keys on joinRoom (strict)', () => {
    expect(
      clientMessageSchema.safeParse({ type: 'joinRoom', code: 'DWRF42', role: 'spectator' })
        .success,
    ).toBe(false);
  });

  test('accepts leaveRoom and ping', () => {
    expect(clientMessageSchema.safeParse({ type: 'leaveRoom' }).success).toBe(true);
    expect(clientMessageSchema.safeParse({ type: 'ping' }).success).toBe(true);
  });

  test('rejects an unknown message type and non-object payloads', () => {
    expect(clientMessageSchema.safeParse({ type: 'joinRoomNow' }).success).toBe(false);
    expect(clientMessageSchema.safeParse(null).success).toBe(false);
    expect(clientMessageSchema.safeParse('joinRoom').success).toBe(false);
  });

  test('the inferred client type stays a discriminated union', () => {
    const message: ClientMessage = { type: 'ping' };
    expect(message.type).toBe('ping');
  });

  test('joinRoomMessageSchema requires the type discriminator', () => {
    expect(joinRoomMessageSchema.safeParse({ code: 'DWRF42' }).success).toBe(false);
  });

  test('accepts startRace, quitRace and rejoinRace (no payload beyond room context)', () => {
    for (const type of ['startRace', 'quitRace', 'rejoinRace'] as const) {
      const parsed = clientMessageSchema.safeParse({ type });
      expect(parsed.success).toBe(true);
    }
  });

  test('rejects startRace, quitRace and rejoinRace carrying extra keys (strict)', () => {
    expect(clientMessageSchema.safeParse({ type: 'startRace', force: true }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: 'quitRace', now: true }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: 'rejoinRace', room: 1 }).success).toBe(false);
  });

  test('accepts a raceProgress with cumulative integer counters', () => {
    const parsed = clientMessageSchema.safeParse({
      type: 'raceProgress',
      validatedChars: 120,
      correctKeystrokes: 130,
      totalKeystrokes: 145,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        type: 'raceProgress',
        validatedChars: 120,
        correctKeystrokes: 130,
        totalKeystrokes: 145,
      });
    }
  });

  test('rejects raceProgress with negative, fractional or missing counters', () => {
    expect(
      clientMessageSchema.safeParse({
        type: 'raceProgress',
        validatedChars: -1,
        correctKeystrokes: 0,
        totalKeystrokes: 0,
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: 'raceProgress',
        validatedChars: 1.5,
        correctKeystrokes: 2,
        totalKeystrokes: 3,
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: 'raceProgress',
        validatedChars: 1,
        correctKeystrokes: 2,
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: 'raceProgress',
        validatedChars: 1,
        correctKeystrokes: 2,
        totalKeystrokes: 3,
        wpm: 60, // client-derived values are rejected: the server computes them
      }).success,
    ).toBe(false);
  });
});

describe('server → client messages', () => {
  test('accepts a full roomSnapshot with user and guest members', () => {
    const parsed = serverMessageSchema.safeParse({
      type: 'roomSnapshot',
      room: validRoom,
      members: [validUserMember, validGuestMember],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const members = (parsed.data as { members: unknown[] }).members;
      expect(members).toHaveLength(2);
    }
  });

  test('accepts a guest member whose nickname is not known yet (no live socket)', () => {
    const parsed = serverMessageSchema.safeParse({
      type: 'roomSnapshot',
      room: validRoom,
      members: [{ ...validGuestMember, nickname: null, connected: false }],
    });

    expect(parsed.success).toBe(true);
  });

  test('accepts memberJoined, memberLeft and memberKicked', () => {
    for (const type of ['memberJoined', 'memberLeft', 'memberKicked'] as const) {
      const parsed = serverMessageSchema.safeParse({
        type,
        roomPublicId: ROOM_PUBLIC_ID,
        member: validUserMember,
      });
      expect(parsed.success).toBe(true);
    }
  });

  test('accepts hostChanged, configUpdated and roomClosed', () => {
    expect(
      serverMessageSchema.safeParse({
        type: 'hostChanged',
        roomPublicId: ROOM_PUBLIC_ID,
        host: { publicId: USER_PUBLIC_ID, username: 'bob' },
      }).success,
    ).toBe(true);
    expect(
      serverMessageSchema.safeParse({
        type: 'configUpdated',
        roomPublicId: ROOM_PUBLIC_ID,
        config: defaultRoomConfig,
      }).success,
    ).toBe(true);
    expect(
      serverMessageSchema.safeParse({ type: 'roomClosed', roomPublicId: ROOM_PUBLIC_ID })
        .success,
    ).toBe(true);
  });

  test('rejects a config that violates the room-config schema (CONF bounds)', () => {
    const invalidConfig = { ...defaultRoomConfig, wordCount: 1 };
    const parsed = serverMessageSchema.safeParse({
      type: 'configUpdated',
      roomPublicId: ROOM_PUBLIC_ID,
      config: invalidConfig,
    });

    expect(parsed.success).toBe(false);
  });

  test('rejects a snapshot with a bad uuid, bad code or a member lacking identity', () => {
    expect(
      roomSnapshotMessageSchema.safeParse({
        type: 'roomSnapshot',
        room: { ...validRoom, publicId: 'not-a-uuid' },
        members: [],
      }).success,
    ).toBe(false);
    expect(
      roomSnapshotMessageSchema.safeParse({
        type: 'roomSnapshot',
        room: { ...validRoom, code: 'BAD0O1' },
        members: [],
      }).success,
    ).toBe(false);
    expect(
      roomSnapshotMessageSchema.safeParse({
        type: 'roomSnapshot',
        room: validRoom,
        members: [{ ...validUserMember, publicId: undefined }],
      }).success,
    ).toBe(false);
  });

  test('rejects a member that is neither user nor guest', () => {
    const parsed = serverMessageSchema.safeParse({
      type: 'roomSnapshot',
      room: validRoom,
      members: [
        { ...validUserMember, kind: 'bot', publicId: undefined, guestToken: GUEST_TOKEN },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  test('accepts pong', () => {
    expect(serverMessageSchema.safeParse({ type: 'pong' }).success).toBe(true);
  });

  test('accepts countdownStarted and raceStarted', () => {
    const countdown = serverMessageSchema.safeParse({
      type: 'countdownStarted',
      roomPublicId: ROOM_PUBLIC_ID,
      startAt: '2026-11-08T18:00:03.000Z',
      textId: '12',
      text: 'Les nains creusent trop profond.',
      totalLength: 31,
    });
    expect(countdown.success).toBe(true);

    const started = serverMessageSchema.safeParse({
      type: 'raceStarted',
      roomPublicId: ROOM_PUBLIC_ID,
      startAt: '2026-11-08T18:00:03.000Z',
    });
    expect(started.success).toBe(true);
  });

  test('accepts countdownStarted for a generated random text (textId null)', () => {
    const parsed = countdownStartedMessageSchema.safeParse({
      type: 'countdownStarted',
      roomPublicId: ROOM_PUBLIC_ID,
      startAt: '2026-11-08T18:00:03.000Z',
      textId: null,
      text: 'fort donjon nain pierre',
      totalLength: 22,
    });
    expect(parsed.success).toBe(true);
  });

  test('rejects countdownStarted with an empty text, a non-positive length or a bad date', () => {
    const base = {
      type: 'countdownStarted',
      roomPublicId: ROOM_PUBLIC_ID,
      startAt: '2026-11-08T18:00:03.000Z',
      textId: null as string | null,
      text: 'abc',
      totalLength: 3,
    };
    expect(countdownStartedMessageSchema.safeParse({ ...base, text: '' }).success).toBe(false);
    expect(countdownStartedMessageSchema.safeParse({ ...base, totalLength: 0 }).success).toBe(
      false,
    );
    expect(
      countdownStartedMessageSchema.safeParse({ ...base, startAt: 'not-a-date' }).success,
    ).toBe(false);
  });

  test('accepts a raceTick with user, guest and bot participants', () => {
    const parsed = raceTickMessageSchema.safeParse({
      type: 'raceTick',
      roomPublicId: ROOM_PUBLIC_ID,
      tickAt: '2026-11-08T18:00:06.000Z',
      participants: [
        {
          participantId: USER_PUBLIC_ID,
          kind: 'user',
          displayName: 'ada',
          position: 31,
          wpm: 52.4,
          finished: true,
        totalLength: 100,
        },
        {
          participantId: GUEST_TOKEN,
          kind: 'guest',
          displayName: 'Gimli',
          position: 12,
          wpm: 18.2,
          finished: false,
        totalLength: 100,
        },
        {
          participantId: '3a4b5c6d-7e8f-4a9b-8c0d-1e2f3a4b5c6d',
          kind: 'bot',
          displayName: 'Noob-1',
          position: 9,
          wpm: 15,
          finished: false,
        totalLength: 100,
        },
      ],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.participants).toHaveLength(3);
    }
  });

  test('rejects raceTick participants with negative position, negative wpm or bad identity', () => {
    const base = {
      type: 'raceTick',
      roomPublicId: ROOM_PUBLIC_ID,
      tickAt: '2026-11-08T18:00:06.000Z',
    };
    expect(
      raceTickMessageSchema.safeParse({
        ...base,
        participants: [
          {
            participantId: USER_PUBLIC_ID,
            kind: 'user',
            displayName: 'ada',
            position: -2,
            wpm: 10,
            finished: false,
          totalLength: 100,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      raceTickMessageSchema.safeParse({
        ...base,
        participants: [
          {
            participantId: 'not-a-uuid',
            kind: 'user',
            displayName: 'ada',
            position: 2,
            wpm: 10,
            finished: false,
          totalLength: 100,
          },
        ],
      }).success,
    ).toBe(false);
  });

  test('accepts participantFinished with and without the provisional rank', () => {
    expect(
      serverMessageSchema.safeParse({
        type: 'participantFinished',
        roomPublicId: ROOM_PUBLIC_ID,
        participantId: USER_PUBLIC_ID,
        rank: 1,
      }).success,
    ).toBe(true);
    expect(
      serverMessageSchema.safeParse({
        type: 'participantFinished',
        roomPublicId: ROOM_PUBLIC_ID,
        participantId: USER_PUBLIC_ID,
      }).success,
    ).toBe(true);
  });

  test('accepts participantQuit and raceAborted', () => {
    expect(
      serverMessageSchema.safeParse({
        type: 'participantQuit',
        roomPublicId: ROOM_PUBLIC_ID,
        participantId: GUEST_TOKEN,
      }).success,
    ).toBe(true);
    expect(
      serverMessageSchema.safeParse({
        type: 'raceAborted',
        roomPublicId: ROOM_PUBLIC_ID,
        reason: 'afk_timeout',
      }).success,
    ).toBe(true);
  });

  test('accepts raceFinished with a full mixed ranking', () => {
    const parsed = raceFinishedMessageSchema.safeParse({
      type: 'raceFinished',
      roomPublicId: ROOM_PUBLIC_ID,
      durationMs: 45_321,
      results: [
        {
          participantId: USER_PUBLIC_ID,
          displayName: 'ada',
          kind: 'user',
          wpm: 61.2,
          rawWpm: 68.9,
          accuracy: 95.4,
          errors: 6,
          status: 'finished',
          finishedAtMs: 41_000,
          rank: 1,
          bonusesReceived: 0,
          wpmSeries: [
            { elapsedMs: 1_000, wpm: 40 },
            { elapsedMs: 41_000, wpm: 61.2 },
          ],
        },
        {
          participantId: GUEST_TOKEN,
          displayName: 'Gimli',
          kind: 'guest',
          wpm: 12.3,
          rawWpm: 20.1,
          accuracy: 61,
          errors: 14,
          status: 'timeout',
          finishedAtMs: 45_321,
          rank: 2,
          bonusesReceived: 0,
          wpmSeries: [{ elapsedMs: 45_321, wpm: 12.3 }],
        },
        {
          participantId: '3a4b5c6d-7e8f-4a9b-8c0d-1e2f3a4b5c6d',
          displayName: 'Noob-1',
          kind: 'bot',
          wpm: 8.1,
          rawWpm: 9.2,
          accuracy: 88,
          errors: 5,
          status: 'quit',
          finishedAtMs: 22_000,
          rank: 3,
          bonusesReceived: 0,
          wpmSeries: [],
        },
      ],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.results.map((result) => result.status)).toEqual([
        'finished',
        'timeout',
        'quit',
      ]);
      expect(parsed.data.results[0].wpmSeries).toHaveLength(2);
    }
  });

  test('rejects raceFinished results missing the wpmSeries or with invalid samples', () => {
    const valid = {
      type: 'raceFinished',
      roomPublicId: ROOM_PUBLIC_ID,
      durationMs: 10_000,
      results: [
        {
          participantId: USER_PUBLIC_ID,
          displayName: 'ada',
          kind: 'user',
          wpm: 60,
          rawWpm: 60,
          accuracy: 100,
          errors: 0,
          status: 'finished',
          finishedAtMs: 9_000,
          rank: 1,
          bonusesReceived: 0,
          wpmSeries: [{ elapsedMs: 9_000, wpm: 60 }],
        },
      ],
    };
    expect(raceFinishedMessageSchema.safeParse(valid).success).toBe(true);

    const missing = {
      ...valid,
      results: [{ ...valid.results[0], wpmSeries: undefined }],
    };
    expect(raceFinishedMessageSchema.safeParse(missing).success).toBe(false);

    expect(
      raceFinishedMessageSchema.safeParse({
        ...valid,
        results: [
          { ...valid.results[0], wpmSeries: [{ elapsedMs: -1, wpm: 60 }] },
        ],
      }).success,
    ).toBe(false);
    expect(
      raceFinishedMessageSchema.safeParse({
        ...valid,
        results: [
          { ...valid.results[0], wpmSeries: [{ elapsedMs: 1.5, wpm: 60 }] },
        ],
      }).success,
    ).toBe(false);
    expect(
      raceFinishedMessageSchema.safeParse({
        ...valid,
        results: [
          { ...valid.results[0], wpmSeries: [{ elapsedMs: 100, wpm: -2 }] },
        ],
      }).success,
    ).toBe(false);
    expect(
      raceFinishedMessageSchema.safeParse({
        ...valid,
        results: [{ ...valid.results[0], wpmSeries: 'nope' }],
      }).success,
    ).toBe(false);
  });

  test('rejects raceFinished results with bad status, rank or accuracy', () => {
    const base = {
      type: 'raceFinished',
      roomPublicId: ROOM_PUBLIC_ID,
      durationMs: 10_000,
      results: [
        {
          participantId: USER_PUBLIC_ID,
          displayName: 'ada',
          kind: 'user',
          wpm: 60,
          rawWpm: 60,
          accuracy: 100,
          errors: 0,
          status: 'finished' as string,
          finishedAtMs: 9_000,
          rank: 1,
          bonusesReceived: 0,
          wpmSeries: [],
        },
      ],
    };
    expect(raceFinishedMessageSchema.safeParse(base).success).toBe(true);
    expect(
      raceFinishedMessageSchema.safeParse({
        ...base,
        results: [{ ...base.results[0], status: 'crashed' }],
      }).success,
    ).toBe(false);
    expect(
      raceFinishedMessageSchema.safeParse({
        ...base,
        results: [{ ...base.results[0], rank: 0 }],
      }).success,
    ).toBe(false);
    expect(
      raceFinishedMessageSchema.safeParse({
        ...base,
        results: [{ ...base.results[0], accuracy: 101 }],
      }).success,
    ).toBe(false);
    expect(
      raceFinishedMessageSchema.safeParse({
        ...base,
        results: [{ ...base.results[0], participantId: 'nope' }],
      }).success,
    ).toBe(false);
  });

  test('accepts a full raceSnapshot resume payload', () => {
    const parsed = raceSnapshotMessageSchema.safeParse({
      type: 'raceSnapshot',
      roomPublicId: ROOM_PUBLIC_ID,
      phase: 'en_course',
      startedAt: '2026-11-08T18:00:00.000Z',
      startAt: '2026-11-08T18:00:03.000Z',
      textId: '12',
      text: 'Les nains creusent trop profond.',
      totalLength: 31,
      progress: { validatedChars: 12, correctKeystrokes: 12, totalKeystrokes: 14 },
    });

    expect(parsed.success).toBe(true);
  });

  test('accepts a raceSnapshot with a hidden text and null progress (spectator)', () => {
    const parsed = raceSnapshotMessageSchema.safeParse({
      type: 'raceSnapshot',
      roomPublicId: ROOM_PUBLIC_ID,
      phase: 'decompte',
      startedAt: '2026-11-08T18:00:00.000Z',
      startAt: '2026-11-08T18:00:03.000Z',
      textId: null,
      text: null,
      totalLength: null,
      progress: null,
    });

    expect(parsed.success).toBe(true);
  });

  test('rejects a raceSnapshot with an unknown phase or a fractional counter', () => {
    const base = {
      type: 'raceSnapshot',
      roomPublicId: ROOM_PUBLIC_ID,
      phase: 'en_course',
      startedAt: null,
      startAt: null,
      textId: null,
      text: null,
      totalLength: null,
      progress: null,
    };
    expect(raceSnapshotMessageSchema.safeParse({ ...base, phase: 'fermee' }).success).toBe(false);
    expect(
      raceSnapshotMessageSchema.safeParse({
        ...base,
        progress: { validatedChars: 1.2, correctKeystrokes: 2, totalKeystrokes: 3 },
      }).success,
    ).toBe(false);
  });

  test('the inferred server type stays a discriminated union', () => {
    const message: ServerMessage = { type: 'pong' };
    expect(message.type).toBe('pong');
  });
});

describe('error codes', () => {
  test('the code set is exactly the contract of the protocol', () => {
    expect(WS_ERROR_CODES).toEqual([
      'room_not_found',
      'room_full',
      'already_in_room',
      'kicked',
      'invalid_input',
      'private_room',
      'rate_limited',
      'not_host',
      'race_already_running',
      'not_in_race',
      'invalid_progress',
      'progress_rate_exceeded',
      'race_not_running',
    ]);
  });

  test('accepts an error with every documented code, with or without a message', () => {
    for (const code of WS_ERROR_CODES) {
      expect(serverMessageSchema.safeParse({ type: 'error', code }).success).toBe(true);
      expect(
        serverMessageSchema.safeParse({ type: 'error', code, message: 'detail' }).success,
      ).toBe(true);
    }
  });

  test('rejects unknown codes and non-string codes', () => {
    expect(serverMessageSchema.safeParse({ type: 'error', code: 'room_lost' }).success).toBe(
      false,
    );
    expect(serverMessageSchema.safeParse({ type: 'error', code: 42 }).success).toBe(false);
  });

  test('rejects an error message longer than the cap', () => {
    const parsed = errorMessageSchema.safeParse({
      type: 'error',
      code: 'invalid_input',
      message: 'x'.repeat(301),
    });

    expect(parsed.success).toBe(false);
  });
});
