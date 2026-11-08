/**
 * @jest-environment node
 *
 * Unit tests for the authoritative in-memory race engine (COURSE-05/06/07/08/
 * 09/10, GAME-4/5, PERF-02, SEC-01). The clock, the room loader, the text
 * picker, the status persistence and the broadcast sink are all fakes, so
 * every lifecycle step — start, countdown, race, ticks, finish, ranking — is
 * driven deterministically by advancing the clock and calling `tick()`.
 */

import { defaultRoomConfig } from '../lib/room-config';
import type { RoomConfig } from '../db/schema';
import type { RaceText } from '../lib/race/state';
import type { ServerMessage } from './protocol';
import {
  RaceEngine,
  RACE_AFK_TIMEOUT_MS,
  RACE_PROGRESS_MAX_DELTA,
  RACE_PROGRESS_MAX_PER_SECOND,
  RACE_RECONNECT_WINDOW_MS,
  RACE_TICK_BROADCAST_INTERVAL_MS,
  type RaceEngineDeps,
  type RaceEngineMember,
  type RaceEngineProgress,
  type RaceEngineRoomData,
  type RaceResultsPayload,
} from './race-engine';

const ROOM_ID = 42;
const ROOM_PUBLIC_ID = '8f9c2a55-3b4a-4c1e-8a2d-9e7f6a5b4c3d';
const ADA_PUBLIC_ID = '1f2e3d4c-5b6a-4978-8c9d-0e1f2a3b4c5d';
const BOB_PUBLIC_ID = '2f3e4d5c-6b7a-4987-9c0d-1e2f3a4b5c6d';
const GUEST_TOKEN = '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d';
const SPEC_PUBLIC_ID = '3a4b5c6d-7e8f-4a9b-8c0d-1e2f3a4b5c6d';

const START_MS = Date.UTC(2026, 10, 8, 18, 0, 0);

const DEFAULT_BODY = 'the quick brown fox jumps over the lazy dog';
const LONG_BODY = Array.from({ length: 40 }, (_, index) => `mot${index}`).join(' ');

function member(overrides: Partial<RaceEngineMember> & { memberId: number }): RaceEngineMember {
  return {
    role: 'participant',
    userId: null,
    guestToken: null,
    publicId: BOB_PUBLIC_ID,
    displayName: 'bob',
    hubKey: 'user:8',
    ...overrides,
  };
}

/** Host (user 7), racer user 8, racer guest, and a spectator. */
function roomData(
  config: RoomConfig = { ...defaultRoomConfig, timeLimitSeconds: null },
): RaceEngineRoomData {
  return {
    publicId: ROOM_PUBLIC_ID,
    config,
    hostUserId: 7,
    members: [
      member({
        memberId: 1,
        userId: 7,
        publicId: ADA_PUBLIC_ID,
        displayName: 'ada',
        hubKey: 'user:7',
      }),
      member({
        memberId: 2,
        userId: 8,
        publicId: BOB_PUBLIC_ID,
        displayName: 'bob',
        hubKey: 'user:8',
      }),
      member({
        memberId: 3,
        guestToken: GUEST_TOKEN,
        publicId: GUEST_TOKEN,
        displayName: 'Gimli',
        hubKey: `guest:${GUEST_TOKEN}`,
      }),
      member({
        memberId: 4,
        role: 'spectator',
        userId: 9,
        publicId: SPEC_PUBLIC_ID,
        displayName: 'watcher',
        hubKey: 'user:9',
      }),
    ],
  };
}

class FakeClock {
  nowMs = START_MS;
  now(): Date {
    return new Date(this.nowMs);
  }
  advance(ms: number): void {
    this.nowMs += ms;
  }
}

class FakeDeps implements RaceEngineDeps {
  readonly clock = new FakeClock();
  room: RaceEngineRoomData | null = roomData();
  textBody = DEFAULT_BODY;
  textId: string | null = null;
  nextSeed = 42;
  pickedSeeds: number[] = [];
  persisted: Array<{ roomId: number; status: string }> = [];
  broadcasts = new Map<number, ServerMessage[]>();
  persistError: Error | null = null;

  now(): Date {
    return this.clock.now();
  }

  async loadRoom(roomId: number): Promise<RaceEngineRoomData | null> {
    return roomId === ROOM_ID ? this.room : null;
  }

  async pickText(config: RoomConfig, seed: number): Promise<RaceText | null> {
    this.pickedSeeds.push(seed);
    return {
      id: this.textId,
      body: this.textBody,
      language: config.textLanguage,
      complexity: config.textComplexity,
      wordCount: this.textBody.split(' ').length,
    };
  }

  async persistStatus(roomId: number, status: 'en_attente' | 'decompte' | 'en_course' | 'resultats' | 'fermee'): Promise<void> {
    if (this.persistError) {
      throw this.persistError;
    }
    this.persisted.push({ roomId, status });
  }

  broadcast(roomId: number, message: ServerMessage): void {
    const list = this.broadcasts.get(roomId) ?? [];
    list.push(message);
    this.broadcasts.set(roomId, list);
  }

  randomSeed(): number {
    const seed = this.nextSeed;
    this.nextSeed += 1;
    return seed;
  }

  messagesOf<T extends ServerMessage['type']>(roomId: number, type: T): Array<ServerMessage & { type: T }> {
    return (this.broadcasts.get(roomId) ?? []).filter((m): m is ServerMessage & { type: T } => m.type === type);
  }

  lastPersisted(): { roomId: number; status: string } | null {
    return this.persisted[this.persisted.length - 1] ?? null;
  }
}

function makeEngine(): { engine: RaceEngine; deps: FakeDeps } {
  const deps = new FakeDeps();
  return { engine: new RaceEngine(deps), deps };
}

async function startAndCountdown(engine: RaceEngine, deps: FakeDeps): Promise<void> {
  const started = await engine.startRace(ROOM_ID, 'user:7');
  expect(started.ok).toBe(true);
  deps.clock.advance(3_000);
  engine.tick();
}

function progress(validatedChars: number, overrides: Partial<RaceEngineProgress> = {}): RaceEngineProgress {
  return { validatedChars, correctKeystrokes: validatedChars, totalKeystrokes: validatedChars, ...overrides };
}

describe('startRace (SEC-01, COURSE-02/03)', () => {
  test('only the host may start; the race then broadcasts countdownStarted with the full text', async () => {
    const { engine, deps } = makeEngine();

    const guest = await engine.startRace(ROOM_ID, `guest:${GUEST_TOKEN}`);
    expect(guest).toEqual({ ok: false, code: 'not_host' });
    const otherUser = await engine.startRace(ROOM_ID, 'user:8');
    expect(otherUser).toEqual({ ok: false, code: 'not_host' });

    const started = await engine.startRace(ROOM_ID, 'user:7');
    expect(started).toEqual({ ok: true });
    expect(engine.getPhase(ROOM_ID)).toBe('decompte');
    expect(deps.lastPersisted()).toEqual({ roomId: ROOM_ID, status: 'decompte' });

    const countdowns = deps.messagesOf(ROOM_ID, 'countdownStarted');
    expect(countdowns).toHaveLength(1);
    expect(countdowns[0].text).toBe(DEFAULT_BODY);
    expect(countdowns[0].totalLength).toBe(DEFAULT_BODY.length);
    expect(countdowns[0].startAt).toBe(new Date(START_MS + 3_000).toISOString());
    expect(countdowns[0].roomPublicId).toBe(ROOM_PUBLIC_ID);
  });

  test('a second start while running is rejected (double start)', async () => {
    const { engine } = makeEngine();
    expect((await engine.startRace(ROOM_ID, 'user:7')).ok).toBe(true);
    expect(await engine.startRace(ROOM_ID, 'user:7')).toEqual({
      ok: false,
      code: 'race_already_running',
    });
  });

  test('an unknown room and a missing text are reported', async () => {
    const { engine, deps } = makeEngine();
    deps.room = null;
    expect(await engine.startRace(999, 'user:7')).toEqual({ ok: false, code: 'room_not_found' });

    const missingText = makeEngine();
    missingText.deps.textBody = '';
    expect(await missingText.engine.startRace(ROOM_ID, 'user:7')).toMatchObject({
      ok: false,
      code: 'race_not_running',
    });
  });

  test('the random-mode seed is recorded and passed to the picker', async () => {
    const { engine, deps } = makeEngine();
    deps.room = roomData({ ...defaultRoomConfig, timeLimitSeconds: null, textType: 'random' });
    await engine.startRace(ROOM_ID, 'user:7');
    expect(deps.pickedSeeds).toEqual([42]);
  });

  test('starting with fewer than 2 racers or no human is rejected', async () => {
    const { engine, deps } = makeEngine();
    deps.room = roomData();
    deps.room.members = [deps.room.members[0], deps.room.members[3]]; // host + spectator only
    expect(await engine.startRace(ROOM_ID, 'user:7')).toMatchObject({
      ok: false,
      code: 'race_not_running',
    });
  });

  test('spectators are excluded from the race (COURSE-02)', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);
    expect(engine.getPhase(ROOM_ID)).toBe('en_course');
    const started = deps.messagesOf(ROOM_ID, 'raceStarted');
    expect(started).toHaveLength(1);

    deps.clock.advance(RACE_TICK_BROADCAST_INTERVAL_MS);
    engine.tick();
    const tick = deps.messagesOf(ROOM_ID, 'raceTick')[0];
    expect(tick.participants.map((p) => p.participantId)).toEqual([
      ADA_PUBLIC_ID,
      BOB_PUBLIC_ID,
      GUEST_TOKEN,
    ]);
  });
});

describe('countdown → race transition (COURSE-03)', () => {
  test('advance flips to en_course exactly at startAt and broadcasts raceStarted', async () => {
    const { engine, deps } = makeEngine();
    await engine.startRace(ROOM_ID, 'user:7');

    deps.clock.advance(2_999);
    engine.tick();
    expect(engine.getPhase(ROOM_ID)).toBe('decompte');
    expect(deps.messagesOf(ROOM_ID, 'raceStarted')).toHaveLength(0);

    deps.clock.advance(1);
    engine.tick();
    expect(engine.getPhase(ROOM_ID)).toBe('en_course');
    const started = deps.messagesOf(ROOM_ID, 'raceStarted');
    expect(started).toHaveLength(1);
    expect(started[0].startAt).toBe(new Date(START_MS + 3_000).toISOString());
    expect(deps.lastPersisted()).toEqual({ roomId: ROOM_ID, status: 'en_course' });
  });

  test('raceTicks are aggregated to at most one per RACE_TICK_BROADCAST_INTERVAL_MS (PERF-02)', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);

    for (let step = 0; step < 4; step += 1) {
      deps.clock.advance(RACE_TICK_BROADCAST_INTERVAL_MS);
      engine.tick();
    }
    expect(deps.messagesOf(ROOM_ID, 'raceTick')).toHaveLength(4);

    // A tick without a crossed interval boundary broadcasts nothing.
    engine.tick();
    expect(deps.messagesOf(ROOM_ID, 'raceTick')).toHaveLength(4);
  });
});

describe('handleRaceProgress (COURSE-06, PERF-02)', () => {
  test('accepts cumulative progress and updates the track tick positions and wpm', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);

    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(4))).toEqual({ ok: true });
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(10))).toEqual({ ok: true });

    deps.clock.advance(RACE_TICK_BROADCAST_INTERVAL_MS);
    engine.tick();
    const tick = deps.messagesOf(ROOM_ID, 'raceTick')[0];
    const bob = tick.participants.find((p) => p.participantId === BOB_PUBLIC_ID);
    expect(bob?.position).toBe(10);
    expect(bob?.wpm).toBeGreaterThan(0);
    expect(bob?.finished).toBe(false);
  });

  test('rejects progress outside the race and from non-participants', async () => {
    const { engine, deps } = makeEngine();
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(1))).toEqual({
      ok: false,
      code: 'race_not_running',
    });

    await startAndCountdown(engine, deps);
    expect(engine.handleRaceProgress(ROOM_ID, 'user:999', progress(1))).toEqual({
      ok: false,
      code: 'not_in_race',
    });
    expect(engine.handleRaceProgress(ROOM_ID, 'user:9', progress(1))).toEqual({
      ok: false,
      code: 'not_in_race', // spectators do not race
    });
  });

  test('rejects non-monotonic counters (validated, correct, total)', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(10))).toEqual({ ok: true });

    expect(
      engine.handleRaceProgress(ROOM_ID, 'user:8', progress(9)),
    ).toEqual({ ok: false, code: 'invalid_progress' });
    expect(
      engine.handleRaceProgress(ROOM_ID, 'user:8', progress(11, { correctKeystrokes: 9 })),
    ).toEqual({ ok: false, code: 'invalid_progress' });
    expect(
      engine.handleRaceProgress(ROOM_ID, 'user:8', progress(11, { totalKeystrokes: 9 })),
    ).toEqual({ ok: false, code: 'invalid_progress' });
  });

  test('rejects counters beyond the text length and keystroke inconsistencies', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);
    const totalLength = DEFAULT_BODY.length;

    expect(
      engine.handleRaceProgress(ROOM_ID, 'user:8', progress(totalLength + 1)),
    ).toEqual({ ok: false, code: 'invalid_progress' });
    expect(
      engine.handleRaceProgress(ROOM_ID, 'user:8', progress(5, { correctKeystrokes: 6 })),
    ).toEqual({ ok: false, code: 'invalid_progress' }); // correct > total
    expect(
      engine.handleRaceProgress(ROOM_ID, 'user:8', progress(5, { totalKeystrokes: 4 })),
    ).toEqual({ ok: false, code: 'invalid_progress' }); // validated > typed
  });

  test('rejects a validatedChars jump larger than RACE_PROGRESS_MAX_DELTA', async () => {
    const { engine, deps } = makeEngine();
    deps.textBody = LONG_BODY; // long enough that the jump, not the length, is the violation
    await startAndCountdown(engine, deps);

    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(0))).toEqual({ ok: true });
    expect(
      engine.handleRaceProgress(ROOM_ID, 'user:8', progress(RACE_PROGRESS_MAX_DELTA + 1)),
    ).toEqual({ ok: false, code: 'invalid_progress' });
    expect(
      engine.handleRaceProgress(ROOM_ID, 'user:8', progress(RACE_PROGRESS_MAX_DELTA)),
    ).toEqual({ ok: true });
  });

  test('caps the per-participant message rate at RACE_PROGRESS_MAX_PER_SECOND per second', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);

    for (let index = 0; index < RACE_PROGRESS_MAX_PER_SECOND; index += 1) {
      expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(index + 1))).toEqual({
        ok: true,
      });
    }
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(RACE_PROGRESS_MAX_PER_SECOND + 1))).toEqual({
      ok: false,
      code: 'progress_rate_exceeded',
    });

    // The window slides: one second later a new message is accepted again.
    deps.clock.advance(1_000);
    expect(
      engine.handleRaceProgress(ROOM_ID, 'user:8', progress(RACE_PROGRESS_MAX_PER_SECOND + 2)),
    ).toEqual({ ok: true });
  });

  test('reaching totalLength auto-finishes with the provisional rank (COURSE-06)', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);
    const totalLength = DEFAULT_BODY.length;

    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(totalLength))).toEqual({
      ok: true,
    });
    const finished = deps.messagesOf(ROOM_ID, 'participantFinished');
    expect(finished).toHaveLength(1);
    expect(finished[0].participantId).toBe(BOB_PUBLIC_ID);
    expect(finished[0].rank).toBe(1);

    // The finisher is now a spectator of this race: further progress is rejected.
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(totalLength))).toEqual({
      ok: false,
      code: 'not_in_race',
    });
  });
});

describe('quitRace (COURSE-07, RACE-6)', () => {
  test('quitting broadcasts participantQuit, is idempotent, and stays in the room as a spectator', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);

    expect(engine.quitRace(ROOM_ID, `guest:${GUEST_TOKEN}`)).toEqual({ ok: true });
    const quits = deps.messagesOf(ROOM_ID, 'participantQuit');
    expect(quits).toHaveLength(1);
    expect(quits[0].participantId).toBe(GUEST_TOKEN);

    expect(engine.quitRace(ROOM_ID, `guest:${GUEST_TOKEN}`)).toEqual({ ok: true });
    expect(deps.messagesOf(ROOM_ID, 'participantQuit')).toHaveLength(1);

    // The quitter no longer holds a race slot (the hub lets them leave normally).
    expect(engine.keepMembershipOnDisconnect(ROOM_ID, `guest:${GUEST_TOKEN}`)).toBe(false);
    // The race keeps running for the others.
    expect(engine.getPhase(ROOM_ID)).toBe('en_course');
  });

  test('quitting outside a race or by a non-participant is rejected', async () => {
    const { engine, deps } = makeEngine();
    expect(engine.quitRace(ROOM_ID, 'user:8')).toEqual({ ok: false, code: 'race_not_running' });
    await startAndCountdown(engine, deps);
    expect(engine.quitRace(ROOM_ID, 'user:9')).toEqual({ ok: false, code: 'not_in_race' });
  });
});

describe('reconnection (COURSE-08, GAME-4)', () => {
  test('a dropped mid-race socket keeps its slot and resumes within 30 s with its counters', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(12))).toEqual({ ok: true });

    expect(engine.keepMembershipOnDisconnect(ROOM_ID, 'user:8')).toBe(true);
    engine.notifyDisconnected(ROOM_ID, 'user:8');

    // Inside the window nothing happens.
    deps.clock.advance(RACE_RECONNECT_WINDOW_MS - 1);
    engine.tick();
    expect(deps.messagesOf(ROOM_ID, 'participantQuit')).toHaveLength(0);

    // Rejoining inside the window resumes with the stored counters.
    expect(engine.rejoinRace(ROOM_ID, 'user:8')).toEqual({ ok: true });
    const snapshot = engine.raceSnapshotFor(ROOM_ID, 'user:8');
    expect(snapshot?.phase).toBe('en_course');
    expect(snapshot?.text).toBe(DEFAULT_BODY);
    expect(snapshot?.progress).toEqual({ validatedChars: 12, correctKeystrokes: 12, totalKeystrokes: 12 });

    // Typing resumes (also refreshes the AFK clock).
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(15))).toEqual({ ok: true });

    deps.clock.advance(RACE_RECONNECT_WINDOW_MS + 5_000);
    engine.tick();
    expect(deps.messagesOf(ROOM_ID, 'participantQuit')).toHaveLength(0);

    // A fresh drop starts a fresh window.
    engine.notifyDisconnected(ROOM_ID, 'user:8');
    deps.clock.advance(RACE_RECONNECT_WINDOW_MS);
    engine.tick();
    const quits = deps.messagesOf(ROOM_ID, 'participantQuit');
    expect(quits).toHaveLength(1);
    expect(quits[0].participantId).toBe(BOB_PUBLIC_ID);
  });

  test('after the window the participant is recorded as quit and loses the kept slot', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);
    engine.notifyDisconnected(ROOM_ID, 'user:8');
    expect(engine.keepMembershipOnDisconnect(ROOM_ID, 'user:8')).toBe(true);

    deps.clock.advance(RACE_RECONNECT_WINDOW_MS);
    engine.tick();

    expect(deps.messagesOf(ROOM_ID, 'participantQuit')).toHaveLength(1);
    expect(engine.keepMembershipOnDisconnect(ROOM_ID, 'user:8')).toBe(false);
    // A late rejoin still answers ok (idempotent) and the member sees the race as a spectator.
    expect(engine.rejoinRace(ROOM_ID, 'user:8')).toEqual({ ok: true });
    expect(engine.raceSnapshotFor(ROOM_ID, 'user:8')?.progress).toBeNull();
  });

  test('membership slots outside a race follow the normal departure path', async () => {
    const { engine, deps } = makeEngine();
    expect(engine.keepMembershipOnDisconnect(ROOM_ID, 'user:8')).toBe(false);
    await startAndCountdown(engine, deps);
    expect(engine.keepMembershipOnDisconnect(ROOM_ID, 'user:9')).toBe(false); // spectator
  });
});

describe('race snapshot (COURSE-08 resume path)', () => {
  test('reveals the text from the countdown (COURSE-03) and returns null before any race', async () => {
    const { engine } = makeEngine();
    expect(engine.raceSnapshotFor(ROOM_ID, 'user:8')).toBeNull();

    await engine.startRace(ROOM_ID, 'user:7');
    const snapshot = engine.raceSnapshotFor(ROOM_ID, 'user:8');
    expect(snapshot?.phase).toBe('decompte');
    expect(snapshot?.text).toBe(DEFAULT_BODY);
    expect(snapshot?.totalLength).toBe(DEFAULT_BODY.length);
    expect(snapshot?.progress).toEqual({ validatedChars: 0, correctKeystrokes: 0, totalKeystrokes: 0 });

    const spectator = engine.raceSnapshotFor(ROOM_ID, 'user:9');
    expect(spectator?.phase).toBe('decompte');
    expect(spectator?.progress).toBeNull();
  });
});

describe('AFK abort (GAME-5)', () => {
  test('60 s without any accepted progress aborts the race: no ranking, back to en_attente', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);

    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(3))).toEqual({ ok: true });
    deps.clock.advance(RACE_AFK_TIMEOUT_MS - 1);
    engine.tick();
    expect(deps.messagesOf(ROOM_ID, 'raceAborted')).toHaveLength(0);

    deps.clock.advance(1);
    engine.tick();
    const aborted = deps.messagesOf(ROOM_ID, 'raceAborted');
    expect(aborted).toHaveLength(1);
    expect(aborted[0].reason).toBe('afk_timeout');
    expect(deps.messagesOf(ROOM_ID, 'raceFinished')).toHaveLength(0);
    expect(engine.getPhase(ROOM_ID)).toBe('en_attente');
    expect(deps.lastPersisted()).toEqual({ roomId: ROOM_ID, status: 'en_attente' });
    expect(engine.takeResults(ROOM_ID)).toBeNull();

    // The room can start again after the abort.
    expect(await engine.startRace(ROOM_ID, 'user:7')).toEqual({ ok: true });
    expect(engine.getPhase(ROOM_ID)).toBe('decompte');
  });

  test('fresh progress keeps the race alive', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);
    deps.clock.advance(RACE_AFK_TIMEOUT_MS - 1);
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(2))).toEqual({ ok: true });
    deps.clock.advance(RACE_AFK_TIMEOUT_MS - 1);
    engine.tick();
    expect(deps.messagesOf(ROOM_ID, 'raceAborted')).toHaveLength(0);
  });
});

describe('finish and ranking (COURSE-09/10)', () => {
  test('full lifecycle: finish, quit and timeout rank in order', async () => {
    const { engine, deps } = makeEngine();
    deps.room = roomData({ ...defaultRoomConfig, timeLimitSeconds: 30 });
    await startAndCountdown(engine, deps);
    const totalLength = DEFAULT_BODY.length;

    // ada finishes first, bob quits, the guest keeps typing but runs out of time.
    deps.clock.advance(1_000);
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(totalLength))).toEqual({
      ok: true,
    });
    deps.clock.advance(1_000);
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(10))).toEqual({ ok: true });
    expect(engine.quitRace(ROOM_ID, 'user:8')).toEqual({ ok: true });
    expect(engine.handleRaceProgress(ROOM_ID, `guest:${GUEST_TOKEN}`, progress(20))).toEqual({
      ok: true,
    });

    // Not over yet: the guest is still racing.
    expect(engine.getPhase(ROOM_ID)).toBe('en_course');

    // Past the time limit the machine marks the remaining racer as timeout.
    deps.clock.advance(29_000);
    engine.tick();
    expect(engine.getPhase(ROOM_ID)).toBe('resultats');
    expect(deps.lastPersisted()).toEqual({ roomId: ROOM_ID, status: 'resultats' });

    const finished = deps.messagesOf(ROOM_ID, 'raceFinished');
    expect(finished).toHaveLength(1);
    expect(finished[0].results.map((r) => [r.participantId, r.status, r.rank])).toEqual([
      [ADA_PUBLIC_ID, 'finished', 1],
      [GUEST_TOKEN, 'timeout', 2],
      [BOB_PUBLIC_ID, 'quit', 3],
    ]);
    expect(finished[0].results[0].wpm).toBeGreaterThan(0);
    expect(finished[0].results[2].accuracy).toBe(100);
    expect(finished[0].results[2].errors).toBe(0);
    // startAt + 31 s = the moment `advance` crossed the 30 s limit.
    expect(finished[0].durationMs).toBe(31_000);
  });

  test('two finishers rank by finish time', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);
    const totalLength = DEFAULT_BODY.length;

    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(totalLength))).toEqual({
      ok: true,
    });
    expect(engine.handleRaceProgress(ROOM_ID, `guest:${GUEST_TOKEN}`, progress(totalLength))).toEqual({
      ok: true,
    });
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(totalLength))).toEqual({
      ok: true,
    });

    expect(engine.getPhase(ROOM_ID)).toBe('resultats');
    const finished = deps.messagesOf(ROOM_ID, 'raceFinished');
    expect(finished[0].results.map((r) => r.participantId)).toEqual([
      BOB_PUBLIC_ID,
      GUEST_TOKEN,
      ADA_PUBLIC_ID,
    ]);
  });

  test('quits rank by progression at the moment of quitting', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);

    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(3))).toEqual({ ok: true });
    expect(engine.quitRace(ROOM_ID, 'user:7')).toEqual({ ok: true });
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(12))).toEqual({ ok: true });
    expect(engine.quitRace(ROOM_ID, 'user:8')).toEqual({ ok: true });
    expect(engine.quitRace(ROOM_ID, `guest:${GUEST_TOKEN}`)).toEqual({ ok: true });

    expect(engine.getPhase(ROOM_ID)).toBe('resultats');
    const finished = deps.messagesOf(ROOM_ID, 'raceFinished');
    expect(finished[0].results.map((r) => [r.participantId, r.status, r.rank])).toEqual([
      [BOB_PUBLIC_ID, 'quit', 1],
      [ADA_PUBLIC_ID, 'quit', 2],
      [GUEST_TOKEN, 'quit', 3],
    ]);
  });

  test('takeResults keeps the payload in memory for the room lifetime (Phase-3 seam)', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);
    const totalLength = DEFAULT_BODY.length;
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(totalLength))).toEqual({ ok: true });
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(totalLength))).toEqual({ ok: true });
    expect(engine.quitRace(ROOM_ID, `guest:${GUEST_TOKEN}`)).toEqual({ ok: true });

    const results: RaceResultsPayload | null = engine.takeResults(ROOM_ID);
    expect(results).not.toBeNull();
    expect(results?.roomId).toBe(ROOM_ID);
    expect(results?.results).toHaveLength(3);
  });

  test('the host can start again from the results screen', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);
    const totalLength = DEFAULT_BODY.length;
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(totalLength))).toEqual({ ok: true });
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(totalLength))).toEqual({ ok: true });
    expect(engine.quitRace(ROOM_ID, `guest:${GUEST_TOKEN}`)).toEqual({ ok: true });
    expect(engine.getPhase(ROOM_ID)).toBe('resultats');

    expect(await engine.startRace(ROOM_ID, 'user:7')).toEqual({ ok: true });
    expect(engine.getPhase(ROOM_ID)).toBe('decompte');
    const countdowns = deps.messagesOf(ROOM_ID, 'countdownStarted');
    expect(countdowns).toHaveLength(2);
  });
});

describe('room lifecycle', () => {
  test('notifyRoomClosed drops the in-memory race', async () => {
    const { engine } = makeEngine();
    await engine.startRace(ROOM_ID, 'user:7');
    expect(engine.roomCount()).toBe(1);
    engine.notifyRoomClosed(ROOM_ID);
    expect(engine.roomCount()).toBe(0);
    expect(engine.raceSnapshotFor(ROOM_ID, 'user:8')).toBeNull();
  });

  test('a persistence failure during start does not corrupt the in-memory race', async () => {
    const { engine, deps } = makeEngine();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    deps.persistError = new Error('db down');
    expect(await engine.startRace(ROOM_ID, 'user:7')).toEqual({ ok: true });
    expect(engine.getPhase(ROOM_ID)).toBe('decompte');
    expect(deps.messagesOf(ROOM_ID, 'countdownStarted')).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
