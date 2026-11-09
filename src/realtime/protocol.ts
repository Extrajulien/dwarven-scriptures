import { z } from 'zod';
import { roomConfigSchema } from '../lib/room-config';

/**
 * Zod v4 schemas for the realtime WebSocket protocol (TECH-06/07).
 *
 * This module is imported by the client hook (`src/realtime/useRoomSocket.ts`)
 * and by the server (`src/realtime/server.ts`, `hub.ts`), so it must stay
 * free of Node/Next-only imports (`next/headers`, `ws`, database modules).
 * The room-config schema lives in `src/lib/room-config.ts` (pure Zod) and is
 * shared verbatim: the config carried by realtime messages is validated by
 * exactly the same schema as the config stored in `rooms.config` (CONF-12).
 *
 * Direction notes:
 *
 * - Client → server: `joinRoom` (by 6-char code XOR invitation token —
 *   SALLE-02/04), `leaveRoom`, `ping`, and the race messages `startRace`
 *   (host), `raceProgress` (cumulative counters), `quitRace`, `rejoinRace`.
 *   Strict objects: unknown keys are rejected, never ignored.
 * - Server → client: `roomSnapshot` (the authoritative room + config +
 *   members), the presence events, host/config/closure events, the race
 *   events (`countdownStarted`, `raceStarted`, `raceTick`,
 *   `participantFinished`, `participantQuit`, `raceFinished`, `raceAborted`),
 *   the comeback-bonus event (`bonusApplied`, BONUS-01..04), the
 *   `raceSnapshot` resume payload (COURSE-08), `error` and `pong`.
 *
 * ## Error codes (server → client)
 *
 * | code             | when                                            |
 * | ---------------- | ----------------------------------------------- |
 * | `room_not_found` | unknown code/token, private room reached by code (SALLE-03 never reveals existence), room not joinable right now (SALLE-09), revoked/unknown invitation link |
 * | `room_full`      | participant capacity reached (SALLE-05)         |
 * | `already_in_room`| second connection for the same membership (the old connection is replaced and receives this code), or joining the room one is already in |
 * | `kicked`         | the person was kicked (SALLE-07) or is kicked while present |
 * | `invalid_input`  | malformed/unknown message, identity missing, nickname mismatch |
 * | `private_room`   | reserved — a private room is only reachable through a valid invitation link; code joins of private rooms answer `room_not_found` by design |
 * | `rate_limited`   | too many join attempts from this IP (SALLE-10)  |
 *
 * Race error codes (Phase 2, `src/realtime/race-engine.ts`):
 *
 * | code                    | when                                          |
 * | ----------------------- | --------------------------------------------- |
 * | `not_host`              | a non-host tried to start the race (SEC-01)   |
 * | `race_already_running`  | the race is already in DÉCOMPTE/EN_COURSE     |
 * | `not_in_race`           | the sender is not a racing participant        |
 * | `invalid_progress`      | non-monotonic, impossible or over-length progress (COURSE-06) |
 * | `progress_rate_exceeded`| more than ~10 progress messages/s (PERF-02)   |
 * | `race_not_running`      | race action while the race is not in EN_COURSE|
 */

export const WS_ERROR_CODES = [
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
] as const;

export const wsErrorCodeSchema = z.enum(WS_ERROR_CODES);

export type WsErrorCode = z.infer<typeof wsErrorCodeSchema>;

/**
 * A room code as typed by a client: trimmed, upper-cased, SALLE-02 alphabet.
 * Mirrors `roomCodeSchema` in `src/lib/room-action-validation.ts`.
 */
export const roomJoinCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJKMNP-Z2-9]{6}$/);

/** Invitation token (SALLE-04): opaque base64url, bounded length. */
export const invitationTokenSchema = z.string().trim().min(1).max(256);

/**
 * Guest nickname, 3–20 characters after trimming (AUTH-02). Duplicated here
 * from `src/lib/guest-session.ts` so the protocol stays importable from
 * client code — keep the bounds in sync.
 */
export const guestNicknameSchema = z.string().trim().min(3).max(20);

export const joinRoleSchema = z.enum(['participant', 'spectator']);
export const roomVisibilitySchema = z.enum(['public', 'code', 'private']);
export const roomStatusSchema = z.enum([
  'en_attente',
  'decompte',
  'en_course',
  'resultats',
  'fermee',
]);

export type RoomStatus = z.infer<typeof roomStatusSchema>;

// ---------------------------------------------------------------- client → server

/**
 * Join a room by its code XOR an invitation token (SALLE-02/04/09). `nickname`
 * is accepted for guests only; the authoritative guest nickname comes from
 * the signed `guest` cookie (set by the `setGuestNickname` action before the
 * socket is opened — a 101 upgrade response cannot write a cookie), and the
 * server rejects a message whose nickname contradicts the cookie.
 */
export const joinRoomMessageSchema = z
  .object({
    type: z.literal('joinRoom'),
    code: roomJoinCodeSchema.optional(),
    invitationToken: invitationTokenSchema.optional(),
    nickname: guestNicknameSchema.optional(),
  })
  .strict()
  .refine((message) => (message.code === undefined) !== (message.invitationToken === undefined), {
    error: 'exactly one of code or invitationToken must be provided',
  });

export const leaveRoomMessageSchema = z
  .object({
    type: z.literal('leaveRoom'),
  })
  .strict();

export const pingMessageSchema = z
  .object({
    type: z.literal('ping'),
  })
  .strict();

/**
 * The host starts the race (COURSE-02, SEC-01). No payload: the room context
 * comes from the sender's connection, and the host is authorized server-side
 * against `rooms.hostUserId`.
 */
export const startRaceMessageSchema = z
  .object({
    type: z.literal('startRace'),
  })
  .strict();

/**
 * Cumulative progress counters (COURSE-06). The server computes deltas and
 * rejects non-monotonic counters, counters beyond the text length and
 * implausible per-message jumps; the client never sends derived values.
 */
export const raceProgressMessageSchema = z
  .object({
    type: z.literal('raceProgress'),
    /** Correctly typed characters so far (the validated prefix, spaces included). */
    validatedChars: z.number().int().min(0),
    /** Correct keystrokes so far. */
    correctKeystrokes: z.number().int().min(0),
    /** Total keystrokes so far (errors included). */
    totalKeystrokes: z.number().int().min(0),
  })
  .strict();

/**
 * A participant abandons the race (COURSE-07): they instantly become a
 * spectator of the current race and stay in the room.
 */
export const quitRaceMessageSchema = z
  .object({
    type: z.literal('quitRace'),
  })
  .strict();

/**
 * Sent by a reconnected client mid-race (COURSE-08, GAME-4): the server
 * answers with a `raceSnapshot` carrying the race phase, the text and the
 * member's own cumulative counters.
 */
export const rejoinRaceMessageSchema = z
  .object({
    type: z.literal('rejoinRace'),
  })
  .strict();

export const clientMessageSchema = z.discriminatedUnion('type', [
  joinRoomMessageSchema,
  leaveRoomMessageSchema,
  pingMessageSchema,
  startRaceMessageSchema,
  raceProgressMessageSchema,
  quitRaceMessageSchema,
  rejoinRaceMessageSchema,
]);

export type JoinRoomMessage = z.infer<typeof joinRoomMessageSchema>;
export type LeaveRoomMessage = z.infer<typeof leaveRoomMessageSchema>;
export type PingMessage = z.infer<typeof pingMessageSchema>;
export type StartRaceMessage = z.infer<typeof startRaceMessageSchema>;
export type RaceProgressMessage = z.infer<typeof raceProgressMessageSchema>;
export type QuitRaceMessage = z.infer<typeof quitRaceMessageSchema>;
export type RejoinRaceMessage = z.infer<typeof rejoinRaceMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ---------------------------------------------------------------- server → client

/** Public host info: external id + display name (internal ids never leak). */
export const hostInfoSchema = z
  .object({
    publicId: z.uuid(),
    username: z.string().min(1).max(32),
  })
  .strict();

export type HostInfo = z.infer<typeof hostInfoSchema>;

const baseMemberSchema = z
  .object({
    role: joinRoleSchema,
    joinedAt: z.iso.datetime(),
    /** True when the person holds a live WebSocket connection right now. */
    connected: z.boolean(),
  })
  .strict();

/** A present authenticated member: public id, username, avatar. */
export const userMemberSchema = baseMemberSchema
  .extend({
    kind: z.literal('user'),
    publicId: z.uuid(),
    username: z.string().min(1).max(32),
    pfpUrl: z.string().nullable(),
  })
  .strict();

/**
 * A present guest member. The nickname lives in the guest's signed cookie
 * (AUTH-02), so it is only known while that guest holds a live connection:
 * `nickname` is `null` for guests whose socket is not connected yet.
 */
export const guestMemberSchema = baseMemberSchema
  .extend({
    kind: z.literal('guest'),
    guestToken: z.uuid(),
    nickname: z.string().nullable(),
  })
  .strict();

export const memberInfoSchema = z.discriminatedUnion('kind', [
  userMemberSchema,
  guestMemberSchema,
]);

export type MemberInfo = z.infer<typeof memberInfoSchema>;

/**
 * Authoritative room state sent right after a successful join: the room's
 * public info, its Zod-validated config (CONF-12) and every present member
 * with public display info.
 */
export const roomSnapshotMessageSchema = z
  .object({
    type: z.literal('roomSnapshot'),
    room: z
      .object({
        publicId: z.uuid(),
        code: z.string().regex(/^[A-HJKMNP-Z2-9]{6}$/),
        visibility: roomVisibilitySchema,
        status: roomStatusSchema,
        capacity: z.number().int().min(2).max(30),
        config: roomConfigSchema,
        host: hostInfoSchema,
        createdAt: z.iso.datetime(),
      })
      .strict(),
    members: z.array(memberInfoSchema),
  })
  .strict();

export const memberPresenceMessageSchema = z
  .object({
    type: z.enum(['memberJoined', 'memberLeft', 'memberKicked']),
    roomPublicId: z.uuid(),
    member: memberInfoSchema,
  })
  .strict();

export const hostChangedMessageSchema = z
  .object({
    type: z.literal('hostChanged'),
    roomPublicId: z.uuid(),
    host: hostInfoSchema,
  })
  .strict();

export const configUpdatedMessageSchema = z
  .object({
    type: z.literal('configUpdated'),
    roomPublicId: z.uuid(),
    config: roomConfigSchema,
  })
  .strict();

export const roomClosedMessageSchema = z
  .object({
    type: z.literal('roomClosed'),
    roomPublicId: z.uuid(),
  })
  .strict();

export const errorMessageSchema = z
  .object({
    type: z.literal('error'),
    code: wsErrorCodeSchema,
    /** Optional human-readable detail; the code is the machine contract. */
    message: z.string().max(300).optional(),
  })
  .strict();

export const pongMessageSchema = z
  .object({
    type: z.literal('pong'),
  })
  .strict();

// ---------------------------------------------------------------- race (server → client)

/**
 * COURSE-03: the race entered DÉCOMPTE — the full text body is revealed from
 * this very moment (never before). `startAt` is when typing begins (the
 * countdown end); the time limit is measured from it.
 */
export const countdownStartedMessageSchema = z
  .object({
    type: z.literal('countdownStarted'),
    roomPublicId: z.uuid(),
    /** Typing start — the end of the 3-second countdown. */
    startAt: z.iso.datetime(),
    /** Corpus id for coherent mode (as a string), `null` for generated random texts. */
    textId: z.string().nullable(),
    /** The full text body, revealed at countdown start. */
    text: z.string().min(1),
    /** Characters to type (spaces included; bonus-adjusted length in Phase 4). */
    totalLength: z.number().int().positive(),
  })
  .strict();

/** The countdown ended: typing may begin (COURSE-03). */
export const raceStartedMessageSchema = z
  .object({
    type: z.literal('raceStarted'),
    roomPublicId: z.uuid(),
    startAt: z.iso.datetime(),
  })
  .strict();

/**
 * One participant on the track inside a `raceTick`. `position` is the
 * validated character count; `wpm` is the net WPM (Annexe A) computed by the
 * server; `finished` covers finished, quit and timed-out participants;
 * `totalLength` is the participant's **effective** text length
 * (bonus-adjusted, BONUS-04) so clients derive `position / totalLength`
 * per participant instead of dividing by the shared base length.
 */
export const raceTickParticipantSchema = z
  .object({
    participantId: z.uuid(),
    kind: z.enum(['user', 'guest', 'bot']),
    displayName: z.string().min(1).max(32),
    position: z.number().int().min(0),
    wpm: z.number().min(0),
    finished: z.boolean(),
    /** Effective total length of this participant's text (BONUS-04). */
    totalLength: z.number().int().positive(),
  })
  .strict();

/**
 * COURSE-05: aggregated track update, broadcast at most ~4 times per second
 * (PERF-02's ≤10 msg/s cap is respected with margin; the client interpolates).
 */
export const raceTickMessageSchema = z
  .object({
    type: z.literal('raceTick'),
    roomPublicId: z.uuid(),
    tickAt: z.iso.datetime(),
    participants: z.array(raceTickParticipantSchema),
  })
  .strict();

/** One participant finished (validated the whole text). */
export const participantFinishedMessageSchema = z
  .object({
    type: z.literal('participantFinished'),
    roomPublicId: z.uuid(),
    participantId: z.uuid(),
    /** Finish order among finishers (1 = first), when already computable. */
    rank: z.number().int().positive().optional(),
  })
  .strict();

/** One participant abandoned the race and became a spectator (COURSE-07). */
export const participantQuitMessageSchema = z
  .object({
    type: z.literal('participantQuit'),
    roomPublicId: z.uuid(),
    participantId: z.uuid(),
  })
  .strict();

/**
 * One WPM-over-time sample recorded by the engine during EN_COURSE (RES-03/
 * RES-05 groundwork). Sampled at most once per `raceTick` broadcast (≤ ~4/s)
 * and closed by a final sample at the participant's end time; it is carried
 * **only** by `raceFinished`/the persisted payload — never by `raceTick`
 * (bandwidth, PERF-02).
 */
export const wpmSeriesPointSchema = z
  .object({
    /** Milliseconds after the typing start at which the WPM was sampled. */
    elapsedMs: z.number().int().min(0),
    /** Net WPM at that moment (Annexe A). */
    wpm: z.number().min(0),
  })
  .strict();

/** One ranked result line (COURSE-10, RES-02/03 groundwork). */
export const raceResultEntrySchema = z
  .object({
    participantId: z.uuid(),
    displayName: z.string().min(1).max(32),
    kind: z.enum(['user', 'guest', 'bot']),
    /** Net WPM (Annexe A: correctly typed chars ÷ 5 ÷ elapsed minutes). */
    wpm: z.number().min(0),
    /** Raw WPM (total typed chars ÷ 5 ÷ elapsed minutes). */
    rawWpm: z.number().min(0),
    /** Correct keystrokes ÷ total keystrokes × 100. */
    accuracy: z.number().min(0).max(100),
    /** totalKeystrokes − correctKeystrokes. */
    errors: z.number().int().min(0),
    status: z.enum(['finished', 'timeout', 'quit']),
    /** Milliseconds after the typing start at which the status was recorded. */
    finishedAtMs: z.number().int().min(0),
    rank: z.number().int().positive(),
    /** Comeback bonuses received during the race (BONUS-01, cap 3). */
    bonusesReceived: z.number().int().min(0),
    /** WPM-over-time series for the results charts (RES-03). */
    wpmSeries: z.array(wpmSeriesPointSchema),
  })
  .strict();

/**
 * COURSE-09/10: the race is over. Ranking is computed server-side: finishers
 * by finish time, then timeouts by progression, then quits by progression at
 * the moment of quitting.
 */
export const raceFinishedMessageSchema = z
  .object({
    type: z.literal('raceFinished'),
    roomPublicId: z.uuid(),
    /** Start-to-finish duration in milliseconds (typing start → `resultats`). */
    durationMs: z.number().int().min(0),
    results: z.array(raceResultEntrySchema),
  })
  .strict();

/**
 * GAME-5: the race was aborted by a global condition (AFK timeout or the host
 * closing the room mid-race). The room returns to `en_attente` and no ranking
 * is produced.
 */
export const raceAbortedMessageSchema = z
  .object({
    type: z.literal('raceAborted'),
    roomPublicId: z.uuid(),
    /** Machine-readable reason: `afk_timeout` | `host_closed`. */
    reason: z.string().min(1).max(100),
  })
  .strict();

/**
 * BONUS-01/02/03: a comeback bonus was applied at a checkpoint. Broadcast to
 * the whole room (emitted in-room), so every client can announce it on the
 * track; the targeted client additionally adjusts its own text rendering
 * (SP-4C). The payload carries exactly what each type needs:
 *
 * - `addWords` — `words`, the exact words appended after the target's
 *   current text (the client appends them verbatim, GAME-1 text coherence);
 * - `removeWords` — `wordCount`, how many words were removed from the END of
 *   the target's remaining text (never before the caret, clamped ≥ 1 char);
 * - `fog` — `durationMs`, the blur SP-4C renders on the targeted client
 *   (leader only; the server never targets a bot with fog).
 *
 * `payload.totalLength` is the target's effective text length after the
 * event (BONUS-04), so the reducer can update the track without waiting for
 * the next tick; `payload.at` is the server timestamp of the event.
 */
export const bonusTypeSchema = z.enum(['addWords', 'removeWords', 'fog']);

export const bonusAppliedMessageSchema = z
  .object({
    type: z.literal('bonusApplied'),
    roomPublicId: z.uuid(),
    /** The participant the bonus was applied to (hinder: leader; help: laggard). */
    targetParticipantId: z.uuid(),
    bonusType: bonusTypeSchema,
    payload: z
      .object({
        /** `addWords`: the words appended after the target's current text. */
        words: z.array(z.string().min(1).max(32)).min(1).max(10).optional(),
        /** `removeWords`: words actually removed from the remaining text. */
        wordCount: z.number().int().min(1).max(10).optional(),
        /** `fog`: blur duration in milliseconds (SP-4C renders it). */
        durationMs: z.number().int().min(1).max(10_000).optional(),
        /** The target's effective total length after the event (BONUS-04). */
        totalLength: z.number().int().positive(),
        at: z.iso.datetime(),
      })
      .strict(),
  })
  .strict()
  .superRefine((message, ctx) => {
    if (message.bonusType === 'addWords' && message.payload.words === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'an addWords bonus must carry the appended words',
        path: ['payload', 'words'],
      });
    }
    if (message.bonusType === 'removeWords' && message.payload.wordCount === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'a removeWords bonus must carry the removed word count',
        path: ['payload', 'wordCount'],
      });
    }
    if (message.bonusType === 'fog' && message.payload.durationMs === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'a fog bonus must carry the blur duration',
        path: ['payload', 'durationMs'],
      });
    }
  });

/**
 * COURSE-08 resume snapshot: sent in answer to `rejoinRace` (mid-race
 * reconnect). `text` is the full body when the current phase reveals it
 * (COURSE-03); `progress` is the reconnecting member's own cumulative state,
 * `null` when the member is not racing (spectator, or already finished/quit).
 */
export const raceSnapshotMessageSchema = z
  .object({
    type: z.literal('raceSnapshot'),
    roomPublicId: z.uuid(),
    phase: z.enum(['decompte', 'en_course', 'resultats']),
    /** Countdown start (text reveal). */
    startedAt: z.iso.datetime().nullable(),
    /** Typing start. */
    startAt: z.iso.datetime().nullable(),
    textId: z.string().nullable(),
    text: z.string().nullable(),
    totalLength: z.number().int().positive().nullable(),
    progress: z
      .object({
        validatedChars: z.number().int().min(0),
        correctKeystrokes: z.number().int().min(0),
        totalKeystrokes: z.number().int().min(0),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const serverMessageSchema = z.discriminatedUnion('type', [
  roomSnapshotMessageSchema,
  memberPresenceMessageSchema,
  hostChangedMessageSchema,
  configUpdatedMessageSchema,
  roomClosedMessageSchema,
  countdownStartedMessageSchema,
  raceStartedMessageSchema,
  raceTickMessageSchema,
  participantFinishedMessageSchema,
  participantQuitMessageSchema,
  raceFinishedMessageSchema,
  raceAbortedMessageSchema,
  bonusAppliedMessageSchema,
  raceSnapshotMessageSchema,
  errorMessageSchema,
  pongMessageSchema,
]);

export type RoomSnapshotMessage = z.infer<typeof roomSnapshotMessageSchema>;
export type RoomInfo = z.infer<typeof roomSnapshotMessageSchema>['room'];
export type MemberPresenceMessage = z.infer<typeof memberPresenceMessageSchema>;
export type HostChangedMessage = z.infer<typeof hostChangedMessageSchema>;
export type ConfigUpdatedMessage = z.infer<typeof configUpdatedMessageSchema>;
export type RoomClosedMessage = z.infer<typeof roomClosedMessageSchema>;
export type CountdownStartedMessage = z.infer<typeof countdownStartedMessageSchema>;
export type RaceStartedMessage = z.infer<typeof raceStartedMessageSchema>;
export type RaceTickParticipant = z.infer<typeof raceTickParticipantSchema>;
export type RaceTickMessage = z.infer<typeof raceTickMessageSchema>;
export type ParticipantFinishedMessage = z.infer<typeof participantFinishedMessageSchema>;
export type ParticipantQuitMessage = z.infer<typeof participantQuitMessageSchema>;
export type WpmSeriesPoint = z.infer<typeof wpmSeriesPointSchema>;
export type RaceResultEntry = z.infer<typeof raceResultEntrySchema>;
export type RaceFinishedMessage = z.infer<typeof raceFinishedMessageSchema>;
export type RaceAbortedMessage = z.infer<typeof raceAbortedMessageSchema>;
export type BonusType = z.infer<typeof bonusTypeSchema>;
export type BonusAppliedMessage = z.infer<typeof bonusAppliedMessageSchema>;
export type RaceSnapshotMessage = z.infer<typeof raceSnapshotMessageSchema>;
export type ErrorMessage = z.infer<typeof errorMessageSchema>;
export type PongMessage = z.infer<typeof pongMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;

/** Well-known server message discriminants, for typed narrowing in clients. */
export type ServerMessageType = ServerMessage['type'];
