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
import { generateBotSchedule } from '../lib/bots/schedule';
import type { RoomConfig } from '../db/schema';
import type { RaceText } from '../lib/race/state';
import { raceTickMessageSchema, type RaceTickParticipant, type ServerMessage } from './protocol';
import {
  RaceEngine,
  RACE_AFK_TIMEOUT_MS,
  RACE_PROGRESS_MAX_DELTA,
  RACE_PROGRESS_MAX_PER_SECOND,
  RACE_RECONNECT_WINDOW_MS,
  RACE_TICK_BROADCAST_INTERVAL_MS,
  RACE_WPM_SERIES_MAX_POINTS,
  buildBotRaceEntries,
  syntheticBotParticipantId,
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
  config: RoomConfig = { ...defaultRoomConfig, timeLimitSeconds: null, bonusesEnabled: false },
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
  readonly persisted: Array<{ roomId: number; status: string }> = [];
  persistedResults: RaceResultsPayload[] = [];
  persistResultsError: Error | null = null;
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

  bonusWordPool = ['forge', 'nain', 'rune', 'pierre', 'tunnel', 'filon'];
  pickBonusWordPoolCalls: RoomConfig[] = [];

  async pickBonusWordPool(config: RoomConfig): Promise<string[]> {
    this.pickBonusWordPoolCalls.push(config);
    return this.bonusWordPool;
  }

  async persistStatus(roomId: number, status: 'en_attente' | 'decompte' | 'en_course' | 'resultats' | 'fermee'): Promise<void> {
    if (this.persistError) {
      throw this.persistError;
    }
    this.persisted.push({ roomId, status });
  }

  async persistResults(payload: RaceResultsPayload): Promise<void> {
    if (this.persistResultsError) {
      throw this.persistResultsError;
    }
    this.persistedResults.push(payload);
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

  test('persists the finished race exactly once through the seam (RES-05, PERF-02)', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);
    // Let the race actually run for a while so the duration is measurable.
    deps.clock.advance(1_000);
    engine.tick();
    const totalLength = DEFAULT_BODY.length;
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(totalLength))).toEqual({ ok: true });
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(totalLength))).toEqual({ ok: true });
    expect(engine.quitRace(ROOM_ID, `guest:${GUEST_TOKEN}`)).toEqual({ ok: true });

    expect(deps.persistedResults).toHaveLength(1);
    const payload = deps.persistedResults[0];
    expect(payload.roomId).toBe(ROOM_ID);
    expect(payload.roomPublicId).toBe(ROOM_PUBLIC_ID);
    expect(payload.textBody).toBe(DEFAULT_BODY);
    expect(payload.textLanguage).toBe('fr');
    expect(payload.durationMs).toBe(1_000);
    // Persistence identity rides along, never on the wire.
    const ada = payload.results.find((entry) => entry.participantId === ADA_PUBLIC_ID);
    expect(ada?.userId).toBe(7);
    expect(ada?.guestToken).toBeNull();
    const gimli = payload.results.find((entry) => entry.participantId === GUEST_TOKEN);
    expect(gimli?.userId).toBeNull();
    expect(gimli?.guestToken).toBe(GUEST_TOKEN);

    // PERF-02: one write per finished race — extra ticks change nothing.
    deps.clock.advance(RACE_TICK_BROADCAST_INTERVAL_MS);
    engine.tick();
    expect(deps.persistedResults).toHaveLength(1);
  });

  test('never persists an aborted race (GAME-5: no ranking, no history)', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(5))).toEqual({ ok: true });

    deps.clock.advance(RACE_AFK_TIMEOUT_MS);
    engine.tick();

    expect(deps.messagesOf(ROOM_ID, 'raceAborted')).toHaveLength(1);
    expect(deps.persistedResults).toHaveLength(0);
    expect(engine.takeResults(ROOM_ID)).toBeNull();
  });

  test('a persistence failure is logged away and never breaks the finish flow', async () => {
    const { engine, deps } = makeEngine();
    deps.persistResultsError = new Error('database down');
    await startAndCountdown(engine, deps);
    const totalLength = DEFAULT_BODY.length;
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(totalLength))).toEqual({ ok: true });
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(totalLength))).toEqual({ ok: true });
    expect(engine.quitRace(ROOM_ID, `guest:${GUEST_TOKEN}`)).toEqual({ ok: true });

    // The broadcast still happened: the results screen is authoritative live.
    expect(deps.messagesOf(ROOM_ID, 'raceFinished')).toHaveLength(1);
  });

  test('raceFinishedReplay returns the last finished race for a resultats room', async () => {
    const { engine, deps } = makeEngine();
    expect(engine.raceFinishedReplay(ROOM_ID)).toBeNull();

    await startAndCountdown(engine, deps);
    const totalLength = DEFAULT_BODY.length;
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(totalLength))).toEqual({ ok: true });
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(totalLength))).toEqual({ ok: true });
    expect(engine.quitRace(ROOM_ID, `guest:${GUEST_TOKEN}`)).toEqual({ ok: true });

    const replayed = engine.raceFinishedReplay(ROOM_ID);
    expect(replayed?.type).toBe('raceFinished');
    expect(replayed?.roomPublicId).toBe(ROOM_PUBLIC_ID);
    expect(replayed?.results).toHaveLength(3);
    expect(replayed?.results[0].rank).toBe(1);
  });

  test('raceFinishedReplay is null after a relaunch or an abort', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);
    const totalLength = DEFAULT_BODY.length;
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(totalLength))).toEqual({ ok: true });
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(totalLength))).toEqual({ ok: true });
    expect(engine.quitRace(ROOM_ID, `guest:${GUEST_TOKEN}`)).toEqual({ ok: true });
    expect(engine.raceFinishedReplay(ROOM_ID)).not.toBeNull();

    // Relaunch: the fresh race has no results yet.
    expect(await engine.startRace(ROOM_ID, 'user:7')).toEqual({ ok: true });
    expect(engine.raceFinishedReplay(ROOM_ID)).toBeNull();
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

  test('a relaunch from resultats re-collects the CURRENT participants (COURSE-11)', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);
    const totalLength = DEFAULT_BODY.length;
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(totalLength))).toEqual({ ok: true });
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(totalLength))).toEqual({ ok: true });
    expect(engine.quitRace(ROOM_ID, `guest:${GUEST_TOKEN}`)).toEqual({ ok: true });
    expect(engine.getPhase(ROOM_ID)).toBe('resultats');

    // The guest left the room between the two races: the fresh start must
    // read the members again (not reuse the stale participant set).
    const currentRoom = deps.room;
    expect(currentRoom).not.toBeNull();
    if (currentRoom) {
      deps.room = {
        ...currentRoom,
        members: currentRoom.members.filter((entry) => entry.memberId !== 3),
      };
    }
    expect(await engine.startRace(ROOM_ID, 'user:7')).toEqual({ ok: true });
    expect(engine.getPhase(ROOM_ID)).toBe('decompte');

    deps.clock.advance(3_000);
    engine.tick();
    deps.clock.advance(RACE_TICK_BROADCAST_INTERVAL_MS);
    engine.tick();
    const ticks = deps.messagesOf(ROOM_ID, 'raceTick');
    const tick = ticks[ticks.length - 1];
    expect(tick?.participants.map((p) => p.participantId)).toEqual([
      ADA_PUBLIC_ID,
      BOB_PUBLIC_ID,
    ]);
  });
});

describe('WPM time series sampling (RES-03/05 groundwork)', () => {
  test('samples at tick-broadcast rate, monotonically, and stays OUT of raceTick (PERF-02)', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);

    for (let step = 0; step < 4; step += 1) {
      deps.clock.advance(RACE_TICK_BROADCAST_INTERVAL_MS);
      engine.tick();
    }
    const ticks = deps.messagesOf(ROOM_ID, 'raceTick');
    expect(ticks).toHaveLength(4);
    // The series is never part of the per-tick payload (bandwidth, PERF-02).
    for (const tick of ticks) {
      for (const participant of tick.participants) {
        expect('wpmSeries' in participant).toBe(false);
      }
    }

    // Finish the race ~100 ms past the last tick so the final sample is a
    // distinct point (the tick at 1000 ms and the finish at 1100 ms).
    deps.clock.advance(100);
    const totalLength = DEFAULT_BODY.length;
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(totalLength))).toEqual({
      ok: true,
    });
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(totalLength))).toEqual({
      ok: true,
    });
    expect(engine.quitRace(ROOM_ID, `guest:${GUEST_TOKEN}`)).toEqual({ ok: true });

    const finished = deps.messagesOf(ROOM_ID, 'raceFinished');
    const bob = finished[0].results.find((entry) => entry.participantId === BOB_PUBLIC_ID);
    expect(bob).toBeDefined();
    // 4 tick samples + the final sample at the exact end time.
    expect(bob?.wpmSeries).toHaveLength(5);
    const elapsed = (bob?.wpmSeries ?? []).map((point) => point.elapsedMs);
    expect(elapsed).toEqual([250, 500, 750, 1_000, 1_100]);
    // Monotonic in time and closed by the ranked WPM (chart end == table).
    expect([...elapsed].sort((a, b) => a - b)).toEqual(elapsed);
    expect(elapsed[elapsed.length - 1]).toBe(bob?.finishedAtMs);
    expect(bob?.wpmSeries[elapsed.length - 1].wpm).toBe(bob?.wpm);

    // RES-05: the in-memory payload SP-3B persists carries the series too.
    const payload: RaceResultsPayload | null = engine.takeResults(ROOM_ID);
    const payloadBob = payload?.results.find((entry) => entry.participantId === BOB_PUBLIC_ID);
    expect(payloadBob?.wpmSeries).toEqual(bob?.wpmSeries);
  });

  test('a final sample at the same millisecond overwrites the tick sample', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);

    // The finish lands exactly on a tick boundary: no extra point, but the
    // last point must carry the ranked (final) WPM.
    deps.clock.advance(RACE_TICK_BROADCAST_INTERVAL_MS);
    engine.tick();
    const totalLength = DEFAULT_BODY.length;
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(totalLength))).toEqual({
      ok: true,
    });
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(totalLength))).toEqual({
      ok: true,
    });
    expect(engine.quitRace(ROOM_ID, `guest:${GUEST_TOKEN}`)).toEqual({ ok: true });

    const finished = deps.messagesOf(ROOM_ID, 'raceFinished');
    const bob = finished[0].results.find((entry) => entry.participantId === BOB_PUBLIC_ID);
    expect(bob).toBeDefined();
    const series = bob?.wpmSeries ?? [];
    expect(series).toHaveLength(1);
    expect(series[0]).toEqual({ elapsedMs: 250, wpm: bob?.wpm });
  });

  test('sampled wpm values follow the Annexe A formula at each sample time', async () => {
    const { engine, deps } = makeEngine();
    await startAndCountdown(engine, deps);

    // 10 validated chars; the first sample is taken 1000 ms in.
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(10))).toEqual({ ok: true });
    deps.clock.advance(1_000);
    engine.tick();
    // Finish 100 ms past the sample so it is not overwritten by the final one.
    deps.clock.advance(100);

    const totalLength = DEFAULT_BODY.length;
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(totalLength))).toEqual({
      ok: true,
    });
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(totalLength))).toEqual({
      ok: true,
    });
    expect(engine.quitRace(ROOM_ID, `guest:${GUEST_TOKEN}`)).toEqual({ ok: true });

    const finished = deps.messagesOf(ROOM_ID, 'raceFinished');
    const bob = finished[0].results.find((entry) => entry.participantId === BOB_PUBLIC_ID);
    // net WPM = 10 chars ÷ 5 ÷ (1000 / 60000 min) = 120.
    expect(bob?.wpmSeries[0]).toEqual({ elapsedMs: 1_000, wpm: 120 });
  });

  test('the series is bounded by RACE_WPM_SERIES_MAX_POINTS (defensive cap)', async () => {
    const { engine, deps } = makeEngine();
    deps.room = roomData({ ...defaultRoomConfig, timeLimitSeconds: null, bonusesEnabled: false });
    deps.textBody = LONG_BODY;
    await startAndCountdown(engine, deps);
    const totalLength = LONG_BODY.length;

    // Keep one participant typing (just below completion) while the loop
    // crosses far more tick boundaries than the cap; fresh progress every
    // 20 ticks also keeps the GAME-5 AFK abort away.
    let chars = 0;
    for (let step = 0; step <= RACE_WPM_SERIES_MAX_POINTS + 5; step += 1) {
      deps.clock.advance(RACE_TICK_BROADCAST_INTERVAL_MS);
      if (step % 20 === 0) {
        chars = Math.min(chars + 5, totalLength - 1);
        expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(chars))).toEqual({
          ok: true,
        });
      }
      engine.tick();
    }
    expect(engine.getPhase(ROOM_ID)).toBe('en_course');

    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(totalLength))).toEqual({
      ok: true,
    });
    // The host finishes in ≤ RACE_PROGRESS_MAX_DELTA jumps (from zero).
    for (let chunk = RACE_PROGRESS_MAX_DELTA; chunk < totalLength; chunk += RACE_PROGRESS_MAX_DELTA) {
      expect(
        engine.handleRaceProgress(ROOM_ID, 'user:7', progress(Math.min(chunk, totalLength))),
      ).toEqual({ ok: true });
    }
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(totalLength))).toEqual({
      ok: true,
    });
    expect(engine.quitRace(ROOM_ID, `guest:${GUEST_TOKEN}`)).toEqual({ ok: true });

    const finished = deps.messagesOf(ROOM_ID, 'raceFinished');
    const bob = finished[0].results.find((entry) => entry.participantId === BOB_PUBLIC_ID);
    expect(bob?.wpmSeries.length).toBeLessThanOrEqual(RACE_WPM_SERIES_MAX_POINTS);
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

describe('bots (BOT-01/04/05, ADR-011)', () => {
  const BOTS_NOOB_EXPERT: RoomConfig = {
    ...defaultRoomConfig,
    timeLimitSeconds: null,
    bonusesEnabled: false,
    bots: [
      { level: 'noob', count: 1 },
      { level: 'expert', count: 1 },
    ],
  };
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  /** Host (user 7) as the only human racer, plus one spectator. */
  function soloRoomData(config: RoomConfig): RaceEngineRoomData {
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

  /** Starts, ends the countdown and returns the first raceTick after `ms` of typing. */
  async function startAndTickOnce(
    engine: RaceEngine,
    deps: FakeDeps,
    typingMs: number,
  ): Promise<Array<ServerMessage & { type: 'raceTick' }>> {
    await engine.startRace(ROOM_ID, 'user:7');
    deps.clock.advance(3_000);
    engine.tick();
    deps.clock.advance(typingMs);
    engine.tick();
    return deps.messagesOf(ROOM_ID, 'raceTick');
  }

  test('one human + two bots satisfies the start guard; bots appear in raceTick with UUID ids', async () => {
    const { engine, deps } = makeEngine();
    deps.room = soloRoomData(BOTS_NOOB_EXPERT);
    const ticks = await startAndTickOnce(engine, deps, RACE_TICK_BROADCAST_INTERVAL_MS);
    expect(engine.getPhase(ROOM_ID)).toBe('en_course');
    expect(ticks).toHaveLength(1);
    const bots = ticks[0].participants.filter((participant) => participant.kind === 'bot');
    expect(bots.map((bot) => bot.displayName)).toEqual(['noob 1', 'expert 2']);
    for (const bot of bots) {
      expect(bot.participantId).toMatch(UUID_PATTERN);
      expect(bot.position).toBeGreaterThanOrEqual(0);
    }
    // Wire compatibility: the client's Zod schema accepts the tick unchanged.
    expect(raceTickMessageSchema.safeParse(ticks[0]).success).toBe(true);
    const ada = ticks[0].participants.find((participant) => participant.participantId === ADA_PUBLIC_ID);
    expect(ada?.kind).toBe('user');
    expect(ada?.position).toBe(0);
  });

  test('bots advance over ticks from their schedules, faster levels first (BOT-01)', async () => {
    const { engine, deps } = makeEngine();
    deps.room = soloRoomData(BOTS_NOOB_EXPERT);
    const ticks = await startAndTickOnce(engine, deps, 2_000);
    expect(ticks).toHaveLength(1);

    const noob = ticks[0].participants.find(
      (participant) => participant.kind === 'bot' && participant.displayName === 'noob 1',
    );
    const expert = ticks[0].participants.find(
      (participant) => participant.kind === 'bot' && participant.displayName === 'expert 2',
    );
    expect(noob?.position).toBeGreaterThan(0);
    expect(expert?.position).toBeGreaterThan(noob?.position ?? 0);
    expect(noob?.finished).toBe(false);
    expect(expert?.wpm).toBeGreaterThan(0);
  });

  test('bot error counters accumulate exactly as the seeded schedule dictates (BOT-03/05)', async () => {
    const { engine, deps } = makeEngine();
    deps.room = soloRoomData({
      ...defaultRoomConfig,
      timeLimitSeconds: null,
      bonusesEnabled: false,
      bots: [{ level: 'noob', count: 1 }],
    });
    await engine.startRace(ROOM_ID, 'user:7');
    deps.clock.advance(3_000);
    engine.tick();

    // Bot 1 seed = raceSeed (42) + 1 — recompute the same schedule the
    // engine generated and compare the counters afterwards.
    const expected = generateBotSchedule({
      text: DEFAULT_BODY,
      level: 'noob',
      seed: 43,
      errorMode: 'accumulate',
    });
    const expectedErrors = expected.steps.filter((step) => step.kind === 'error').length;
    expect(expectedErrors).toBeGreaterThan(0);

    // Noob on 43 characters takes ~30 s; walk until every bot is done.
    for (let step = 0; step < 120; step += 1) {
      deps.clock.advance(500);
      engine.tick();
    }
    const totalLength = DEFAULT_BODY.length;
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(totalLength))).toEqual({
      ok: true,
    });

    const finished = deps.messagesOf(ROOM_ID, 'raceFinished');
    expect(finished).toHaveLength(1);
    const bot = finished[0].results.find((result) => result.kind === 'bot');
    expect(bot?.status).toBe('finished');
    expect(bot?.errors).toBe(expectedErrors);

    // The persisted payload carries the same counters (RES-05, kind 'bot').
    expect(deps.persistedResults).toHaveLength(1);
    const persisted = deps.persistedResults[0].results.find((result) => result.kind === 'bot');
    expect(persisted).toBeDefined();
    expect(persisted?.userId).toBeNull();
    expect(persisted?.guestToken).toBeNull();
    expect(persisted?.correctKeystrokes).toBe(totalLength);
    expect(persisted?.totalKeystrokes).toBe(totalLength + expectedErrors);
    expect(persisted?.errors).toBe(expectedErrors);
    expect(persisted?.displayName).toBe('noob 1');
  });

  test('bots finish by themselves and rank mixed with humans (COURSE-10)', async () => {
    const { engine, deps } = makeEngine();
    deps.room = soloRoomData(BOTS_NOOB_EXPERT);
    await engine.startRace(ROOM_ID, 'user:7');
    deps.clock.advance(3_000);
    engine.tick();

    // The human finishes first; the bots keep typing by themselves.
    const totalLength = DEFAULT_BODY.length;
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(totalLength))).toEqual({
      ok: true,
    });
    for (let step = 0; step < 200 && deps.messagesOf(ROOM_ID, 'raceFinished').length === 0; step += 1) {
      deps.clock.advance(500);
      engine.tick();
    }

    const finished = deps.messagesOf(ROOM_ID, 'raceFinished');
    expect(finished).toHaveLength(1);
    expect(finished[0].results).toHaveLength(3);
    expect(finished[0].results.map((result) => result.kind)).toEqual(['user', 'bot', 'bot']);
    expect(finished[0].results.map((result) => result.rank)).toEqual([1, 2, 3]);

    const expert = finished[0].results[1];
    expect(expert.displayName).toBe('expert 2');
    expect(expert.status).toBe('finished');
    expect(expert.wpmSeries.length).toBeGreaterThan(0);

    const finishes = deps.messagesOf(ROOM_ID, 'participantFinished');
    expect(finishes).toHaveLength(3);
    expect(finishes.map((message) => message.rank)).toEqual([1, 2, 3]);
    expect(finishes[0].participantId).toBe(ADA_PUBLIC_ID);
    expect(finishes[1].participantId).toMatch(UUID_PATTERN);
    expect(finishes[2].participantId).toMatch(UUID_PATTERN);
  });

  test('two engines with the same seed drive identical bot timelines (BOT-05)', async () => {
    const first = makeEngine();
    const second = makeEngine();
    for (const { engine, deps } of [first, second]) {
      deps.room = soloRoomData(BOTS_NOOB_EXPERT);
      await engine.startRace(ROOM_ID, 'user:7');
    }

    // Identical clock sequences on both engines.
    for (let step = 0; step < 40; step += 1) {
      first.deps.clock.advance(500);
      first.engine.tick();
      second.deps.clock.advance(500);
      second.engine.tick();
    }

    const ticksA = first.deps.messagesOf(ROOM_ID, 'raceTick');
    const ticksB = second.deps.messagesOf(ROOM_ID, 'raceTick');
    expect(ticksB).toEqual(ticksA);
    const botIds = ticksA[0].participants
      .filter((participant) => participant.kind === 'bot')
      .map((participant) => participant.participantId);
    expect(botIds).toEqual([syntheticBotParticipantId(43), syntheticBotParticipantId(44)]);
  });

  test('a relaunch draws a fresh race seed: new bot schedules and ids (COURSE-11, BOT-05)', async () => {
    const { engine, deps } = makeEngine();
    deps.room = soloRoomData(BOTS_NOOB_EXPERT);

    const noobPositions = (tickList: Array<ServerMessage & { type: 'raceTick' }>): number[] =>
      tickList.map(
        (tick) =>
          tick.participants.find(
            (participant) => participant.kind === 'bot' && participant.displayName === 'noob 1',
          )?.position ?? -1,
      );

    // Race 1 (raceSeed 42 → bot seeds 43/44): sample the noob timeline.
    await engine.startRace(ROOM_ID, 'user:7');
    deps.clock.advance(3_000);
    engine.tick();
    for (let step = 0; step < 12; step += 1) {
      deps.clock.advance(500);
      engine.tick();
    }
    const raceOneTicks = deps.messagesOf(ROOM_ID, 'raceTick');
    const firstIds = raceOneTicks[0].participants
      .filter((participant) => participant.kind === 'bot')
      .map((bot) => bot.participantId);
    expect(firstIds).toEqual([syntheticBotParticipantId(43), syntheticBotParticipantId(44)]);
    const firstTimeline = noobPositions(raceOneTicks);

    // Finish race 1: the human completes, then the bots run to the end.
    const totalLength = DEFAULT_BODY.length;
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(totalLength))).toEqual({
      ok: true,
    });
    for (let step = 0; step < 200 && deps.messagesOf(ROOM_ID, 'raceFinished').length === 0; step += 1) {
      deps.clock.advance(500);
      engine.tick();
    }
    expect(engine.getPhase(ROOM_ID)).toBe('resultats');
    const raceOneTickCount = deps.messagesOf(ROOM_ID, 'raceTick').length;

    // Relaunch: raceSeed 43 → bot seeds 44/45 — fresh schedules, fresh ids.
    expect(await engine.startRace(ROOM_ID, 'user:7')).toEqual({ ok: true });
    deps.clock.advance(3_000);
    engine.tick();
    for (let step = 0; step < 12; step += 1) {
      deps.clock.advance(500);
      engine.tick();
    }
    const raceTwoTicks = deps.messagesOf(ROOM_ID, 'raceTick').slice(raceOneTickCount);
    const secondIds = raceTwoTicks[0].participants
      .filter((participant) => participant.kind === 'bot')
      .map((bot) => bot.participantId);
    expect(secondIds).toEqual([syntheticBotParticipantId(44), syntheticBotParticipantId(45)]);
    // A fresh seed produces a different typing timeline at the same clock.
    expect(noobPositions(raceTwoTicks)).not.toEqual(firstTimeline);
  });

  test('an AFK abort after the bots finished cleans up and persists nothing (GAME-5)', async () => {
    const { engine, deps } = makeEngine();
    deps.room = soloRoomData({
      ...defaultRoomConfig,
      timeLimitSeconds: null,
      bots: [{ level: 'expert', count: 1 }],
    });
    await engine.startRace(ROOM_ID, 'user:7');
    deps.clock.advance(3_000);
    engine.tick();

    // The expert finishes in ~6 s; the human never types, so 60 s of global
    // inactivity after that aborts the race.
    for (let step = 0; step < 140; step += 1) {
      deps.clock.advance(500);
      engine.tick();
    }
    expect(deps.messagesOf(ROOM_ID, 'raceAborted')).toHaveLength(1);
    expect(engine.getPhase(ROOM_ID)).toBe('en_attente');
    expect(deps.persistedResults).toHaveLength(0);

    // Relaunch from the aborted state rebuilds the bot with fresh, empty
    // progress (the aborted runtimes, schedule included, are discarded).
    expect(await engine.startRace(ROOM_ID, 'user:7')).toEqual({ ok: true });
    deps.clock.advance(3_000);
    engine.tick();
    deps.clock.advance(RACE_TICK_BROADCAST_INTERVAL_MS);
    engine.tick();
    const tick = deps.messagesOf(ROOM_ID, 'raceTick').at(-1);
    const bot = tick?.participants.find((participant) => participant.kind === 'bot');
    expect(bot?.finished).toBe(false);
    expect(bot?.position).toBeLessThan(DEFAULT_BODY.length);
  });

  test('bots without a single human racer are rejected by the start guard (COURSE-02)', async () => {
    const { engine, deps } = makeEngine();
    deps.room = {
      ...soloRoomData(BOTS_NOOB_EXPERT),
      members: [soloRoomData(BOTS_NOOB_EXPERT).members[1]], // spectator only
    };
    expect(await engine.startRace(ROOM_ID, 'user:7')).toMatchObject({
      ok: false,
      code: 'race_not_running',
    });
    expect(engine.roomCount()).toBe(0);
  });

  test('a time limit records still-typing bots as timeouts ranked by progression (COURSE-09/10)', async () => {
    const { engine, deps } = makeEngine();
    deps.textBody = LONG_BODY;
    deps.room = soloRoomData({
      ...defaultRoomConfig,
      timeLimitSeconds: 30,
      bots: [{ level: 'noob', count: 1 }],
    });
    await engine.startRace(ROOM_ID, 'user:7');
    deps.clock.advance(3_000);
    engine.tick();
    for (let step = 0; step < 70; step += 1) {
      deps.clock.advance(500);
      engine.tick();
    }

    const finished = deps.messagesOf(ROOM_ID, 'raceFinished');
    expect(finished).toHaveLength(1);
    const bot = finished[0].results.find((result) => result.kind === 'bot');
    expect(bot?.status).toBe('timeout');
    expect((bot?.wpm ?? 0) > 0).toBe(true);
    // Timeout ranking: the bot progressed, the human never typed → bot first.
    expect(bot?.rank).toBe(1);
  });
});

describe('buildBotRaceEntries (CONF-10)', () => {
  test('creates one participant per configured bot, numbered across levels', () => {
    const config: RoomConfig = {
      ...defaultRoomConfig,
      bots: [
        { level: 'noob', count: 2 },
        { level: 'expert', count: 1 },
      ],
    };
    const entries = buildBotRaceEntries({ config, raceSeed: 7, text: 'hi', humanRacerCount: 3 });
    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => entry.participant.displayName)).toEqual([
      'noob 1',
      'noob 2',
      'expert 3',
    ]);
    expect(entries.every((entry) => entry.participant.kind === 'bot')).toBe(true);
    expect(entries.every((entry) => !entry.participant.isSpectator)).toBe(true);
    expect(entries.map((entry) => entry.participant.memberId)).toEqual(
      entries.map((entry) => entry.participantId),
    );
    // Schedules are deterministic per seed.
    expect(entries[0].schedule).toStrictEqual(
      generateBotSchedule({ text: 'hi', level: 'noob', seed: 8, errorMode: 'accumulate' }),
    );
  });

  test('caps the combined field at RACE_MAX_PARTICIPANTS (SALLE-05 ceiling)', () => {
    const config: RoomConfig = {
      ...defaultRoomConfig,
      bots: [{ level: 'noob', count: 40 }],
    };
    const entries = buildBotRaceEntries({ config, raceSeed: 7, text: 'hi', humanRacerCount: 10 });
    expect(entries).toHaveLength(20);
    expect(entries.at(-1)?.participant.displayName).toBe('noob 20');
  });
});

describe('syntheticBotParticipantId (BOT-05)', () => {
  test('is a deterministic UUID v4 derived from the seed', () => {
    expect(syntheticBotParticipantId(43)).toBe(syntheticBotParticipantId(43));
    expect(syntheticBotParticipantId(43)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(syntheticBotParticipantId(43)).not.toBe(syntheticBotParticipantId(44));
  });
});

describe('comeback bonuses (BONUS-01/04, CONF-09)', () => {
  type BonusMessage = ServerMessage & { type: 'bonusApplied' };

  /** Characters appended by one addWords event: " tunnel forge nain" (18). */
  const ADDED = ' tunnel forge nain'.length;
  const GROWN = DEFAULT_BODY.length + ADDED;

  /** Host (user 7) as the only human racer, plus one spectator. */
  function soloRoomData(config: RoomConfig): RaceEngineRoomData {
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

  const bonusesOf = (deps: FakeDeps): BonusMessage[] => deps.messagesOf(ROOM_ID, 'bonusApplied');

  /** Advances the fake clock by `ms` and runs one engine tick. */
  function tickAfter(deps: FakeDeps, engine: RaceEngine, ms: number): void {
    deps.clock.advance(ms);
    engine.tick();
  }

  /** The latest tick's entry for a participant, or null. */
  function latestTickEntry(deps: FakeDeps, participantId: string): RaceTickParticipant | null {
    const ticks = deps.messagesOf(ROOM_ID, 'raceTick');
    for (let index = ticks.length - 1; index >= 0; index -= 1) {
      const entry = ticks[index].participants.find(
        (participant) => participant.participantId === participantId,
      );
      if (entry) {
        return entry;
      }
    }
    return null;
  }

  /** Walks the engine until the race reached `resultats` (capped). */
  function walkToFinish(deps: FakeDeps, engine: RaceEngine): void {
    for (
      let step = 0;
      step < 400 && deps.messagesOf(ROOM_ID, 'raceFinished').length === 0;
      step += 1
    ) {
      tickAfter(deps, engine, RACE_TICK_BROADCAST_INTERVAL_MS);
    }
  }

  test('full race: exactly 3 checkpoints, leader hindered, laggard helped, lengths coherent (BONUS-01/04)', async () => {
    const { engine, deps } = makeEngine();
    // Seed 42 → type draws: addWords, removeWords, removeWords.
    deps.room = roomData({
      ...defaultRoomConfig,
      timeLimitSeconds: null,
      bonusesEnabled: true,
      bots: [{ level: 'noob', count: 1 }],
    });
    await startAndCountdown(engine, deps);

    // Bob leads the race; the host (ada) stays at 0 — the most-behind
    // eligible participant, so every help lands on her.
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(11))).toEqual({ ok: true });
    tickAfter(deps, engine, RACE_TICK_BROADCAST_INTERVAL_MS);

    // 25 % crossing: addWords hinder on the leader (bob). His effective text
    // grows by " tunnel forge nain" (18 chars): 43 → 61.
    expect(bonusesOf(deps)).toHaveLength(1);
    expect(bonusesOf(deps)[0]).toMatchObject({
      targetParticipantId: BOB_PUBLIC_ID,
      bonusType: 'addWords',
      payload: { words: ['tunnel', 'forge', 'nain'], totalLength: GROWN },
    });

    // 50 % crossing (30/61 ≈ 49.2 % — still below; use 31): removeWords help
    // on ada (43 → 30 chars).
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(31))).toEqual({ ok: true });
    tickAfter(deps, engine, RACE_TICK_BROADCAST_INTERVAL_MS);
    expect(bonusesOf(deps)).toHaveLength(2);
    expect(bonusesOf(deps)[1]).toMatchObject({
      targetParticipantId: ADA_PUBLIC_ID,
      bonusType: 'removeWords',
      payload: { wordCount: 3, totalLength: 30 },
    });

    // 75 % crossing (46/61 ≈ 75.4 %): removeWords help on ada (30 → 15 chars).
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(46))).toEqual({ ok: true });
    tickAfter(deps, engine, RACE_TICK_BROADCAST_INTERVAL_MS);
    expect(bonusesOf(deps)).toHaveLength(3);
    expect(bonusesOf(deps)[2]).toMatchObject({
      targetParticipantId: ADA_PUBLIC_ID,
      bonusType: 'removeWords',
      payload: { wordCount: 3, totalLength: 15 },
    });

    // Every bonusApplied message is protocol-shaped (timestamp included).
    for (const message of bonusesOf(deps)) {
      expect(Number.isFinite(Date.parse(message.payload.at))).toBe(true);
      expect(message.roomPublicId).toBe(ROOM_PUBLIC_ID);
    }

    // The ticks carry the bonus-adjusted effective lengths (BONUS-04).
    const bobTick = latestTickEntry(deps, BOB_PUBLIC_ID);
    const adaTick = latestTickEntry(deps, ADA_PUBLIC_ID);
    expect(bobTick?.totalLength).toBe(GROWN);
    expect(adaTick?.totalLength).toBe(15);

    // Progression stays coherent in every tick: positions never exceed the
    // participant's own effective length.
    for (const tick of deps.messagesOf(ROOM_ID, 'raceTick')) {
      for (const participant of tick.participants) {
        expect(participant.position).toBeGreaterThanOrEqual(0);
        expect(participant.position).toBeLessThanOrEqual(participant.totalLength);
      }
    }

    // Bob finishes against his extended 61-character text; ada finishes her
    // shrunken 15-character text; the guest (untouched, 43 chars) and the
    // noob bot complete on their own timelines.
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(GROWN))).toEqual({ ok: true });
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(15))).toEqual({ ok: true });
    expect(
      engine.handleRaceProgress(ROOM_ID, `guest:${GUEST_TOKEN}`, progress(DEFAULT_BODY.length)),
    ).toEqual({ ok: true });
    walkToFinish(deps, engine);

    expect(bonusesOf(deps)).toHaveLength(3); // exactly 3, one per checkpoint
    const finished = deps.messagesOf(ROOM_ID, 'raceFinished');
    expect(finished).toHaveLength(1);
    const bobResult = finished[0].results.find((entry) => entry.participantId === BOB_PUBLIC_ID);
    const adaResult = finished[0].results.find((entry) => entry.participantId === ADA_PUBLIC_ID);
    const guestResult = finished[0].results.find(
      (entry) => entry.participantId === GUEST_TOKEN,
    );
    const botResult = finished[0].results.find((entry) => entry.kind === 'bot');
    expect(bobResult?.status).toBe('finished');
    expect(adaResult?.status).toBe('finished');
    expect(guestResult?.status).toBe('finished');
    expect(botResult?.status).toBe('finished');
    expect(bobResult?.bonusesReceived).toBe(1);
    expect(adaResult?.bonusesReceived).toBe(2);
    expect(guestResult?.bonusesReceived).toBe(0);
    expect(botResult?.bonusesReceived).toBe(0);

    // The persisted payload maps the counters through (RES-05).
    const persisted = deps.persistedResults[0].results;
    expect(persisted.find((entry) => entry.participantId === BOB_PUBLIC_ID)?.bonusesReceived).toBe(1);
    expect(persisted.find((entry) => entry.participantId === ADA_PUBLIC_ID)?.bonusesReceived).toBe(2);
  });

  test('a bot leader adapts: addWords extends its schedule, removeWords shrinks the human (ADR-011)', async () => {
    const { engine, deps } = makeEngine();
    const BOT_ID = syntheticBotParticipantId(43);
    deps.room = soloRoomData({
      ...defaultRoomConfig,
      timeLimitSeconds: null,
      bonusesEnabled: true,
      bots: [{ level: 'expert', count: 1 }],
    });
    await engine.startRace(ROOM_ID, 'user:7');
    tickAfter(deps, engine, 3_000);

    // The expert bot leads from the start; seed 42 → addWords on the leader
    // (the bot), then two removeWords helps on the only other racer (ada).
    // Walk until all three checkpoint effects have fired.
    for (let step = 0; step < 200 && bonusesOf(deps).length < 3; step += 1) {
      tickAfter(deps, engine, RACE_TICK_BROADCAST_INTERVAL_MS);
    }

    const events = bonusesOf(deps);
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.bonusType)).toEqual([
      'addWords',
      'removeWords',
      'removeWords',
    ]);
    expect(events[0]).toMatchObject({
      targetParticipantId: BOT_ID,
      payload: { words: ['tunnel', 'forge', 'nain'], totalLength: GROWN },
    });
    expect(events[1].targetParticipantId).toBe(ADA_PUBLIC_ID);
    expect(events[2].targetParticipantId).toBe(ADA_PUBLIC_ID);

    // The bot's extended schedule is typed to the end: it finished with the
    // grown effective length and its bonus counter persisted.
    const botEntry = latestTickEntry(deps, BOT_ID);
    expect(botEntry?.totalLength).toBe(GROWN);

    // The human was helped twice (43 → 30 → 15 chars): she finishes her
    // shrunken text, then the bot completes its extended schedule.
    const adaTick = latestTickEntry(deps, ADA_PUBLIC_ID);
    expect(adaTick?.totalLength).toBe(15);
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(15))).toEqual({ ok: true });
    walkToFinish(deps, engine);

    const finished = deps.messagesOf(ROOM_ID, 'raceFinished');
    expect(finished).toHaveLength(1);
    const botResult = finished[0].results.find((entry) => entry.participantId === BOT_ID);
    expect(botResult?.status).toBe('finished');
    expect(botResult?.bonusesReceived).toBe(1);
    const botPersisted = deps.persistedResults[0].results.find(
      (entry) => entry.participantId === BOT_ID,
    );
    expect(botPersisted?.bonusesReceived).toBe(1);
    expect(botPersisted?.kind).toBe('bot');

    const adaResult = finished[0].results.find((entry) => entry.participantId === ADA_PUBLIC_ID);
    expect(adaResult?.status).toBe('finished');
    expect(adaResult?.bonusesReceived).toBe(2);
  });

  test('fog never targets a bot leader: the event is skipped (documented rule)', async () => {
    const { engine, deps } = makeEngine();
    deps.nextSeed = 3; // type draws: fog, removeWords, removeWords
    const BOT_ID = syntheticBotParticipantId(4);
    deps.room = soloRoomData({
      ...defaultRoomConfig,
      timeLimitSeconds: null,
      bonusesEnabled: true,
      bots: [{ level: 'expert', count: 1 }],
    });
    await engine.startRace(ROOM_ID, 'user:7');
    tickAfter(deps, engine, 3_000);
    // The fog draw was consumed at the first checkpoint; walk until the two
    // removeWords helps have landed on the human.
    for (let step = 0; step < 200 && bonusesOf(deps).length < 2; step += 1) {
      tickAfter(deps, engine, RACE_TICK_BROADCAST_INTERVAL_MS);
    }

    const events = bonusesOf(deps);
    // The fog draw was consumed but applied to nobody: only the two
    // removeWords helps were broadcast, both to the human.
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.bonusType === 'removeWords')).toBe(true);
    expect(events.every((event) => event.targetParticipantId === ADA_PUBLIC_ID)).toBe(true);

    // Ada finishes her shrunken text; the bot then completes its schedule.
    const adaTick = latestTickEntry(deps, ADA_PUBLIC_ID);
    expect(adaTick?.totalLength).toBe(15);
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(15))).toEqual({ ok: true });
    walkToFinish(deps, engine);

    const finished = deps.messagesOf(ROOM_ID, 'raceFinished');
    expect(finished).toHaveLength(1);
    const botResult = finished[0].results.find((entry) => entry.participantId === BOT_ID);
    expect(botResult?.bonusesReceived).toBe(0);
    expect(botResult?.status).toBe('finished');
  });

  test('fog on a human leader applies with no text change (durationMs payload)', async () => {
    const { engine, deps } = makeEngine();
    deps.nextSeed = 5; // type draws: fog, addWords, fog
    deps.room = roomData({
      ...defaultRoomConfig,
      timeLimitSeconds: null,
      bonusesEnabled: true,
    });
    await startAndCountdown(engine, deps);

    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(11))).toEqual({ ok: true });
    tickAfter(deps, engine, RACE_TICK_BROADCAST_INTERVAL_MS);
    expect(bonusesOf(deps)).toHaveLength(1);
    expect(bonusesOf(deps)[0]).toMatchObject({
      targetParticipantId: BOB_PUBLIC_ID,
      bonusType: 'fog',
      payload: { durationMs: 2_000, totalLength: DEFAULT_BODY.length },
    });

    // Seed 5, event 1: addWords with " nain nain forge" (16 chars): 43 → 59.
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(22))).toEqual({ ok: true });
    tickAfter(deps, engine, RACE_TICK_BROADCAST_INTERVAL_MS);
    expect(bonusesOf(deps)).toHaveLength(2);
    expect(bonusesOf(deps)[1]).toMatchObject({
      bonusType: 'addWords',
      payload: { words: ['nain', 'nain', 'forge'], totalLength: DEFAULT_BODY.length + 16 },
    });

    // 75 % of the grown text (59 chars) needs >= 44.25 validated chars.
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(45))).toEqual({ ok: true });
    tickAfter(deps, engine, RACE_TICK_BROADCAST_INTERVAL_MS);
    expect(bonusesOf(deps)).toHaveLength(3);
    expect(bonusesOf(deps)[2]).toMatchObject({
      bonusType: 'fog',
      payload: { totalLength: DEFAULT_BODY.length + 16 },
    });

    // The fog never moved the finish line; only the addWords did (43 → 59).
    const bobTick = latestTickEntry(deps, BOB_PUBLIC_ID);
    expect(bobTick?.totalLength).toBe(DEFAULT_BODY.length + 16);

    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(DEFAULT_BODY.length + 16))).toEqual(
      { ok: true },
    );
    expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(43))).toEqual({ ok: true });
    expect(
      engine.handleRaceProgress(ROOM_ID, `guest:${GUEST_TOKEN}`, progress(DEFAULT_BODY.length)),
    ).toEqual({ ok: true });
    walkToFinish(deps, engine);
    const finished = deps.messagesOf(ROOM_ID, 'raceFinished');
    expect(finished).toHaveLength(1);
    expect(
      finished[0].results.find((entry) => entry.participantId === BOB_PUBLIC_ID)?.bonusesReceived,
    ).toBe(3);
  });

  test('deterministic from the race seed: two engines replay identical bonus events (BOT-05)', async () => {
    /** Runs the full scripted race against a fresh engine and returns it. */
    const run = async () => {
      const { engine, deps } = makeEngine();
      deps.room = roomData({
        ...defaultRoomConfig,
        timeLimitSeconds: null,
        bonusesEnabled: true,
        bots: [{ level: 'noob', count: 1 }],
      });
      await startAndCountdown(engine, deps);
      expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(11))).toEqual({ ok: true });
      tickAfter(deps, engine, RACE_TICK_BROADCAST_INTERVAL_MS);
      expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(31))).toEqual({ ok: true });
      tickAfter(deps, engine, RACE_TICK_BROADCAST_INTERVAL_MS);
      expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(46))).toEqual({ ok: true });
      tickAfter(deps, engine, RACE_TICK_BROADCAST_INTERVAL_MS);
      expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(GROWN))).toEqual({ ok: true });
      expect(engine.handleRaceProgress(ROOM_ID, 'user:7', progress(15))).toEqual({ ok: true });
      expect(
        engine.handleRaceProgress(ROOM_ID, `guest:${GUEST_TOKEN}`, progress(DEFAULT_BODY.length)),
      ).toEqual({ ok: true });
      walkToFinish(deps, engine);
      return deps;
    };

    // Two engines run the same synchronous clock steps with the same seed:
    // the wire events and the persisted payloads must replay byte for byte.
    const first = await run();
    const second = await run();

    const eventsOf = (deps: FakeDeps) =>
      deps
        .messagesOf(ROOM_ID, 'bonusApplied')
        .map((message) => ({
          type: message.bonusType,
          target: message.targetParticipantId,
          payload: message.payload,
        }));
    expect(eventsOf(second)).toEqual(eventsOf(first));

    const persistedOf = (deps: FakeDeps) =>
      deps.persistedResults[0].results.map((result) => ({
        participantId: result.participantId,
        bonusesReceived: result.bonusesReceived,
        status: result.status,
        rank: result.rank,
      }));
    expect(persistedOf(second)).toEqual(persistedOf(first));
  });

  test('bonusesEnabled: false keeps the race on the base text (CONF-09)', async () => {
    const { engine, deps } = makeEngine();
    deps.room = roomData({ ...defaultRoomConfig, timeLimitSeconds: null, bonusesEnabled: false });
    await startAndCountdown(engine, deps);

    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(11))).toEqual({ ok: true });
    tickAfter(deps, engine, RACE_TICK_BROADCAST_INTERVAL_MS);
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(43))).toEqual({ ok: true });

    expect(bonusesOf(deps)).toHaveLength(0);
    const bobTick = latestTickEntry(deps, BOB_PUBLIC_ID);
    expect(bobTick?.totalLength).toBe(DEFAULT_BODY.length);
    expect(deps.pickBonusWordPoolCalls).toHaveLength(0);
  });

  test('the word pool is loaded exactly once at start and addWords uses it', async () => {
    const { engine, deps } = makeEngine();
    deps.room = roomData({
      ...defaultRoomConfig,
      timeLimitSeconds: null,
      bonusesEnabled: true,
    });
    await startAndCountdown(engine, deps);
    expect(deps.pickBonusWordPoolCalls).toHaveLength(1);
    expect(deps.pickBonusWordPoolCalls[0].textLanguage).toBe('fr');

    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(11))).toEqual({ ok: true });
    tickAfter(deps, engine, RACE_TICK_BROADCAST_INTERVAL_MS);
    expect(bonusesOf(deps)).toHaveLength(1);
    expect(deps.pickBonusWordPoolCalls).toHaveLength(1); // never re-loaded mid-race
  });

  test('a reconnecting member resumes with their own bonus-adjusted text (BONUS-04)', async () => {
    const { engine, deps } = makeEngine();
    deps.room = roomData({ ...defaultRoomConfig, timeLimitSeconds: null, bonusesEnabled: true });
    await startAndCountdown(engine, deps);

    // Seed 42, first checkpoint: addWords on the leader (bob), 43 → 61 chars.
    expect(engine.handleRaceProgress(ROOM_ID, 'user:8', progress(11))).toEqual({ ok: true });
    tickAfter(deps, engine, RACE_TICK_BROADCAST_INTERVAL_MS);
    expect(bonusesOf(deps)).toHaveLength(1);

    // The spectator resumes with the shared base text and length.
    const spectator = engine.raceSnapshotFor(ROOM_ID, 'user:9');
    expect(spectator?.text).toBe(DEFAULT_BODY);
    expect(spectator?.totalLength).toBe(DEFAULT_BODY.length);

    // The targeted racer resumes with his GROWN text: the local typing zone
    // rebuilds from exactly this text, so its completion check stays coherent
    // with the server's effective length after a mid-race reconnect.
    expect(engine.rejoinRace(ROOM_ID, 'user:8')).toEqual({ ok: true });
    const bob = engine.raceSnapshotFor(ROOM_ID, 'user:8');
    expect(bob?.text).toBe(`${DEFAULT_BODY} tunnel forge nain`);
    expect(bob?.totalLength).toBe(GROWN);
  });
});
