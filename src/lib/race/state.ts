import type { RoomConfig } from '../../db/schema';
import type { ComplexityLevel } from '../text-metrics';

/**
 * Pure race state machine (COURSE-01/02/03/09).
 *
 * The machine implements exactly
 *
 *   `EN_ATTENTE → DÉCOMPTE → EN_COURSE → RÉSULTATS → (EN_ATTENTE | FERMÉE)`
 *
 * as a set of pure, clock-injected transition functions over plain data. The
 * phase values are the `rooms.status` strings (`en_attente`, `decompte`,
 * `en_course`, `resultats`, `fermee`), so the in-memory race and the
 * persisted room can never disagree on the vocabulary; `start-rules.ts`
 * owns the room-status ↔ phase mapping.
 *
 * Design rules:
 *
 * - **No I/O, no transport.** The machine never reads the database or the
 *   WebSocket hub — the SP-2B wiring feeds it snapshots and broadcasts the
 *   results. `now` is always injected, so every transition is deterministic
 *   in tests.
 * - **Immutability.** Every transition returns a *new* state object; when
 *   nothing changed (`advance` before the clock crosses a boundary, a
 *   duplicate `finishParticipant`), it returns the *same* object reference,
 *   so callers can cheaply detect "no transition happened".
 * - **Errors are typed.** A rejected transition throws
 *   {@link RaceTransitionError} with a stable machine-readable `code`; the
 *   wiring maps codes to protocol errors or logs.
 */

export const RACE_PHASES = [
  'en_attente',
  'decompte',
  'en_course',
  'resultats',
  'fermee',
] as const;

/** A race phase; identical to the `rooms.status` CHECK values (COURSE-01). */
export type RacePhase = (typeof RACE_PHASES)[number];

/** Countdown length in seconds (COURSE-03: 3, 2, 1). */
export const COUNTDOWN_SECONDS = 3;
export const COUNTDOWN_MS = COUNTDOWN_SECONDS * 1_000;

/** COURSE-02: a race starts with at least 2 participants of which >= 1 human. */
export const MIN_RACE_PARTICIPANTS = 2;
export const MIN_HUMAN_PARTICIPANTS = 1;

/** Who is behind a participant: logged-in user, guest, or bot (BOT-01). */
export type ParticipantKind = 'user' | 'guest' | 'bot';

/**
 * One person on the race track. Spectators are carried so the machine can
 * keep a single participant list, but they never count towards the start
 * guards (COURSE-02), never block the end condition (COURSE-09) and can
 * never receive a result.
 */
export type RaceParticipant = {
  memberId: string;
  kind: ParticipantKind;
  /** Username for users, chosen nickname for guests and bots. */
  displayName: string;
  isSpectator: boolean;
};

/** The text the race is typed on (CONF-03). */
export type RaceText = {
  /** Corpus row id for coherent mode, `null` for generated random texts. */
  id: string | null;
  body: string;
  language: 'fr' | 'en';
  complexity: ComplexityLevel;
  wordCount: number;
};

/** How a participant's race ended (COURSE-09/10). */
export type ParticipantFinalState = 'finished' | 'quit' | 'timeout';

export type ParticipantResult = {
  memberId: string;
  finalState: ParticipantFinalState;
  /** When the finish, quit or timeout was recorded. */
  endedAt: Date;
};

export type RaceState = {
  phase: RacePhase;
  /** Snapshot of the room config the race runs under (COURSE-06). */
  config: RoomConfig;
  participants: RaceParticipant[];
  /**
   * The text chosen for this race. `null` while waiting; set by
   * `requestStart`, i.e. revealed from the very start of the countdown
   * (COURSE-03: `textVisibleForPhase`).
   */
  chosenText: RaceText | null;
  /** Countdown start — also the moment the text is revealed. */
  startedAt: Date | null;
  /** Typing start: the countdown end. The time limit is measured from here. */
  startAt: Date | null;
  /** Set when the race reaches `resultats`. */
  finishedAt: Date | null;
  /** One entry per racing participant that finished, quit or timed out. */
  results: ParticipantResult[];
};

export type RaceTransitionErrorCode =
  | 'not_in_attente'
  | 'not_in_course'
  | 'not_in_results'
  | 'not_closable'
  | 'not_host'
  | 'not_enough_participants'
  | 'no_human_participant'
  | 'missing_text'
  | 'unknown_participant'
  | 'spectator_cannot_finish'
  | 'invalid_final_state'
  | 'invalid_time';

/** A rejected transition: `code` is the machine-readable contract. */
export class RaceTransitionError extends Error {
  readonly code: RaceTransitionErrorCode;

  constructor(code: RaceTransitionErrorCode, message: string) {
    super(message);
    this.name = 'RaceTransitionError';
    this.code = code;
  }
}

export function isRacePhase(value: string): value is RacePhase {
  return (RACE_PHASES as readonly string[]).includes(value);
}

/** Guests are human players too; only bots are not (COURSE-02). */
export function isHumanKind(kind: ParticipantKind): boolean {
  return kind === 'user' || kind === 'guest';
}

/** COURSE-02: spectators never count; bots count but are not humans. */
export function countRacingParticipants(participants: readonly RaceParticipant[]): {
  total: number;
  humans: number;
  bots: number;
} {
  const racers = participants.filter((participant) => !participant.isSpectator);
  return {
    total: racers.length,
    humans: racers.filter((participant) => isHumanKind(participant.kind)).length,
    bots: racers.filter((participant) => participant.kind === 'bot').length,
  };
}

function assertValidTime(now: Date): void {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new RaceTransitionError('invalid_time', 'now must be a valid Date');
  }
}

/**
 * Builds a fresh race in `EN_ATTENTE`. The participant list is copied, so the
 * caller's array can never be mutated through the race state.
 */
export function createRace(params: {
  participants: readonly RaceParticipant[];
  config: RoomConfig;
}): RaceState {
  return {
    phase: 'en_attente',
    config: params.config,
    participants: [...params.participants],
    chosenText: null,
    startedAt: null,
    startAt: null,
    finishedAt: null,
    results: [],
  };
}

/** Actor of `requestStart`; `isHost` is computed by the wiring (SEC-01). */
export type StartActor = {
  isHost: boolean;
};

/**
 * COURSE-02: the host launches the race from `EN_ATTENTE`.
 *
 * Guards, in order: phase is `en_attente`; the actor is the room host (the
 * wiring verifies the session against `rooms.hostUserId` and passes the
 * boolean); at least {@link MIN_RACE_PARTICIPANTS} racing participants
 * (spectators excluded, bots included) of which at least
 * {@link MIN_HUMAN_PARTICIPANTS} human (users and guests); a non-empty
 * `chosenText`.
 *
 * On success the race enters `DÉCOMPTE` with `startedAt = now` (text
 * revealed, COURSE-03) and `startAt = now + COUNTDOWN_MS`; `advance` flips to
 * `EN_COURSE` once that instant passes. The text is passed in by the caller —
 * the wiring picks it from the corpus or the seeded generator — because the
 * machine itself performs no I/O.
 */
export function requestStart(
  race: RaceState,
  now: Date,
  actor: StartActor,
  chosenText: RaceText,
): RaceState {
  assertValidTime(now);

  if (race.phase !== 'en_attente') {
    throw new RaceTransitionError('not_in_attente', 'a race can only start from EN_ATTENTE');
  }
  if (!actor.isHost) {
    throw new RaceTransitionError('not_host', 'only the room host may start the race');
  }

  const { total, humans } = countRacingParticipants(race.participants);
  if (total < MIN_RACE_PARTICIPANTS) {
    throw new RaceTransitionError(
      'not_enough_participants',
      `a race needs at least ${MIN_RACE_PARTICIPANTS} participants (spectators excluded)`,
    );
  }
  if (humans < MIN_HUMAN_PARTICIPANTS) {
    throw new RaceTransitionError(
      'no_human_participant',
      'a race needs at least one human participant (bots alone cannot race)',
    );
  }
  if (chosenText === null || chosenText === undefined || chosenText.body.length === 0) {
    throw new RaceTransitionError('missing_text', 'a race needs a non-empty text');
  }

  return {
    ...race,
    phase: 'decompte',
    chosenText,
    startedAt: now,
    startAt: new Date(now.getTime() + COUNTDOWN_MS),
    finishedAt: null,
    results: [],
  };
}

/**
 * The clock tick of the machine. Called by the wiring on every heartbeat /
 * message, it applies whichever boundary `now` has crossed — and only that
 * one, so a tick never skips a phase:
 *
 * - `decompte` → `en_course` once `now >= startAt` (COURSE-03).
 * - `en_course` → `resultats` when every racing participant has a result
 *   (`finished` or `quit`), or when `config.timeLimitSeconds` (if set) has
 *   elapsed since `startAt` — in that case the still-active participants are
 *   recorded as `timeout` at `now` (COURSE-09). `finishedAt` is stamped.
 *
 * Returns the same object when no boundary was crossed.
 */
export function advance(race: RaceState, now: Date): RaceState {
  assertValidTime(now);

  if (race.phase === 'decompte') {
    if (race.startAt !== null && now.getTime() >= race.startAt.getTime()) {
      return { ...race, phase: 'en_course' };
    }
    return race;
  }

  if (race.phase === 'en_course') {
    const ended = new Set(race.results.map((result) => result.memberId));
    const active = race.participants.filter(
      (participant) => !participant.isSpectator && !ended.has(participant.memberId),
    );

    const timeLimitMs =
      race.config.timeLimitSeconds === null ? null : race.config.timeLimitSeconds * 1_000;
    const timeExpired =
      timeLimitMs !== null &&
      race.startAt !== null &&
      now.getTime() - race.startAt.getTime() >= timeLimitMs;

    if (active.length > 0 && !timeExpired) {
      return race;
    }

    const timeouts: ParticipantResult[] = active.map((participant) => ({
      memberId: participant.memberId,
      finalState: 'timeout',
      endedAt: now,
    }));

    return {
      ...race,
      phase: 'resultats',
      finishedAt: now,
      results: [...race.results, ...timeouts],
    };
  }

  return race;
}

const PARTICIPANT_FINAL_STATES: readonly ParticipantFinalState[] = [
  'finished',
  'quit',
  'timeout',
];

/**
 * Records how one participant's race ended (COURSE-07/09/10). Legal only in
 * `en_course`, for a known racing participant (spectators cannot finish).
 * Recording is idempotent — a duplicate message returns the unchanged state —
 * and does **not** change the phase: the `en_course` → `resultats` transition
 * belongs to {@link advance}, the single place where the clock decides.
 */
export function finishParticipant(
  race: RaceState,
  memberId: string,
  now: Date,
  finalState: ParticipantFinalState,
): RaceState {
  assertValidTime(now);

  if (race.phase !== 'en_course') {
    throw new RaceTransitionError('not_in_course', 'participants can only finish during EN_COURSE');
  }
  if (typeof memberId !== 'string' || memberId.length === 0) {
    throw new RaceTransitionError('unknown_participant', 'memberId must be a non-empty string');
  }
  if (!(PARTICIPANT_FINAL_STATES as readonly string[]).includes(finalState)) {
    throw new RaceTransitionError('invalid_final_state', `unknown final state: ${String(finalState)}`);
  }

  const participant = race.participants.find((entry) => entry.memberId === memberId);
  if (!participant) {
    throw new RaceTransitionError('unknown_participant', `no racing participant ${memberId}`);
  }
  if (participant.isSpectator) {
    throw new RaceTransitionError('spectator_cannot_finish', 'spectators do not take part in the race');
  }
  if (race.results.some((result) => result.memberId === memberId)) {
    return race;
  }

  return {
    ...race,
    results: [...race.results, { memberId, finalState, endedAt: now }],
  };
}

/**
 * COURSE-11: from the results screen, the host relaunches with the same
 * participants. `config` optionally replaces the snapshot (the configuration
 * is modifiable between races); everything race-specific is reset. The text
 * is cleared — the wiring picks a fresh one on the next `requestStart`.
 */
export function relaunch(race: RaceState, config?: RoomConfig): RaceState {
  if (race.phase !== 'resultats') {
    throw new RaceTransitionError('not_in_results', 'only a finished race can be relaunched');
  }

  return {
    ...race,
    phase: 'en_attente',
    config: config ?? race.config,
    // Copied like in createRace: the state owns its participant list.
    participants: [...race.participants],
    chosenText: null,
    startedAt: null,
    startAt: null,
    finishedAt: null,
    results: [],
  };
}

/** COURSE-11: the host closes the room from the lobby or the results screen. */
export function closeRace(race: RaceState): RaceState {
  if (race.phase !== 'resultats' && race.phase !== 'en_attente') {
    throw new RaceTransitionError(
      'not_closable',
      'a room can only be closed while waiting or on the results screen',
    );
  }

  return { ...race, phase: 'fermee' };
}

/**
 * Replaces the config snapshot while waiting (CONF-12: the host may tune the
 * settings up to the start). Only legal in `en_attente`; `relaunch` covers
 * the results screen.
 */
export function configureRace(race: RaceState, config: RoomConfig): RaceState {
  if (race.phase !== 'en_attente') {
    throw new RaceTransitionError('not_in_attente', 'the config can only change while waiting');
  }

  return { ...race, config };
}

/**
 * COURSE-03: seconds left on the countdown, as an integer from
 * {@link COUNTDOWN_SECONDS} down to 1 — a client joining mid-countdown can
 * render "3, 2, 1" without ever having seen the start. Returns `0` once the
 * boundary has passed (the next `advance` flips the phase) and `null` outside
 * `decompte`.
 */
export function countdownSecondsRemaining(race: RaceState, now: Date): number | null {
  assertValidTime(now);

  if (race.phase !== 'decompte' || race.startAt === null) {
    return null;
  }

  const remainingMs = race.startAt.getTime() - now.getTime();
  const seconds = Math.ceil(remainingMs / 1_000);
  return Math.min(COUNTDOWN_SECONDS, Math.max(0, seconds));
}

/**
 * COURSE-03: the text is visible from the start of the countdown, through
 * the race and on the results screen — never while waiting.
 */
export function textVisibleForPhase(phase: RacePhase): boolean {
  return phase === 'decompte' || phase === 'en_course' || phase === 'resultats';
}

/** Convenience over {@link textVisibleForPhase} for a whole race state. */
export function isRaceTextVisible(race: RaceState): boolean {
  return race.chosenText !== null && textVisibleForPhase(race.phase);
}
