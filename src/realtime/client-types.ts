import type {
  BonusAppliedMessage,
  MemberInfo,
  RaceResultEntry,
  RaceTickParticipant,
  RoomInfo,
  WsErrorCode,
} from './protocol';

/**
 * Client-facing types for the realtime room socket (used by SP-1C's room UI
 * and the race screens). Everything here is derived from the Zod-validated
 * protocol types — the hook never exposes raw, unvalidated server data.
 */

export type ConnectionStatus =
  /** No join attempted yet. */
  | 'idle'
  /** The socket is connecting for the first time. */
  | 'connecting'
  /** The socket is open (joined or about to join). */
  | 'open'
  /** The socket dropped and a reconnect is scheduled. */
  | 'reconnecting'
  /** Closed by the user (`leave`) or terminated server-side (kicked/closed). */
  | 'closed';

/** The authoritative room state carried by the `roomSnapshot` message. */
export type RoomSnapshot = {
  room: RoomInfo;
  members: MemberInfo[];
};

/** One join attempt: a room code XOR an invitation token (SALLE-02/04). */
export type JoinTarget = { code: string } | { invitationToken: string };

export type RoomSocketError = {
  /** Protocol error code when the server sent one. */
  code?: WsErrorCode;
  message: string;
  /**
   * True when reconnecting is pointless: the room rejected the join, the
   * member was kicked, the room closed, or the user left voluntarily.
   */
  fatal: boolean;
};

/** Complete state exposed by the hook. */
export type RoomSocketState = {
  status: ConnectionStatus;
  snapshot: RoomSnapshot | null;
  error: RoomSocketError | null;
};

/**
 * Terminal join errors: the server answered with a definitive rejection, so
 * retrying on a timer would only spam it (SALLE-10 rate limits joins).
 */
export function isFatalErrorCode(code: WsErrorCode): boolean {
  return (
    code === 'kicked' ||
    code === 'room_not_found' ||
    code === 'room_full' ||
    code === 'rate_limited' ||
    code === 'invalid_input' ||
    code === 'private_room' ||
    code === 'already_in_room'
  );
}

// ------------------------------------------------------------------ race view

/** Cumulative progress counters (sent by the client, echoed by the resume snapshot). */
export type RaceProgress = {
  validatedChars: number;
  correctKeystrokes: number;
  totalKeystrokes: number;
};

/** Phases of an active race as seen by the client (COURSE-01). */
export type RacePhase = 'decompte' | 'en_course' | 'resultats';

/** One participant on the track, from the aggregated `raceTick`. */
export type RaceTrackParticipant = RaceTickParticipant;

/** Final standings shown on the results screen (COURSE-10, RES-02 groundwork). */
export type RaceResultsView = {
  durationMs: number;
  results: RaceResultEntry[];
};

/**
 * The client's view of the current race, reduced from the validated race
 * messages: the countdown/`raceStarted` phase and text, the last `raceTick`
 * aggregation, the finish-order ranks, and the final standings.
 */
export type RaceView = {
  phase: RacePhase;
  /** Countdown start (the moment the text was revealed, COURSE-03). */
  startedAt: string | null;
  /** Typing start (the countdown end). */
  startAt: string | null;
  textId: string | null;
  text: string | null;
  totalLength: number | null;
  /** Own cumulative counters; `null` when not racing (spectator/ended). */
  ownProgress: RaceProgress | null;
  participants: RaceTrackParticipant[];
  lastTickAt: string | null;
  /** participantId → finish rank, from `participantFinished`. */
  finishRanks: Record<string, number>;
  finished: RaceResultsView | null;
  /**
   * Comeback-bonus events received during this race, in order (BONUS-03
   * announcement data). SP-4C renders the announcements and the text
   * adjustments from this log; the reducer also folds each event's
   * `payload.totalLength` into the targeted `raceTick` participant.
   */
  bonusLog: BonusAppliedMessage[];
};

/** The full hook state: the room socket state plus the active-race view. */
export type RaceSocketState = RoomSocketState & {
  race: RaceView | null;
};
