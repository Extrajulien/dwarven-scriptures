'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isFatalErrorCode,
  type JoinTarget,
  type RaceProgress,
  type RaceSocketState,
  type RaceTrackParticipant,
  type RaceView,
  type RoomSnapshot,
} from './client-types';
import {
  raceProgressMessageSchema,
  serverMessageSchema,
  type ServerMessage,
} from './protocol';

/**
 * React hook for the realtime room socket (TECH-06, GAME-4 groundwork for
 * SP-1C). Design rules:
 *
 * - **Never trust raw server data:** every incoming frame is parsed with the
 *   Zod protocol schemas (`parseServerMessage`) before it can touch state;
 *   anything invalid is dropped and surfaced as a client-side error.
 * - **Typed, minimal surface:** the hook exposes `status`, `snapshot`,
 *   `error`, `race` (all derived from the protocol types) plus `join`,
 *   `leave`, `sendPing` and the race helpers `startRace`, `quitRace`,
 *   `sendRaceProgress`. No raw `WebSocket` escapes the hook.
 * - **Auto-reconnect:** an unexpected transport drop schedules a reconnect
 *   with exponential backoff + jitter (pure `computeReconnectDelay`); on
 *   reconnect the hook re-sends the same `joinRoom`, and when the returned
 *   snapshot shows a race in flight (`decompte`/`en_course`), it sends
 *   `rejoinRace` too — the server answers with the `raceSnapshot` resume
 *   payload (COURSE-08, GAME-4).
 * - **Terminal errors** (`kicked`, `room_full`, `rate_limited`, …) stop the
 *   reconnect timer — retrying would only spam the server (SALLE-10).
 *
 * The pure pieces (`computeReconnectDelay`, `buildWsUrl`, `parseServerMessage`,
 * `applyServerMessage`, `wantsRaceResume`, `markParticipantFinished`) are
 * exported for unit tests without jsdom.
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

/**
 * True when a dropped transport should be retried: terminal errors
 * (`kicked`, `room_full`, …) and a `closed` state (voluntary leave, or a
 * `roomClosed` message — the room no longer accepts joins) must not schedule
 * a reconnect, or the client would spam the server (SALLE-10) and flip the
 * "room closed" screen into a "not found" error.
 */
export function shouldReconnect(previous: RaceSocketState): boolean {
  return previous.error?.fatal !== true && previous.status !== 'closed';
}

/**
 * COURSE-08, GAME-4: after a (re)join whose snapshot shows a race in flight,
 * the client must ask for the resume snapshot. `resultats` needs no resume
 * (the results screen is Phase 3), and `en_attente`/`fermee` have no race.
 */
export function wantsRaceResume(roomStatus: string): boolean {
  return roomStatus === 'decompte' || roomStatus === 'en_course';
}

/** Marks one participant as ended on the track (finish or quit announcement). */
export function markParticipantFinished(
  participants: RaceTrackParticipant[],
  participantId: string,
): RaceTrackParticipant[] {
  return participants.map((participant) =>
    participant.participantId === participantId ? { ...participant, finished: true } : participant,
  );
}

function emptyRace(phase: RaceView['phase']): RaceView {
  return {
    phase,
    startedAt: null,
    startAt: null,
    textId: null,
    text: null,
    totalLength: null,
    ownProgress: null,
    participants: [],
    lastTickAt: null,
    finishRanks: {},
    finished: null,
  };
}

/** Applies one validated server message to the hook's state (pure reducer). */
export function applyServerMessage(
  previous: RaceSocketState,
  message: ServerMessage,
): RaceSocketState {
  switch (message.type) {
    case 'roomSnapshot':
      return {
        status: 'open',
        snapshot: { room: message.room, members: message.members },
        error: null,
        // A fresh authoritative join: any local race view is re-built from
        // the resume snapshot the server sends after `rejoinRace`.
        race: null,
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
      return { status: 'closed', snapshot: null, error: null, race: null };

    case 'countdownStarted':
      // COURSE-03: the text is revealed at countdown start.
      return {
        ...previous,
        race: {
          ...emptyRace('decompte'),
          startAt: message.startAt,
          textId: message.textId,
          text: message.text,
          totalLength: message.totalLength,
          ownProgress: { validatedChars: 0, correctKeystrokes: 0, totalKeystrokes: 0 },
        },
      };

    case 'raceStarted':
      if (!previous.race) {
        return previous;
      }
      return {
        ...previous,
        race: { ...previous.race, phase: 'en_course', startAt: message.startAt },
      };

    case 'raceTick':
      if (!previous.race) {
        return previous;
      }
      return {
        ...previous,
        race: { ...previous.race, participants: message.participants, lastTickAt: message.tickAt },
      };

    case 'participantFinished': {
      if (!previous.race) {
        return previous;
      }
      return {
        ...previous,
        race: {
          ...previous.race,
          participants: markParticipantFinished(previous.race.participants, message.participantId),
          finishRanks:
            message.rank !== undefined
              ? { ...previous.race.finishRanks, [message.participantId]: message.rank }
              : previous.race.finishRanks,
        },
      };
    }

    case 'participantQuit':
      if (!previous.race) {
        return previous;
      }
      return {
        ...previous,
        race: {
          ...previous.race,
          participants: markParticipantFinished(previous.race.participants, message.participantId),
        },
      };

    case 'raceFinished':
      if (!previous.race) {
        return previous;
      }
      return {
        ...previous,
        race: {
          ...previous.race,
          phase: 'resultats',
          finished: { durationMs: message.durationMs, results: message.results },
        },
      };

    case 'raceAborted':
      // GAME-5 / host closed: the race is gone and the room waits again.
      return {
        ...previous,
        race: null,
        snapshot: previous.snapshot
          ? { ...previous.snapshot, room: { ...previous.snapshot.room, status: 'en_attente' } }
          : null,
      };

    case 'raceSnapshot':
      // COURSE-08: the resume payload re-applies phase, text and the own
      // counters; the track keeps its last known positions until the next tick.
      return {
        ...previous,
        race: {
          ...emptyRace(message.phase),
          startedAt: message.startedAt,
          startAt: message.startAt,
          textId: message.textId,
          text: message.text,
          totalLength: message.totalLength,
          ownProgress: message.progress,
          participants: previous.race?.participants ?? [],
          lastTickAt: previous.race?.lastTickAt ?? null,
          finishRanks: previous.race?.finishRanks ?? {},
        },
      };

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

const INITIAL_STATE: RaceSocketState = {
  status: 'idle',
  snapshot: null,
  error: null,
  race: null,
};

export type UseRoomSocketResult = RaceSocketState & {
  /** Opens the socket and sends `joinRoom` for the given target. */
  join: (target: JoinTarget) => void;
  /** Sends `leaveRoom`, closes the socket and stops reconnecting. */
  leave: () => void;
  /** Sends a protocol-level `ping` (the server answers `pong`). */
  sendPing: () => void;
  /** The host starts the race (the server authorizes against the room host). */
  startRace: () => void;
  /** Abandons the race and stays in the room as a spectator (COURSE-07). */
  quitRace: () => void;
  /** Sends cumulative progress counters (validated before sending). */
  sendRaceProgress: (progress: RaceProgress) => void;
};

export function useRoomSocket(): UseRoomSocketResult {
  const [state, setState] = useState<RaceSocketState>(INITIAL_STATE);
  const socketRef = useRef<WebSocket | null>(null);
  const targetRef = useRef<JoinTarget | null>(null);
  const attemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  // Indirection so the reconnect timer calls the latest `open` without the
  // callback referencing itself (react-hooks/immutability).
  const openRef = useRef<(target: JoinTarget) => void>(() => {});

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

  /** Sends one protocol-valid client message over the live socket, if any. */
  const send = useCallback((payload: { type: string } & Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }, []);

  const open = useCallback((target: JoinTarget) => {
    stoppedRef.current = false;
    targetRef.current = target;
    attemptRef.current = 0;
    setState({ status: 'connecting', snapshot: null, error: null, race: null });

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
      // COURSE-08: a (re)join that lands mid-race asks the server for the
      // resume snapshot (the server answers with `raceSnapshot`).
      if (message.type === 'roomSnapshot' && wantsRaceResume(message.room.status)) {
        socket.send(JSON.stringify({ type: 'rejoinRace' }));
      }
    };

    socket.onclose = () => {
      socketRef.current = null;
      if (stoppedRef.current) {
        setState((previous) => ({ ...previous, status: 'closed' }));
        return;
      }
      setState((previous) => {
        if (!shouldReconnect(previous)) {
          // Voluntary leave, a terminal rejection, or the room closed:
          // reconnecting would only spam the server.
          return { ...previous, status: 'closed' };
        }
        // Transport drop: schedule a reconnect. The next join re-applies the
        // room snapshot; a mid-race resume follows via `rejoinRace`.
        const delay = computeReconnectDelay(attemptRef.current);
        attemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          if (!stoppedRef.current && targetRef.current) {
            openRef.current(targetRef.current);
          }
        }, delay);
        return { ...previous, status: 'reconnecting' };
      });
    };

    socket.onerror = () => {
      // The close event follows and owns the reconnect decision.
    };
  }, []);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

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
    setState({ status: 'closed', snapshot: null, error: null, race: null });
  }, [closeSocket]);

  const sendPing = useCallback(() => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'ping' }));
    }
  }, []);

  const startRace = useCallback(() => {
    send({ type: 'startRace' });
  }, [send]);

  const quitRace = useCallback(() => {
    send({ type: 'quitRace' });
  }, [send]);

  const sendRaceProgress = useCallback(
    (progress: RaceProgress) => {
      // Validate before sending: the socket only ever carries protocol-valid
      // frames, and a client bug cannot spam the server with junk counters.
      const parsed = raceProgressMessageSchema.safeParse({ type: 'raceProgress', ...progress });
      if (parsed.success) {
        send(parsed.data);
      }
    },
    [send],
  );

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      clearReconnectTimer();
      closeSocket();
    };
  }, [clearReconnectTimer, closeSocket]);

  return { ...state, join, leave, sendPing, startRace, quitRace, sendRaceProgress };
}
