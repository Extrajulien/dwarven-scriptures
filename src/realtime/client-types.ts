import type { MemberInfo, RoomInfo, WsErrorCode } from './protocol';

/**
 * Client-facing types for the realtime room socket (used by SP-1C's room UI).
 * Everything here is derived from the Zod-validated protocol types — the hook
 * never exposes raw, unvalidated server data.
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
