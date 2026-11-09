import type { RoomConfig } from '../db/schema';
import {
  RateLimitExceededError,
  SlidingWindowRateLimiter,
} from '../lib/rate-limit';
import {
  advance,
  createRace,
  finishParticipant,
  RaceTransitionError,
  requestStart,
  textVisibleForPhase,
  type ParticipantFinalState,
  type ParticipantKind,
  type RacePhase,
  type RaceState,
  type RaceText,
} from '../lib/race/state';
import { collectRaceParticipants } from '../lib/race/start-rules';
import { accuracy, netWpm, rawWpm } from '../lib/race/stats';
import type {
  CountdownStartedMessage,
  RaceFinishedMessage,
  RaceSnapshotMessage,
  RaceTickMessage,
  RaceTickParticipant,
  ServerMessage,
  WpmSeriesPoint,
} from './protocol';

/**
 * Authoritative in-memory race engine (COURSE-05/06/07/08/09/10, GAME-4/5,
 * PERF-02, SEC-01).
 *
 * The engine is transport-agnostic: it sits on the hub's room/member
 * abstractions and knows nothing about `ws`. All I/O crosses the
 * {@link RaceEngineDeps} seam — the room snapshot (members + config + host),
 * the text picker, the `rooms.status` persistence and the room broadcast —
 * which the realtime wiring implements over PostgreSQL and the
 * {@link import('./hub').RoomHub}. The pure machine
 * (`src/lib/race/state.ts`) stays authoritative for phases and guards; this
 * module feeds it snapshots, applies the transport rules (rate caps, tick
 * aggregation, reconnect window, AFK timeout) and broadcasts the results.
 *
 * ## Rules implemented here
 *
 * - **Start (SEC-01, COURSE-02/03):** only the room host may start; the
 *   participants come from `collectRaceParticipants` over the current
 *   members; the text is picked coherently or generated from a random seed
 *   recorded in the race state; `rooms.status` moves to `decompte` and
 *   `countdownStarted` reveals the full text.
 * - **Tick loop:** a clock-injected interval (~250 ms) advances the machine
 *   and broadcasts `raceTick` at most every {@link RACE_TICK_BROADCAST_INTERVAL_MS}
 *   (≈4/s — well inside PERF-02's ≤10 msg/s cap, the client interpolates).
 * - **Progress validation (COURSE-06):** cumulative counters only —
 *   monotonic non-decreasing, `validatedChars ≤ totalLength`,
 *   `correctKeystrokes ≤ totalKeystrokes`, `validatedChars ≤ totalKeystrokes`
 *   (you cannot validate more than you typed), and no validatedChars jump
 *   larger than {@link RACE_PROGRESS_MAX_DELTA} per message. Per-participant
 *   message rate is capped at {@link RACE_PROGRESS_MAX_PER_SECOND} per
 *   second (PERF-02); excess messages are dropped with
 *   `progress_rate_exceeded`.
 * - **Finish/quit:** reaching `totalLength` auto-finishes
 *   (`participantFinished` with the finish-order rank); `quitRace` records
 *   the abandon, broadcasts `participantQuit`, and the participant stays in
 *   the room as a spectator (RACE-6).
 * - **Reconnection (COURSE-08, GAME-4):** while a member races, a dropped
 *   socket keeps the membership for {@link RACE_RECONNECT_WINDOW_MS}. A
 *   `rejoinRace` inside the window resumes with the stored counters (the
 *   engine keeps full state and answers with `raceSnapshot`); after the
 *   window the participant is recorded as `quit` (abandon).
 * - **AFK (GAME-5):** no accepted progress from any participant for
 *   {@link RACE_AFK_TIMEOUT_MS} aborts the race: `raceAborted` is broadcast,
 *   the room returns to `en_attente` and **no ranking is produced** (the
 *   results are NOT ranked as a finish — interpretation documented here and
 *   in `doc/ARCHITECTURE.md`).
 * - **Ranking (COURSE-10):** finishers by finish time, then timeouts by
 *   progression, then quits by progression at the moment of quitting.
 *   Computed server-side at the `en_course → resultats` transition.
 *
 * ## Persistence seam (Phase 3)
 *
 * The engine keeps the final {@link RaceResultsPayload} in memory for the
 * room's lifetime ({@link takeResults}); persisting it to PostgreSQL
 * (`races`/race history, RES-05) is SP-3B's job — it consumes this payload
 * and the WPM series the tick loop already aggregates.
 */

/** Engine clock interval: how often the state machine is advanced. */
export const RACE_ENGINE_TICK_MS = 250;

/** Minimum delay between two `raceTick` broadcasts (≈4/s, COURSE-05). */
export const RACE_TICK_BROADCAST_INTERVAL_MS = 250;

/** COURSE-06: largest accepted validatedChars jump in a single message. */
export const RACE_PROGRESS_MAX_DELTA = 100;

/** PERF-02: at most ~10 progress messages per second per participant. */
export const RACE_PROGRESS_MAX_PER_SECOND = 10;
export const RACE_PROGRESS_RATE_WINDOW_MS = 1_000;

/** COURSE-08: a dropped mid-race socket keeps its slot for 30 s. */
export const RACE_RECONNECT_WINDOW_MS = 30_000;

/** GAME-5: global inactivity timeout — no accepted progress for 60 s. */
export const RACE_AFK_TIMEOUT_MS = 60_000;

/**
 * RES-03/05: hard cap on the per-participant WPM series. Sampling is at most
 * once per `raceTick` broadcast (≤ ~4/s), so a 10-minute race tops out at
 * ~2400 points — the cap is a defensive bound, never hit in practice.
 */
export const RACE_WPM_SERIES_MAX_POINTS = 2_400;

export const RACE_ABORT_REASON_AFK = 'afk_timeout';
export const RACE_ABORT_REASON_HOST_CLOSED = 'host_closed';

/** Machine-readable failure codes the engine reports (protocol `WsErrorCode` subset). */
export type RaceEngineErrorCode =
  | 'not_host'
  | 'race_already_running'
  | 'not_in_race'
  | 'invalid_progress'
  | 'progress_rate_exceeded'
  | 'race_not_running'
  | 'room_not_found';

export type RaceEngineOutcome =
  | { ok: true }
  | { ok: false; code: RaceEngineErrorCode; message?: string };

/**
 * One present member as the engine needs it. Built by the wiring from
 * `getRoomForJoin` plus the hub's live identities (a guest's display name
 * lives in the signed cookie, not in the database).
 */
export type RaceEngineMember = {
  /** Internal membership id — participant key inside the engine, never on the wire. */
  memberId: number;
  role: string;
  userId: number | null;
  guestToken: string | null;
  /** Wire identity: the user's public id or the guest token (both UUIDs). */
  publicId: string;
  displayName: string;
  /** Hub membership key (`user:<id>` / `guest:<token>`). */
  hubKey: string;
};

/** Room snapshot the wiring loads when a race starts. */
export type RaceEngineRoomData = {
  publicId: string;
  config: RoomConfig;
  hostUserId: number;
  members: RaceEngineMember[];
};

/** Progress counters kept per participant (COURSE-06 cumulative values). */
export type RaceEngineProgress = {
  validatedChars: number;
  correctKeystrokes: number;
  totalKeystrokes: number;
};

/**
 * Everything the wiring must provide. Every async piece is a seam so the
 * engine is fully testable with fakes; the production wiring
 * (`src/realtime/server.ts`) implements them over the room queries and the
 * hub.
 */
export type RaceEngineDeps = {
  now(): Date;
  loadRoom(roomId: number): Promise<RaceEngineRoomData | null>;
  /** Picks the race text; `null` when the corpus/dictionary cannot provide one. */
  pickText(config: RoomConfig, seed: number): Promise<RaceText | null>;
  /** Persists `rooms.status` on every phase change (COURSE-01). */
  persistStatus(roomId: number, status: RacePhase): Promise<void>;
  /** Broadcasts one message to every live connection of the room. */
  broadcast(roomId: number, message: ServerMessage): void;
  /** Random seed for random-mode texts (recorded in the race state, BOT-05-style). */
  randomSeed(): number;
};

/**
 * Callbacks the {@link import('./hub').RoomHub} invokes so a mid-race
 * disconnect keeps its membership slot (COURSE-08) instead of applying the
 * normal departure path.
 */
export type RaceEngineHooks = {
  /** True when the departing membership must be kept (active racer, no result). */
  keepMembershipOnDisconnect(roomId: number, memberKey: string): boolean;
  /** The kept membership's socket dropped: start the 30 s window. */
  notifyDisconnected(roomId: number, memberKey: string): void;
  /** The membership re-attached a live connection (join/rejoin). */
  notifyReconnected(roomId: number, memberKey: string): void;
  /** The room was closed: drop its in-memory race. */
  notifyRoomClosed(roomId: number): void;
}

/** One ranked result line kept in memory for the room's lifetime. */
export type RaceEngineResultEntry = {
  /** Wire identity (user public id / guest token). */
  participantId: string;
  /** Internal participant key (for Phase-3 persistence). */
  memberId: string;
  /** Internal user id for `kind: 'user'`; `null` otherwise. Never on the wire. */
  userId: number | null;
  /** Guest cookie id for `kind: 'guest'`; `null` otherwise. Never on the wire. */
  guestToken: string | null;
  displayName: string;
  kind: ParticipantKind;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  errors: number;
  /** Cumulative correct keystrokes at the participant's end (stats; not on the wire). */
  correctKeystrokes: number;
  /** Cumulative total keystrokes at the participant's end (stats; not on the wire). */
  totalKeystrokes: number;
  status: ParticipantFinalState;
  /** Milliseconds after the typing start at which the status was recorded. */
  endedAtMs: number;
  endedAt: Date;
  /** Validated characters at the moment the status was recorded (COURSE-10). */
  progressChars: number;
  rank: number;
  /**
   * WPM-over-time series for the results charts (RES-03); sampled at most
   * once per tick broadcast and closed by a final sample at `endedAtMs`.
   * SP-3B persists it alongside the rest of the payload (RES-05).
   */
  wpmSeries: WpmSeriesPoint[];
};

/**
 * The in-memory results payload SP-3B persists (RES-05). It stays here,
 * keyed by room, for the room's lifetime, and carries everything the race
 * history needs: the room routing id, the text, the config snapshot taken at
 * start and the per-participant identity and counters.
 */
export type RaceResultsPayload = {
  roomId: number;
  /** Room public id at finish — denormalized onto the persisted race row. */
  roomPublicId: string;
  /** Full text body typed in this race (history replay). */
  textBody: string;
  /** ISO 639-1 language of the text (config snapshot). */
  textLanguage: string;
  /** Race config snapshot taken at start (CONF-12). */
  config: RoomConfig;
  /** Typing start (countdown end); `durationMs` is measured from it. */
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  results: RaceEngineResultEntry[];
};

/** Per-participant runtime data layered next to the pure machine state. */
type ParticipantRuntime = {
  memberId: string;
  hubKey: string;
  publicId: string;
  kind: ParticipantKind;
  displayName: string;
  /** Internal user id for user participants (persistence identity). */
  userId: number | null;
  /** Guest cookie id for guest participants (persistence identity). */
  guestToken: string | null;
  progress: RaceEngineProgress;
  connected: boolean;
  /** Timestamp (ms) of the socket drop, while the reconnect window runs. */
  disconnectedAt: number | null;
  rateLimiter: SlidingWindowRateLimiter;
  /** WPM-over-time samples (RES-03), appended at tick-broadcast rate. */
  wpmSeries: WpmSeriesPoint[];
};

/** One room's race: the pure machine state plus the transport runtime data. */
type RoomRace = {
  roomId: number;
  publicId: string;
  state: RaceState;
  /** By participant memberId; built fresh on every start from the members. */
  runtimes: Map<string, ParticipantRuntime>;
  /** hubKey → memberId. */
  byHubKey: Map<string, string>;
  /** Seed of the random-mode text, recorded for reproducibility; null otherwise. */
  textSeed: number | null;
  /** Last `raceTick` broadcast, ms. */
  lastTickAt: number;
  /** Last accepted progress from any participant, ms (GAME-5). */
  lastActivityAt: number;
  /** Finish order (memberIds) for the provisional `rank` on `participantFinished`. */
  finishOrder: string[];
  /** Validated characters at the moment each participant finished/quit/timed out. */
  progressAtEnd: Map<string, number>;
  /** Final ranking, kept in memory after `resultats` (Phase-3 seam). */
  finalResults: RaceResultsPayload | null;
};

function zeroProgress(): RaceEngineProgress {
  return { validatedChars: 0, correctKeystrokes: 0, totalKeystrokes: 0 };
}

function hasResult(state: RaceState, memberId: string): boolean {
  return state.results.some((result) => result.memberId === memberId);
}

function mapStartError(error: RaceTransitionError): RaceEngineOutcome {
  if (error.code === 'not_host') {
    return { ok: false, code: 'not_host', message: error.message };
  }
  return { ok: false, code: 'race_not_running', message: error.message };
}

export class RaceEngine implements RaceEngineHooks {
  private readonly rooms = new Map<number, RoomRace>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: RaceEngineDeps) {}

  /** Starts the tick loop (idempotent). The interval is unref'd (tests, shutdown). */
  start(): void {
    this.stop();
    this.timer = setInterval(() => {
      this.tick();
    }, RACE_ENGINE_TICK_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Number of rooms with an in-memory race (tests + monitoring). */
  roomCount(): number {
    return this.rooms.size;
  }

  /** Current phase of a room's race, or `null` when the room never raced. */
  getPhase(roomId: number): RacePhase | null {
    return this.rooms.get(roomId)?.state.phase ?? null;
  }

  // ------------------------------------------------------------------ hooks

  keepMembershipOnDisconnect(roomId: number, memberKey: string): boolean {
    const entry = this.rooms.get(roomId);
    if (!entry) {
      return false;
    }
    const phase = entry.state.phase;
    if (phase !== 'decompte' && phase !== 'en_course') {
      return false;
    }
    const memberId = entry.byHubKey.get(memberKey);
    const runtime = memberId ? entry.runtimes.get(memberId) : undefined;
    if (!memberId || !runtime) {
      return false;
    }
    return !hasResult(entry.state, memberId);
  }

  notifyDisconnected(roomId: number, memberKey: string): void {
    const entry = this.rooms.get(roomId);
    if (!entry) {
      return;
    }
    const memberId = entry.byHubKey.get(memberKey);
    const runtime = memberId ? entry.runtimes.get(memberId) : undefined;
    if (!memberId || !runtime || hasResult(entry.state, memberId)) {
      return;
    }
    runtime.connected = false;
    runtime.disconnectedAt = this.deps.now().getTime();
  }

  notifyReconnected(roomId: number, memberKey: string): void {
    const entry = this.rooms.get(roomId);
    if (!entry) {
      return;
    }
    const memberId = entry.byHubKey.get(memberKey);
    const runtime = memberId ? entry.runtimes.get(memberId) : undefined;
    if (!runtime) {
      return;
    }
    runtime.connected = true;
    runtime.disconnectedAt = null;
  }

  notifyRoomClosed(roomId: number): void {
    this.rooms.delete(roomId);
  }

  // ------------------------------------------------------------- start race

  /**
   * COURSE-02/03, SEC-01: the host starts a race from EN_ATTENTE (a finished
   * race on the results screen is relaunched with the same entry point and
   * freshly collected participants). Rejected while the race is already in
   * DÉCOMPTE/EN_COURSE (`race_already_running`).
   */
  async startRace(roomId: number, actorHubKey: string): Promise<RaceEngineOutcome> {
    const existing = this.rooms.get(roomId);
    if (
      existing &&
      (existing.state.phase === 'decompte' || existing.state.phase === 'en_course')
    ) {
      return { ok: false, code: 'race_already_running' };
    }

    const room = await this.deps.loadRoom(roomId);
    if (!room) {
      return { ok: false, code: 'room_not_found' };
    }

    // SEC-01: only the host may start. The host is a logged-in user
    // (`rooms.hostUserId`), so its hub key is `user:<internalId>`.
    if (actorHubKey !== `user:${room.hostUserId}`) {
      return { ok: false, code: 'not_host' };
    }

    const participants = collectRaceParticipants(
      room.members.map((member) => ({
        memberId: member.memberId,
        role: member.role,
        userId: member.userId,
        guestToken: member.guestToken,
        displayName: member.displayName,
      })),
    );

    const seed = this.deps.randomSeed();
    const text = await this.deps.pickText(room.config, seed);
    if (!text) {
      return {
        ok: false,
        code: 'race_not_running',
        message: 'no race text available for this configuration',
      };
    }

    const now = this.deps.now();
    let started: RaceState;
    try {
      started = requestStart(
        createRace({ participants, config: room.config }),
        now,
        { isHost: true },
        text,
      );
    } catch (error) {
      if (error instanceof RaceTransitionError) {
        return mapStartError(error);
      }
      throw error;
    }

    // Fresh runtimes on every start: progress never leaks across races.
    const runtimes = new Map<string, ParticipantRuntime>();
    const byHubKey = new Map<string, string>();
    for (const member of room.members) {
      if (member.role === 'spectator') {
        continue;
      }
      const memberId = String(member.memberId);
      runtimes.set(memberId, {
        memberId,
        hubKey: member.hubKey,
        publicId: member.publicId,
        kind: member.userId !== null ? 'user' : 'guest',
        displayName: member.displayName,
        userId: member.userId,
        guestToken: member.guestToken,
        progress: zeroProgress(),
        connected: true,
        disconnectedAt: null,
        rateLimiter: new SlidingWindowRateLimiter({
          maxAttempts: RACE_PROGRESS_MAX_PER_SECOND,
          windowMs: RACE_PROGRESS_RATE_WINDOW_MS,
          now: () => this.deps.now().getTime(),
        }),
        wpmSeries: [],
      });
      byHubKey.set(member.hubKey, memberId);
    }

    const entry: RoomRace = {
      roomId,
      publicId: room.publicId,
      state: started,
      runtimes,
      byHubKey,
      textSeed: room.config.textType === 'random' ? seed : null,
      lastTickAt: started.startAt?.getTime() ?? now.getTime(),
      lastActivityAt: started.startAt?.getTime() ?? now.getTime(),
      finishOrder: [],
      progressAtEnd: new Map(),
      finalResults: null,
    };
    this.rooms.set(roomId, entry);

    // A status write failure must not prevent the race from starting; the
    // next phase change retries and the hub state remains authoritative.
    this.persistStatusLogged(roomId, 'decompte');
    this.deps.broadcast(roomId, this.buildCountdown(entry));
    return { ok: true };
  }

  // ------------------------------------------------------------------ ticks

  /** One clock tick over every room: reconnect deadlines, AFK, tick broadcast, advance. */
  tick(): void {
    const now = this.deps.now();
    for (const [roomId, entry] of this.rooms) {
      this.advanceRoom(roomId, entry, now);
    }
  }

  /**
   * Applies whichever boundary `now` crossed (single place where the clock
   * decides, mirroring the pure machine's `advance`) plus the engine's
   * transport rules: reconnect-window abandons, GAME-5 AFK abort, tick
   * aggregation and the `raceFinished` broadcast with the COURSE-10 ranking.
   */
  private advanceRoom(roomId: number, entry: RoomRace, now: Date): void {
    const before = entry.state;

    if (before.phase === 'decompte') {
      const next = advance(before, now);
      if (next !== before) {
        entry.state = next;
        this.persistStatusLogged(roomId, 'en_course');
        this.deps.broadcast(roomId, {
          type: 'raceStarted',
          roomPublicId: entry.publicId,
          startAt: next.startAt?.toISOString() ?? now.toISOString(),
        });
      }
      return;
    }

    if (before.phase === 'en_course') {
      // COURSE-08: abandons whose reconnect window has expired.
      for (const runtime of entry.runtimes.values()) {
        if (
          runtime.disconnectedAt !== null &&
          !hasResult(entry.state, runtime.memberId) &&
          now.getTime() - runtime.disconnectedAt >= RACE_RECONNECT_WINDOW_MS
        ) {
          const quit = finishParticipant(entry.state, runtime.memberId, now, 'quit');
          if (quit !== entry.state) {
            entry.state = quit;
            entry.progressAtEnd.set(runtime.memberId, runtime.progress.validatedChars);
            this.deps.broadcast(roomId, {
              type: 'participantQuit',
              roomPublicId: entry.publicId,
              participantId: runtime.publicId,
            });
          }
        }
      }

      // GAME-5: global inactivity aborts the race (no ranking is produced).
      if (now.getTime() - entry.lastActivityAt >= RACE_AFK_TIMEOUT_MS) {
        this.abortRace(roomId, entry, RACE_ABORT_REASON_AFK);
        return;
      }

      // COURSE-05/PERF-02: aggregated track update, at most ~4/s.
      if (now.getTime() - entry.lastTickAt >= RACE_TICK_BROADCAST_INTERVAL_MS) {
        entry.lastTickAt = now.getTime();
        this.deps.broadcast(roomId, this.buildTick(entry, now));
      }

      const next = advance(entry.state, now);
      if (next !== entry.state) {
        entry.state = next;
        // `advance` recorded the timeouts; snapshot their progression.
        for (const result of next.results) {
          if (result.finalState === 'timeout' && !entry.progressAtEnd.has(result.memberId)) {
            const runtime = entry.runtimes.get(result.memberId);
            entry.progressAtEnd.set(result.memberId, runtime?.progress.validatedChars ?? 0);
          }
        }
        // RES-03: close every series with the exact final sample (the last
        // tick broadcast can be up to ~250 ms behind the participant's end).
        const startMs = next.startAt?.getTime() ?? 0;
        for (const result of next.results) {
          const elapsedMs = Math.max(0, result.endedAt.getTime() - startMs);
          this.appendSeriesSample(entry, result.memberId, {
            elapsedMs,
            wpm: netWpm({
              correctChars: entry.progressAtEnd.get(result.memberId) ?? 0,
              elapsedMs,
            }),
            final: true,
          });
        }
        entry.finalResults = this.computeResults(entry, next);
        this.persistStatusLogged(roomId, 'resultats');
        this.deps.broadcast(roomId, this.buildRaceFinished(entry));
      }
    }
  }

  // -------------------------------------------------------------- progress

  /**
   * COURSE-06/PERF-02: applies one cumulative progress message after the
   * plausibility checks (monotonicity, text length, keystroke consistency,
   * per-message delta cap) and the per-participant rate cap. Reaching
   * `totalLength` auto-finishes the participant.
   */
  handleRaceProgress(
    roomId: number,
    hubKey: string,
    payload: RaceEngineProgress,
  ): RaceEngineOutcome {
    const entry = this.rooms.get(roomId);
    if (!entry || entry.state.phase !== 'en_course') {
      return { ok: false, code: 'race_not_running' };
    }
    const memberId = entry.byHubKey.get(hubKey);
    const runtime = memberId ? entry.runtimes.get(memberId) : undefined;
    if (!memberId || !runtime) {
      return { ok: false, code: 'not_in_race' };
    }
    // A finished, quit or timed-out participant is a spectator of this race.
    if (hasResult(entry.state, memberId)) {
      return { ok: false, code: 'not_in_race' };
    }

    try {
      runtime.rateLimiter.check('progress');
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        return { ok: false, code: 'progress_rate_exceeded' };
      }
      throw error;
    }

    const totalLength = entry.state.chosenText?.body.length ?? 0;
    const previous = runtime.progress;
    const invalid =
      payload.validatedChars > totalLength ||
      payload.validatedChars < previous.validatedChars ||
      payload.validatedChars - previous.validatedChars > RACE_PROGRESS_MAX_DELTA ||
      payload.correctKeystrokes < previous.correctKeystrokes ||
      payload.totalKeystrokes < previous.totalKeystrokes ||
      payload.correctKeystrokes > payload.totalKeystrokes ||
      payload.validatedChars > payload.totalKeystrokes;
    if (invalid) {
      return { ok: false, code: 'invalid_progress' };
    }

    runtime.progress = { ...payload };
    entry.lastActivityAt = this.deps.now().getTime();

    if (payload.validatedChars >= totalLength) {
      const now = this.deps.now();
      const finished = finishParticipant(entry.state, memberId, now, 'finished');
      if (finished !== entry.state) {
        entry.state = finished;
        entry.progressAtEnd.set(memberId, payload.validatedChars);
        entry.finishOrder.push(memberId);
        this.deps.broadcast(roomId, {
          type: 'participantFinished',
          roomPublicId: entry.publicId,
          participantId: runtime.publicId,
          rank: entry.finishOrder.length,
        });
        this.advanceRoom(roomId, entry, now);
      }
    }

    return { ok: true };
  }

  /**
   * COURSE-07: the participant abandons and instantly becomes a spectator of
   * the current race, staying in the room (RACE-6). Idempotent.
   */
  quitRace(roomId: number, hubKey: string): RaceEngineOutcome {
    const entry = this.rooms.get(roomId);
    if (!entry || entry.state.phase !== 'en_course') {
      return { ok: false, code: 'race_not_running' };
    }
    const memberId = entry.byHubKey.get(hubKey);
    const runtime = memberId ? entry.runtimes.get(memberId) : undefined;
    if (!memberId || !runtime) {
      return { ok: false, code: 'not_in_race' };
    }
    if (hasResult(entry.state, memberId)) {
      return { ok: true };
    }

    const now = this.deps.now();
    const quit = finishParticipant(entry.state, memberId, now, 'quit');
    if (quit !== entry.state) {
      entry.state = quit;
      entry.progressAtEnd.set(memberId, runtime.progress.validatedChars);
      this.deps.broadcast(roomId, {
        type: 'participantQuit',
        roomPublicId: entry.publicId,
        participantId: runtime.publicId,
      });
      this.advanceRoom(roomId, entry, now);
    }
    return { ok: true };
  }

  // ------------------------------------------------------------ reconnection

  /**
   * COURSE-08, GAME-4: a mid-race reconnect. Clears the abandon timer so the
   * participant resumes with their stored counters; the wiring answers with
   * {@link raceSnapshotFor}. Idempotent for participants who already ended.
   */
  rejoinRace(roomId: number, hubKey: string): RaceEngineOutcome {
    const entry = this.rooms.get(roomId);
    if (!entry) {
      return { ok: false, code: 'race_not_running' };
    }
    const memberId = entry.byHubKey.get(hubKey);
    const runtime = memberId ? entry.runtimes.get(memberId) : undefined;
    if (!memberId || !runtime) {
      return { ok: false, code: 'not_in_race' };
    }
    runtime.connected = true;
    runtime.disconnectedAt = null;
    return { ok: true };
  }

  /**
   * The resume payload for a (re)joining member: current phase, the text
   * when the phase reveals it (COURSE-03) and the member's own cumulative
   * progress — `null` for spectators and for participants who already ended.
   * Returns `null` when the room has no live race snapshot to resume.
   */
  raceSnapshotFor(roomId: number, hubKey: string): RaceSnapshotMessage | null {
    const entry = this.rooms.get(roomId);
    if (!entry) {
      return null;
    }
    const { state } = entry;
    if (state.phase !== 'decompte' && state.phase !== 'en_course' && state.phase !== 'resultats') {
      return null;
    }

    const memberId = entry.byHubKey.get(hubKey);
    const runtime = memberId ? entry.runtimes.get(memberId) : undefined;
    const racing = runtime !== undefined && !hasResult(state, runtime.memberId);
    const visible = textVisibleForPhase(state.phase) && state.chosenText !== null;

    return {
      type: 'raceSnapshot',
      roomPublicId: entry.publicId,
      phase: state.phase,
      startedAt: state.startedAt?.toISOString() ?? null,
      startAt: state.startAt?.toISOString() ?? null,
      textId: visible ? (state.chosenText as NonNullable<RaceState['chosenText']>).id : null,
      text: visible ? (state.chosenText as NonNullable<RaceState['chosenText']>).body : null,
      totalLength: visible
        ? (state.chosenText as NonNullable<RaceState['chosenText']>).body.length
        : null,
      progress: racing && runtime ? { ...runtime.progress } : null,
    };
  }

  /**
   * Phase-3 seam: the final ranking kept in memory for the room's lifetime.
   * SP-3B persists this payload (RES-05); nothing here writes to the
   * database. `null` before the race reached `resultats`.
   */
  takeResults(roomId: number): RaceResultsPayload | null {
    return this.rooms.get(roomId)?.finalResults ?? null;
  }

  // ---------------------------------------------------------------- helpers

  private buildCountdown(entry: RoomRace): CountdownStartedMessage {
    const text = entry.state.chosenText as NonNullable<RaceState['chosenText']>;
    const startAt = entry.state.startAt as NonNullable<RaceState['startAt']>;
    return {
      type: 'countdownStarted',
      roomPublicId: entry.publicId,
      startAt: startAt.toISOString(),
      textId: text.id,
      text: text.body,
      totalLength: text.body.length,
    };
  }

  private buildTick(entry: RoomRace, now: Date): RaceTickMessage {
    const startMs = entry.state.startAt?.getTime() ?? now.getTime();
    const elapsedMs = Math.max(0, now.getTime() - startMs);
    const ended = new Set(entry.state.results.map((result) => result.memberId));

    const participants: RaceTickParticipant[] = [];
    for (const participant of entry.state.participants) {
      const runtime = entry.runtimes.get(participant.memberId);
      if (!runtime) {
        // Bots arrive in Phase 4 as state participants without a member
        // runtime; the tick still broadcasts them from the machine's view.
        continue;
      }
      const wpm = netWpm({ correctChars: runtime.progress.validatedChars, elapsedMs });
      participants.push({
        participantId: runtime.publicId,
        kind: participant.kind,
        displayName: participant.displayName,
        position: runtime.progress.validatedChars,
        wpm,
        finished: ended.has(participant.memberId),
      });
      // RES-03: sample the WPM series at tick-broadcast rate (≤ ~4/s). The
      // series is NEVER part of the tick payload itself (PERF-02).
      this.appendSeriesSample(entry, participant.memberId, { elapsedMs, wpm });
    }

    return {
      type: 'raceTick',
      roomPublicId: entry.publicId,
      tickAt: now.toISOString(),
      participants,
    };
  }

  /**
   * Appends one WPM sample to a participant's series (RES-03). Samples are
   * strictly time-ordered; a `final` sample at the participant's exact end
   * time overwrites a same-millisecond tick sample so the series' last point
   * always equals the ranked WPM. Bounded by
   * {@link RACE_WPM_SERIES_MAX_POINTS} (a defensive cap — the ~4/s sampling
   * rate keeps a 10-minute race at ≤ ~2400 points).
   */
  private appendSeriesSample(
    entry: RoomRace,
    memberId: string,
    sample: { elapsedMs: number; wpm: number; final?: boolean },
  ): void {
    const runtime = entry.runtimes.get(memberId);
    if (!runtime) {
      return;
    }
    const series = runtime.wpmSeries;
    const last = series[series.length - 1];
    if (last && last.elapsedMs > sample.elapsedMs) {
      return; // never go backwards in time
    }
    if (last && last.elapsedMs === sample.elapsedMs) {
      // A final sample at the same millisecond replaces the tick sample
      // (same elapsed time, fresher progress counters).
      if (sample.final) {
        series[series.length - 1] = { elapsedMs: sample.elapsedMs, wpm: sample.wpm };
      }
      return;
    }
    if (series.length >= RACE_WPM_SERIES_MAX_POINTS) {
      return;
    }
    series.push({ elapsedMs: sample.elapsedMs, wpm: sample.wpm });
  }

  /**
   * COURSE-10 ranking: finishers by finish time; then timeouts by
   * progression; then quits by progression at the moment of quitting
   * (ties by end time, earliest first).
   */
  private computeResults(entry: RoomRace, state: RaceState): RaceResultsPayload {
    const startMs = state.startAt?.getTime() ?? state.startedAt?.getTime() ?? 0;
    const finishedAtMs = state.finishedAt?.getTime() ?? this.deps.now().getTime();

    const progressionDesc = (a: { memberId: string; endedAt: Date }, b: { memberId: string; endedAt: Date }) => {
      const delta =
        (entry.progressAtEnd.get(b.memberId) ?? 0) - (entry.progressAtEnd.get(a.memberId) ?? 0);
      if (delta !== 0) {
        return delta;
      }
      return a.endedAt.getTime() - b.endedAt.getTime();
    };

    const finished = state.results
      .filter((result) => result.finalState === 'finished')
      .sort((a, b) => a.endedAt.getTime() - b.endedAt.getTime());
    const timeouts = state.results
      .filter((result) => result.finalState === 'timeout')
      .sort(progressionDesc);
    const quits = state.results
      .filter((result) => result.finalState === 'quit')
      .sort(progressionDesc);

    const ordered = [...finished, ...timeouts, ...quits];
    const results: RaceEngineResultEntry[] = ordered.map((result, index) => {
      const runtime = entry.runtimes.get(result.memberId);
      const elapsedMs = Math.max(0, result.endedAt.getTime() - startMs);
      const correctChars = entry.progressAtEnd.get(result.memberId) ?? 0;
      const totalChars = runtime?.progress.totalKeystrokes ?? 0;
      const correctKeystrokes = runtime?.progress.correctKeystrokes ?? 0;

      return {
        participantId: runtime?.publicId ?? result.memberId,
        memberId: result.memberId,
        userId: runtime?.userId ?? null,
        guestToken: runtime?.guestToken ?? null,
        displayName: runtime?.displayName ?? 'unknown',
        kind: runtime?.kind ?? 'user',
        wpm: netWpm({ correctChars, elapsedMs }),
        rawWpm: rawWpm({ totalChars, elapsedMs }),
        accuracy: accuracy({ correctKeystrokes, totalKeystrokes: totalChars }),
        errors: Math.max(0, totalChars - correctKeystrokes),
        correctKeystrokes,
        totalKeystrokes: totalChars,
        status: result.finalState,
        endedAtMs: elapsedMs,
        endedAt: result.endedAt,
        progressChars: correctChars,
        rank: index + 1,
        wpmSeries: runtime ? [...runtime.wpmSeries] : [],
      };
    });

    return {
      roomId: entry.roomId,
      roomPublicId: entry.publicId,
      textBody: state.chosenText?.body ?? '',
      textLanguage: state.config.textLanguage,
      config: state.config,
      startedAt: state.startAt ?? state.startedAt ?? new Date(startMs),
      finishedAt: state.finishedAt ?? new Date(finishedAtMs),
      durationMs: Math.max(0, finishedAtMs - startMs),
      results,
    };
  }

  private buildRaceFinished(entry: RoomRace): RaceFinishedMessage {
    const payload = entry.finalResults as NonNullable<RoomRace['finalResults']>;
    return {
      type: 'raceFinished',
      roomPublicId: entry.publicId,
      durationMs: payload.durationMs,
      results: payload.results.map((result) => ({
        participantId: result.participantId,
        displayName: result.displayName,
        kind: result.kind,
        wpm: result.wpm,
        rawWpm: result.rawWpm,
        accuracy: result.accuracy,
        errors: result.errors,
        status: result.status,
        finishedAtMs: result.endedAtMs,
        rank: result.rank,
        wpmSeries: result.wpmSeries,
      })),
    };
  }

  /**
   * GAME-5 / host-closed abort: the room returns to EN_ATTENTE with a fresh
   * machine state (same participants) and no ranking is produced — the
   * results are NOT ranked as a finish (documented interpretation).
   */
  private abortRace(roomId: number, entry: RoomRace, reason: string): void {
    entry.state = createRace({
      participants: entry.state.participants,
      config: entry.state.config,
    });
    entry.lastTickAt = 0;
    entry.lastActivityAt = this.deps.now().getTime();
    entry.finishOrder = [];
    entry.progressAtEnd.clear();
    entry.finalResults = null;
    this.persistStatusLogged(roomId, 'en_attente');
    this.deps.broadcast(roomId, {
      type: 'raceAborted',
      roomPublicId: entry.publicId,
      reason,
    });
  }

  /**
   * Fire-and-forget persistence from the engine (start and the sync tick
   * loop alike); failures are logged, never thrown into the race flow.
   */
  private persistStatusLogged(roomId: number, status: RacePhase): void {
    this.deps.persistStatus(roomId, status).catch((error: unknown) => {
      console.error(`race-engine: failed to persist rooms.status=${status} for room ${roomId}`, error);
    });
  }
}
