/**
 * @jest-environment node
 *
 * Unit tests for the client hook's pure logic (GAME-4 groundwork, COURSE-08):
 * reconnect backoff, ws URL building, server-frame validation, the race
 * message reducer and the mid-race resume helper. The hook itself wires these
 * functions to React/WebSocket, exercised by the jsdom suite in
 * `useRoomSocket.hook.test.tsx` and the live smoke test.
 */

import { defaultRoomConfig } from '../lib/room-config';
import {
  isFatalErrorCode,
  type RaceSocketState,
} from './client-types';
import {
  applyServerMessage,
  buildWsUrl,
  computeReconnectDelay,
  markParticipantFinished,
  memberIdentity,
  parseServerMessage,
  shouldReconnect,
  wantsRaceResume,
} from './useRoomSocket';

const ROOM_PUBLIC_ID = '8f9c2a55-3b4a-4c1e-8a2d-9e7f6a5b4c3d';
const ADA_ID = '1f2e3d4c-5b6a-4978-8c9d-0e1f2a3b4c5d';
const BOB_ID = '2f3e4d5c-6b7a-4987-9c0d-1e2f3a4b5c6d';
const GUEST_TOKEN = '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d';
const JOINED_AT = '2026-11-07T21:00:00.000Z';

const snapshotState: RaceSocketState = {
  status: 'open',
  snapshot: {
    room: {
      publicId: ROOM_PUBLIC_ID,
      code: 'DWRF42',
      visibility: 'public',
      status: 'en_attente',
      capacity: 10,
      config: defaultRoomConfig,
      host: { publicId: ADA_ID, username: 'ada' },
      createdAt: '2026-11-07T20:00:00.000Z',
    },
    members: [
      {
        kind: 'user',
        publicId: ADA_ID,
        username: 'ada',
        pfpUrl: null,
        role: 'participant',
        joinedAt: JOINED_AT,
        connected: true,
      },
    ],
  },
  error: null,
  race: null,
};

describe('computeReconnectDelay', () => {
  test('grows exponentially and caps at maxMs', () => {
    expect(computeReconnectDelay(0, { baseMs: 1000, maxMs: 8000, jitter: 0 })).toBe(1000);
    expect(computeReconnectDelay(1, { baseMs: 1000, maxMs: 8000, jitter: 0 })).toBe(2000);
    expect(computeReconnectDelay(2, { baseMs: 1000, maxMs: 8000, jitter: 0 })).toBe(4000);
    expect(computeReconnectDelay(3, { baseMs: 1000, maxMs: 8000, jitter: 0 })).toBe(8000);
    expect(computeReconnectDelay(20, { baseMs: 1000, maxMs: 8000, jitter: 0 })).toBe(8000);
  });

  test('applies bounded jitter', () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const delay = computeReconnectDelay(attempt, { baseMs: 1000, maxMs: 8000, jitter: 0.3 });
      const expected = Math.min(8000, 1000 * 2 ** attempt);
      expect(delay).toBeGreaterThanOrEqual(Math.round(expected * 0.7));
      expect(delay).toBeLessThanOrEqual(Math.round(expected * 1.3));
    }
  });
});

describe('buildWsUrl', () => {
  test('derives the same-origin ws URL from the page location', () => {
    expect(buildWsUrl({ protocol: 'http:', host: 'localhost:3000' }, undefined)).toBe(
      'ws://localhost:3000/ws',
    );
    expect(buildWsUrl({ protocol: 'https:', host: 'race.example.com' }, undefined)).toBe(
      'wss://race.example.com/ws',
    );
  });

  test('honours the NEXT_PUBLIC_WS_URL override', () => {
    expect(
      buildWsUrl({ protocol: 'https:', host: 'race.example.com' }, 'wss://ws.example.com:3001/ws'),
    ).toBe('wss://ws.example.com:3001/ws');
  });
});

describe('parseServerMessage (never trust raw server data)', () => {
  test('accepts protocol-valid messages', () => {
    expect(parseServerMessage({ type: 'pong' })).toEqual({ type: 'pong' });
    expect(parseServerMessage({ type: 'roomSnapshot', room: snapshotState.snapshot!.room, members: [] }))
      .not.toBeNull();
  });

  test('rejects malformed frames before they can reach state', () => {
    expect(parseServerMessage(null)).toBeNull();
    expect(parseServerMessage({ type: 'pong', extra: 1 })).toBeNull();
    expect(parseServerMessage({ type: 'unknownType' })).toBeNull();
    expect(
      parseServerMessage({
        type: 'roomSnapshot',
        room: { ...snapshotState.snapshot!.room, config: { wordCount: -5 } },
        members: [],
      }),
    ).toBeNull();
  });
});

describe('applyServerMessage', () => {
  test('roomSnapshot replaces the state and opens it', () => {
    const next = applyServerMessage(
      { status: 'connecting', snapshot: null, error: null, race: null },
      {
        type: 'roomSnapshot',
        room: snapshotState.snapshot!.room,
        members: snapshotState.snapshot!.members,
      },
    );

    expect(next.status).toBe('open');
    expect(next.snapshot?.room.code).toBe('DWRF42');
    expect(next.snapshot?.members).toHaveLength(1);
  });

  test('memberJoined adds or replaces the member by identity', () => {
    const guest = {
      kind: 'guest' as const,
      guestToken: GUEST_TOKEN,
      nickname: 'Gimli',
      role: 'participant' as const,
      joinedAt: JOINED_AT,
      connected: true,
    };
    const joined = applyServerMessage(snapshotState, {
      type: 'memberJoined',
      roomPublicId: ROOM_PUBLIC_ID,
      member: guest,
    });
    expect(joined.snapshot?.members).toHaveLength(2);

    // The same member joining again replaces, never duplicates.
    const replayed = applyServerMessage(joined, {
      type: 'memberJoined',
      roomPublicId: ROOM_PUBLIC_ID,
      member: { ...guest, nickname: 'Gimli2' },
    });
    expect(replayed.snapshot?.members).toHaveLength(2);
    const guestMember = replayed.snapshot?.members.find((m) => m.kind === 'guest');
    expect(guestMember?.nickname).toBe('Gimli2');
  });

  test('memberLeft and memberKicked remove the member by identity', () => {
    const stateWithGuest = applyServerMessage(snapshotState, {
      type: 'memberJoined',
      roomPublicId: ROOM_PUBLIC_ID,
      member: {
        kind: 'guest',
        guestToken: GUEST_TOKEN,
        nickname: 'Gimli',
        role: 'participant',
        joinedAt: JOINED_AT,
        connected: true,
      },
    });

    const left = applyServerMessage(stateWithGuest, {
      type: 'memberLeft',
      roomPublicId: ROOM_PUBLIC_ID,
      member: {
        kind: 'guest',
        guestToken: GUEST_TOKEN,
        nickname: 'Gimli',
        role: 'participant',
        joinedAt: JOINED_AT,
        connected: false,
      },
    });
    expect(left.snapshot?.members).toHaveLength(1);
  });

  test('hostChanged and configUpdated update the snapshot in place', () => {
    const hostChanged = applyServerMessage(snapshotState, {
      type: 'hostChanged',
      roomPublicId: ROOM_PUBLIC_ID,
      host: { publicId: BOB_ID, username: 'bob' },
    });
    expect(hostChanged.snapshot?.room.host.username).toBe('bob');

    const configUpdated = applyServerMessage(snapshotState, {
      type: 'configUpdated',
      roomPublicId: ROOM_PUBLIC_ID,
      config: { ...defaultRoomConfig, wordCount: 120 },
    });
    expect(configUpdated.snapshot?.room.config.wordCount).toBe(120);
  });

  test('roomClosed clears the state', () => {
    const next = applyServerMessage(snapshotState, {
      type: 'roomClosed',
      roomPublicId: ROOM_PUBLIC_ID,
    });
    expect(next.status).toBe('closed');
    expect(next.snapshot).toBeNull();
  });

  test('shouldReconnect refuses closed and fatally rejected states', () => {
    const closed = applyServerMessage(snapshotState, {
      type: 'roomClosed',
      roomPublicId: ROOM_PUBLIC_ID,
    });
    expect(shouldReconnect(closed)).toBe(false);

    const kicked = applyServerMessage(snapshotState, { type: 'error', code: 'kicked' });
    expect(shouldReconnect(kicked)).toBe(false);

    expect(shouldReconnect({ status: 'open', snapshot: null, error: null, race: null })).toBe(true);
    expect(
      shouldReconnect({
        status: 'reconnecting',
        snapshot: null,
        error: { message: 'invalid frame', fatal: false },
        race: null,
      }),
    ).toBe(true);
  });

  test('error sets the fatal flag from the code', () => {
    const kicked = applyServerMessage(snapshotState, { type: 'error', code: 'kicked' });
    expect(kicked.error?.fatal).toBe(true);

    const transient = applyServerMessage(snapshotState, { type: 'error', code: 'rate_limited' });
    expect(transient.error?.fatal).toBe(true);

    const invalid = applyServerMessage(snapshotState, { type: 'error', code: 'invalid_input' });
    expect(invalid.error?.fatal).toBe(true);
  });

  test('pong leaves the state untouched', () => {
    expect(applyServerMessage(snapshotState, { type: 'pong' })).toEqual(snapshotState);
  });
});

describe('race messages reducer (GAME-1 groundwork, COURSE-08)', () => {
  const TEXT = 'Les nains creusent trop profond.';

  test('countdownStarted builds the race view and reveals the text', () => {
    const next = applyServerMessage(snapshotState, {
      type: 'countdownStarted',
      roomPublicId: ROOM_PUBLIC_ID,
      startAt: '2026-11-08T18:00:03.000Z',
      textId: '12',
      text: TEXT,
      totalLength: TEXT.length,
    });

    expect(next.race?.phase).toBe('decompte');
    expect(next.race?.text).toBe(TEXT);
    expect(next.race?.totalLength).toBe(TEXT.length);
    expect(next.race?.ownProgress).toEqual({
      validatedChars: 0,
      correctKeystrokes: 0,
      totalKeystrokes: 0,
    });
  });

  test('raceStarted flips the phase and raceTick applies the aggregated track', () => {
    const counting = applyServerMessage(snapshotState, {
      type: 'countdownStarted',
      roomPublicId: ROOM_PUBLIC_ID,
      startAt: '2026-11-08T18:00:03.000Z',
      textId: null,
      text: TEXT,
      totalLength: TEXT.length,
    });
    const started = applyServerMessage(counting, {
      type: 'raceStarted',
      roomPublicId: ROOM_PUBLIC_ID,
      startAt: '2026-11-08T18:00:03.000Z',
    });
    expect(started.race?.phase).toBe('en_course');

    const ticked = applyServerMessage(started, {
      type: 'raceTick',
      roomPublicId: ROOM_PUBLIC_ID,
      tickAt: '2026-11-08T18:00:06.000Z',
      participants: [
        {
          participantId: ADA_ID,
          kind: 'user',
          displayName: 'ada',
          position: 12,
          wpm: 40,
          finished: false,
        },
      ],
    });
    expect(ticked.race?.participants[0].position).toBe(12);
    expect(ticked.race?.lastTickAt).toBe('2026-11-08T18:00:06.000Z');
  });

  test('participantFinished records the rank and marks the track, participantQuit marks it too', () => {
    const withTrack = applyServerMessage(snapshotState, {
      type: 'raceTick',
      roomPublicId: ROOM_PUBLIC_ID,
      tickAt: '2026-11-08T18:00:06.000Z',
      participants: [
        {
          participantId: BOB_ID,
          kind: 'user',
          displayName: 'bob',
          position: 5,
          wpm: 10,
          finished: false,
        },
      ],
    });
    expect(withTrack.race).toBeNull(); // no race yet: tick without a race is ignored

    const racing = applyServerMessage(snapshotState, {
      type: 'countdownStarted',
      roomPublicId: ROOM_PUBLIC_ID,
      startAt: '2026-11-08T18:00:03.000Z',
      textId: null,
      text: TEXT,
      totalLength: TEXT.length,
    });
    const ticked = applyServerMessage(racing, {
      type: 'raceTick',
      roomPublicId: ROOM_PUBLIC_ID,
      tickAt: '2026-11-08T18:00:06.000Z',
      participants: [
        {
          participantId: BOB_ID,
          kind: 'user',
          displayName: 'bob',
          position: 5,
          wpm: 10,
          finished: false,
        },
      ],
    });
    const finished = applyServerMessage(ticked, {
      type: 'participantFinished',
      roomPublicId: ROOM_PUBLIC_ID,
      participantId: BOB_ID,
      rank: 1,
    });
    expect(finished.race?.finishRanks[BOB_ID]).toBe(1);
    expect(finished.race?.participants[0].finished).toBe(true);

    const quit = applyServerMessage(ticked, {
      type: 'participantQuit',
      roomPublicId: ROOM_PUBLIC_ID,
      participantId: BOB_ID,
    });
    expect(quit.race?.participants[0].finished).toBe(true);
    expect(quit.race?.finishRanks).toEqual({});
  });

  test('raceFinished stores the standings and flips to resultats', () => {
    const racing = applyServerMessage(snapshotState, {
      type: 'countdownStarted',
      roomPublicId: ROOM_PUBLIC_ID,
      startAt: '2026-11-08T18:00:03.000Z',
      textId: null,
      text: TEXT,
      totalLength: TEXT.length,
    });
    const next = applyServerMessage(racing, {
      type: 'raceFinished',
      roomPublicId: ROOM_PUBLIC_ID,
      durationMs: 45_321,
      results: [
        {
          participantId: ADA_ID,
          displayName: 'ada',
          kind: 'user',
          wpm: 60,
          rawWpm: 66,
          accuracy: 95,
          errors: 4,
          status: 'finished',
          finishedAtMs: 41_000,
          rank: 1,
          wpmSeries: [{ elapsedMs: 41_000, wpm: 60 }],
        },
      ],
    });
    expect(next.race?.phase).toBe('resultats');
    expect(next.race?.finished?.durationMs).toBe(45_321);
    expect(next.race?.finished?.results[0].rank).toBe(1);
    expect(next.race?.finished?.results[0].wpmSeries).toEqual([{ elapsedMs: 41_000, wpm: 60 }]);
  });

  test('a replayed raceFinished builds the results view for a late joiner (COURSE-11)', () => {
    // A late joiner has no race view: the fresh roomSnapshot reset it, then
    // the server re-broadcast the last finished race to this connection.
    const replayed = applyServerMessage(snapshotState, {
      type: 'raceFinished',
      roomPublicId: ROOM_PUBLIC_ID,
      durationMs: 45_321,
      results: [
        {
          participantId: ADA_ID,
          displayName: 'ada',
          kind: 'user',
          wpm: 60,
          rawWpm: 66,
          accuracy: 95,
          errors: 4,
          status: 'finished',
          finishedAtMs: 41_000,
          rank: 1,
          wpmSeries: [{ elapsedMs: 41_000, wpm: 60 }],
        },
      ],
    });

    expect(replayed.race?.phase).toBe('resultats');
    expect(replayed.race?.finished?.durationMs).toBe(45_321);
    expect(replayed.race?.finished?.results).toHaveLength(1);
  });

  test('raceAborted clears the race and puts the room back to en_attente', () => {
    const midRace: RaceSocketState = {
      ...snapshotState,
      snapshot: {
        ...snapshotState.snapshot!,
        room: { ...snapshotState.snapshot!.room, status: 'en_course' },
      },
      race: {
        phase: 'en_course',
        startedAt: null,
        startAt: '2026-11-08T18:00:03.000Z',
        textId: null,
        text: TEXT,
        totalLength: TEXT.length,
        ownProgress: { validatedChars: 0, correctKeystrokes: 0, totalKeystrokes: 0 },
        participants: [],
        lastTickAt: null,
        finishRanks: {},
        finished: null,
      },
    };
    const aborted = applyServerMessage(midRace, {
      type: 'raceAborted',
      roomPublicId: ROOM_PUBLIC_ID,
      reason: 'afk_timeout',
    });
    expect(aborted.race).toBeNull();
    expect(aborted.snapshot?.room.status).toBe('en_attente');
  });

  test('raceSnapshot resumes the race view with phase, text and own counters', () => {
    const next = applyServerMessage(snapshotState, {
      type: 'raceSnapshot',
      roomPublicId: ROOM_PUBLIC_ID,
      phase: 'en_course',
      startedAt: '2026-11-08T18:00:00.000Z',
      startAt: '2026-11-08T18:00:03.000Z',
      textId: '12',
      text: TEXT,
      totalLength: TEXT.length,
      progress: { validatedChars: 8, correctKeystrokes: 9, totalKeystrokes: 10 },
    });
    expect(next.race?.phase).toBe('en_course');
    expect(next.race?.text).toBe(TEXT);
    expect(next.race?.ownProgress).toEqual({
      validatedChars: 8,
      correctKeystrokes: 9,
      totalKeystrokes: 10,
    });
  });

  test('roomSnapshot resets any local race view (authoritative re-join)', () => {
    const racing = applyServerMessage(snapshotState, {
      type: 'countdownStarted',
      roomPublicId: ROOM_PUBLIC_ID,
      startAt: '2026-11-08T18:00:03.000Z',
      textId: null,
      text: TEXT,
      totalLength: TEXT.length,
    });
    const rejoined = applyServerMessage(racing, {
      type: 'roomSnapshot',
      room: snapshotState.snapshot!.room,
      members: snapshotState.snapshot!.members,
    });
    expect(rejoined.race).toBeNull();
  });
});

describe('race resume helpers', () => {
  test('wantsRaceResume is true exactly for decompte and en_course', () => {
    expect(wantsRaceResume('decompte')).toBe(true);
    expect(wantsRaceResume('en_course')).toBe(true);
    expect(wantsRaceResume('en_attente')).toBe(false);
    expect(wantsRaceResume('resultats')).toBe(false);
    expect(wantsRaceResume('fermee')).toBe(false);
  });

  test('markParticipantFinished flips only the target participant', () => {
    const participants = [
      {
        participantId: ADA_ID,
        kind: 'user' as const,
        displayName: 'ada',
        position: 4,
        wpm: 5,
        finished: false,
      },
      {
        participantId: BOB_ID,
        kind: 'user' as const,
        displayName: 'bob',
        position: 8,
        wpm: 9,
        finished: false,
      },
    ];
    const marked = markParticipantFinished(participants, BOB_ID);
    expect(marked[0].finished).toBe(false);
    expect(marked[1].finished).toBe(true);
    // Immutability: the original list is untouched.
    expect(participants[1].finished).toBe(false);
    expect(marked).not.toBe(participants);
  });
});

describe('isFatalErrorCode', () => {
  test('classifies terminal join errors', () => {
    for (const code of [
      'kicked',
      'room_not_found',
      'room_full',
      'rate_limited',
      'invalid_input',
      'private_room',
      'already_in_room',
    ] as const) {
      expect(isFatalErrorCode(code)).toBe(true);
    }
  });
});

describe('memberIdentity', () => {
  test('is stable across presence messages', () => {
    expect(memberIdentity({ kind: 'user', publicId: ADA_ID })).toBe(`user:${ADA_ID}`);
    expect(memberIdentity({ kind: 'guest', guestToken: GUEST_TOKEN })).toBe(
      `guest:${GUEST_TOKEN}`,
    );
  });
});
