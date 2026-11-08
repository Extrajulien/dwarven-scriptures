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
 *   SALLE-02/04), `leaveRoom`, `ping`. Strict objects: unknown keys are
 *   rejected, never ignored.
 * - Server → client: `roomSnapshot` (the authoritative room + config +
 *   members), the presence events, host/config/closure events, `error` and
 *   `pong`.
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
 */

export const WS_ERROR_CODES = [
  'room_not_found',
  'room_full',
  'already_in_room',
  'kicked',
  'invalid_input',
  'private_room',
  'rate_limited',
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

export const clientMessageSchema = z.discriminatedUnion('type', [
  joinRoomMessageSchema,
  leaveRoomMessageSchema,
  pingMessageSchema,
]);

export type JoinRoomMessage = z.infer<typeof joinRoomMessageSchema>;
export type LeaveRoomMessage = z.infer<typeof leaveRoomMessageSchema>;
export type PingMessage = z.infer<typeof pingMessageSchema>;
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

export const serverMessageSchema = z.discriminatedUnion('type', [
  roomSnapshotMessageSchema,
  memberPresenceMessageSchema,
  hostChangedMessageSchema,
  configUpdatedMessageSchema,
  roomClosedMessageSchema,
  errorMessageSchema,
  pongMessageSchema,
]);

export type RoomSnapshotMessage = z.infer<typeof roomSnapshotMessageSchema>;
export type RoomInfo = z.infer<typeof roomSnapshotMessageSchema>['room'];
export type MemberPresenceMessage = z.infer<typeof memberPresenceMessageSchema>;
export type HostChangedMessage = z.infer<typeof hostChangedMessageSchema>;
export type ConfigUpdatedMessage = z.infer<typeof configUpdatedMessageSchema>;
export type RoomClosedMessage = z.infer<typeof roomClosedMessageSchema>;
export type ErrorMessage = z.infer<typeof errorMessageSchema>;
export type PongMessage = z.infer<typeof pongMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;

/** Well-known server message discriminants, for typed narrowing in clients. */
export type ServerMessageType = ServerMessage['type'];
