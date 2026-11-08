'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isFatalErrorCode,
  type ConnectionStatus,
  type JoinTarget,
  type RoomSocketError,
  type RoomSnapshot,
  type RoomSocketState,
} from './client-types';
import { serverMessageSchema, type ServerMessage } from './protocol';

/**
 * React hook for the realtime room socket (TECH-06, GAME-4 groundwork for
 * SP-1C). Design rules:
 *
 * - **Never trust raw server data:** every incoming frame is parsed with the
 *   Zod protocol schemas (`parseServerMessage`) before it can touch state;
 *   anything invalid is dropped and surfaced as a client-side error.
 * - **Typed, minimal surface:** the hook exposes `status`, `snapshot`,
 *   `error` (all derived from the protocol types) plus `join`, `leave` and
 *   `sendPing`. No raw `WebSocket` escapes the hook.
 * - **Auto-reconnect:** an unexpected transport drop schedules a reconnect
 *   with exponential backoff + jitter (pure `computeReconnectDelay`); on
 *   reconnect the hook re-sends the same `joinRoom` — Phase 1 reconnection is
 *   a plain re-join by code, COURSE-08's mid-race resume arrives in Phase 2.
 * - **Terminal errors** (`kicked`, `room_full`, `rate_limited`, …) stop the
 *   reconnect timer — retrying would only spam the server (SALLE-10).
 *
 * The pure pieces (`computeReconnectDelay`, `buildWsUrl`, `parseServerMessage`,
 * `applyServerMessage`) are exported for unit tests without jsdom.
 */

// ------------------------------------------------------------------ pure parts

export type ReconnectDelayOptions = {
  baseMs?: number;
  maxMs?: number;
  /** Jitter fraction, 0–1: the delay varies by ±jitter * delay. */
  jitter?: number;
};

/**
 * Exponential backoff with jitter for reconnects: `baseMs * 2^attempt`,
 * capped at `maxMs`, then multiplied by a random factor in
 * `[1 - jitter, 1 + jitter]` so clients do not reconnect in lockstep.
 */
export function computeReconnectDelay(
  attempt: number,
  options: ReconnectDelayOptions = {},
): number {
  const baseMs = options.baseMs ?? 1_000;
  const maxMs = options.maxMs ?? 30_000;
  const jitter = options.jitter ?? 0.3;
  const capped = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
  const factor = 1 + (Math.random() * 2 - 1) * jitter;
  return Math.max(0, Math.round(capped * factor));
}

/** Same-origin ws URL from a `location`-like object, overridable by env. */
export function buildWsUrl(
  location: { protocol: string; host: string },
  envUrl: string | undefined,
): string {
  if (envUrl) {
    return envUrl;
  }
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws`;
}

/** Validates one raw server frame; `null` when it is not protocol-valid. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  const parsed = serverMessageSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Applies one validated server message to the hook's state (pure reducer). */
export function applyServerMessage(
  previous: RoomSocketState,
  message: ServerMessage,
): RoomSocketState {
  switch (message.type) {
    case 'roomSnapshot':
      return {
        status: 'open',
        snapshot: { room: message.room, members: message.members },
        error: null,
      };

    case 'memberJoined':
      if (!previous.snapshot) {
        return previous;
      }
      return {
        ...previous,
        snapshot: {
          ...previous.snapshot,
          members: upsertMember(previous.snapshot.members, message.member),
        },
      };

    case 'memberLeft':
    case 'memberKicked':
      if (!previous.snapshot) {
        return previous;
      }
      return {
        ...previous,
        snapshot: {
          ...previous.snapshot,
          members: previous.snapshot.members.filter(
            (member) => memberIdentity(member) !== memberIdentity(message.member),
          ),
        },
      };

    case 'hostChanged':
      if (!previous.snapshot) {
        return previous;
      }
      return {
        ...previous,
        snapshot: { ...previous.snapshot, room: { ...previous.snapshot.room, host: message.host } },
      };

    case 'configUpdated':
      if (!previous.snapshot) {
        return previous;
      }
      return {
        ...previous,
        snapshot: { ...previous.snapshot, room: { ...previous.snapshot.room, config: message.config } },
      };

    case 'roomClosed':
      return { status: 'closed', snapshot: null, error: null };

    case 'error':
      return {
        ...previous,
        error: {
          code: message.code,
          message: message.message ?? `server error: ${message.code}`,
          fatal: isFatalErrorCode(message.code),
        },
      };

    case 'pong':
      return previous;
  }
}

/** Stable identity string of a member (public id XOR guest token). */
export function memberIdentity(member: {
  kind: string;
  publicId?: string;
  guestToken?: string;
}): string {
  return member.kind === 'user'
    ? `user:${String(member.publicId)}`
    : `guest:${String(member.guestToken)}`;
}

function upsertMember(members: RoomSnapshot['members'], member: RoomSnapshot['members'][number]): RoomSnapshot['members'] {
  const identity = memberIdentity(member);
  const existing = members.findIndex((candidate) => memberIdentity(candidate) === identity);
  if (existing >= 0) {
    const next = [...members];
    next[existing] = member;
    return next;
  }
  return [...members, member];
}

// ------------------------------------------------------------------ the hook

const INITIAL_STATE: RoomSocketState = {
  status: 'idle',
  snapshot: null,
  error: null,
};

export type UseRoomSocketResult = RoomSocketState & {
  /** Opens the socket and sends `joinRoom` for the given target. */
  join: (target: JoinTarget) => void;
  /** Sends `leaveRoom`, closes the socket and stops reconnecting. */
  leave: () => void;
  /** Sends a protocol-level `ping` (the server answers `pong`). */
  sendPing: () => void;
};

export function useRoomSocket(): UseRoomSocketResult {
  const [state, setState] = useState<RoomSocketState>(INITIAL_STATE);
  const socketRef = useRef<WebSocket | null>(null);
  const targetRef = useRef<JoinTarget | null>(null);
  const attemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const closeSocket = useCallback(() => {
    clearReconnectTimer();
    if (socketRef.current) {
      socketRef.current.onopen = null;
      socketRef.current.onmessage = null;
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      try {
        socketRef.current.close(1000, 'client closed');
      } catch {
        // already closing
      }
      socketRef.current = null;
    }
  }, [clearReconnectTimer]);

  const open = useCallback(
    (target: JoinTarget) => {
      stoppedRef.current = false;
      targetRef.current = target;
      attemptRef.current = 0;
      setState({ status: 'connecting', snapshot: null, error: null });

      const url = buildWsUrl(
        { protocol: window.location.protocol, host: window.location.host },
        process.env.NEXT_PUBLIC_WS_URL,
      );
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        if (stoppedRef.current) {
          return;
        }
        socket.send(
          JSON.stringify({
            type: 'joinRoom',
            ...('code' in target ? { code: target.code } : { invitationToken: target.invitationToken }),
          }),
        );
      };

      socket.onmessage = (event) => {
        if (stoppedRef.current) {
          return;
        }
        let raw: unknown;
        try {
          raw = JSON.parse(String(event.data));
        } catch {
          setState((previous) => ({
            ...previous,
            error: { message: 'received a non-JSON frame from the server', fatal: false },
          }));
          return;
        }
        const message = parseServerMessage(raw);
        if (!message) {
          // Never trust raw server data: invalid frames never reach state.
          setState((previous) => ({
            ...previous,
            error: { message: 'received an invalid frame from the server', fatal: false },
          }));
          return;
        }
        setState((previous) => applyServerMessage(previous, message));
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (stoppedRef.current) {
          setState((previous) => ({ ...previous, status: 'closed' }));
          return;
        }
        setState((previous) => {
          const fatal = previous.error?.fatal ?? false;
          if (fatal) {
            return { ...previous, status: 'closed' };
          }
          // Transport drop: schedule a reconnect (plain re-join, Phase 1).
          const delay = computeReconnectDelay(attemptRef.current);
          attemptRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => {
            if (!stoppedRef.current && targetRef.current) {
              open(targetRef.current);
            }
          }, delay);
          return { ...previous, status: 'reconnecting' };
        });
      };

      socket.onerror = () => {
        // The close event follows and owns the reconnect decision.
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const join = useCallback(
    (target: JoinTarget) => {
      stoppedRef.current = false;
      closeSocket();
      open(target);
    },
    [closeSocket, open],
  );

  const leave = useCallback(() => {
    const socket = socketRef.current;
    const target = targetRef.current;
    if (socket && socket.readyState === WebSocket.OPEN && target) {
      socket.send(JSON.stringify({ type: 'leaveRoom' }));
    }
    stoppedRef.current = true;
    targetRef.current = null;
    closeSocket();
    setState({ status: 'closed', snapshot: null, error: null });
  }, [closeSocket]);

  const sendPing = useCallback(() => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'ping' }));
    }
  }, []);

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      clearReconnectTimer();
      closeSocket();
    };
  }, [clearReconnectTimer, closeSocket]);

  return { ...state, join, leave, sendPing };
}
