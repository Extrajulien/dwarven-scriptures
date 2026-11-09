/**
 * @jest-environment jsdom
 *
 * Hook-level tests for `useRoomSocket` with a mocked WebSocket client: the
 * join handshake, the COURSE-08 mid-race `rejoinRace` resume on a snapshot
 * with a race status, the race state helpers (`startRace`, `quitRace`,
 * `sendRaceProgress` with validation before send) and the race message
 * dispatch into React state.
 */

import { act, renderHook } from '@testing-library/react';
import { defaultRoomConfig } from '../lib/room-config';
import { useRoomSocket } from './useRoomSocket';

const ROOM_PUBLIC_ID = '8f9c2a55-3b4a-4c1e-8a2d-9e7f6a5b4c3d';
const ADA_ID = '1f2e3d4c-5b6a-4978-8c9d-0e1f2a3b4c5d';
const BOB_ID = '2f3e4d5c-6b7a-4987-9c0d-1e2f3a4b5c6d';

/** Minimal WebSocket double: records sent frames and lets tests drive events. */
class FakeWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  sentPayloads(): Array<Record<string, unknown>> {
    return this.sent.map((frame) => JSON.parse(frame) as Record<string, unknown>);
  }

  serverMessage(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  serverOpen(): void {
    this.onopen?.();
  }
}

function snapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'roomSnapshot',
    room: {
      publicId: ROOM_PUBLIC_ID,
      code: 'DWRF42',
      visibility: 'public',
      status: 'en_attente',
      capacity: 10,
      config: defaultRoomConfig,
      host: { publicId: ADA_ID, username: 'ada' },
      createdAt: '2026-11-07T20:00:00.000Z',
      ...overrides,
    },
    members: [
      {
        kind: 'user',
        publicId: ADA_ID,
        username: 'ada',
        pfpUrl: null,
        role: 'participant',
        joinedAt: '2026-11-07T21:00:00.000Z',
        connected: true,
      },
    ],
  };
}

function snapshotRoom(overrides: Record<string, unknown>): Record<string, unknown> {
  return snapshot({ ...overrides });
}

describe('useRoomSocket (mocked WebSocket)', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    // The browser WebSocket is replaced wholesale by the test double.
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  test('join opens a socket and sends joinRoom; a mid-race snapshot triggers rejoinRace', () => {
    const { result } = renderHook(() => useRoomSocket());

    act(() => {
      result.current.join({ code: 'DWRF42' });
    });
    expect(result.current.status).toBe('connecting');

    const socket = FakeWebSocket.instances[0];
    act(() => {
      socket.serverOpen();
    });
    expect(socket.sentPayloads()).toEqual([{ type: 'joinRoom', code: 'DWRF42' }]);

    act(() => {
      socket.serverMessage(snapshotRoom({ status: 'en_course' }));
    });
    expect(result.current.status).toBe('open');
    expect(result.current.snapshot?.room.status).toBe('en_course');
    // COURSE-08: a join that lands mid-race asks for the resume snapshot.
    expect(socket.sentPayloads()).toEqual([
      { type: 'joinRoom', code: 'DWRF42' },
      { type: 'rejoinRace' },
    ]);
  });

  test('an en_attente snapshot does not trigger rejoinRace', () => {
    const { result } = renderHook(() => useRoomSocket());
    act(() => {
      result.current.join({ code: 'DWRF42' });
    });
    const socket = FakeWebSocket.instances[0];
    act(() => {
      socket.serverOpen();
      socket.serverMessage(snapshot());
    });
    expect(socket.sentPayloads()).toEqual([{ type: 'joinRoom', code: 'DWRF42' }]);
    expect(result.current.race).toBeNull();
  });

  test('race messages drive the race view: countdown, started, tick, finished', () => {
    const { result } = renderHook(() => useRoomSocket());
    act(() => {
      result.current.join({ code: 'DWRF42' });
    });
    const socket = FakeWebSocket.instances[0];
    act(() => {
      socket.serverOpen();
      socket.serverMessage(snapshot());
    });

    act(() => {
      socket.serverMessage({
        type: 'countdownStarted',
        roomPublicId: ROOM_PUBLIC_ID,
        startAt: '2026-11-08T18:00:03.000Z',
        textId: null,
        text: 'the quick brown fox',
        totalLength: 19,
      });
    });
    expect(result.current.race?.phase).toBe('decompte');
    expect(result.current.race?.text).toBe('the quick brown fox');

    act(() => {
      socket.serverMessage({
        type: 'raceStarted',
        roomPublicId: ROOM_PUBLIC_ID,
        startAt: '2026-11-08T18:00:03.000Z',
      });
      socket.serverMessage({
        type: 'raceTick',
        roomPublicId: ROOM_PUBLIC_ID,
        tickAt: '2026-11-08T18:00:06.000Z',
        participants: [
          {
            participantId: ADA_ID,
            kind: 'user',
            displayName: 'ada',
            position: 4,
            wpm: 12,
            finished: false,
          },
        ],
      });
    });
    expect(result.current.race?.phase).toBe('en_course');
    expect(result.current.race?.participants[0].position).toBe(4);

    act(() => {
      socket.serverMessage({
        type: 'raceFinished',
        roomPublicId: ROOM_PUBLIC_ID,
        durationMs: 4_000,
        results: [
          {
            participantId: ADA_ID,
            displayName: 'ada',
            kind: 'user',
            wpm: 50,
            rawWpm: 55,
            accuracy: 92,
            errors: 2,
            status: 'finished',
            finishedAtMs: 3_900,
            rank: 1,
          },
        ],
      });
    });
    expect(result.current.race?.phase).toBe('resultats');
    expect(result.current.race?.finished?.results[0].rank).toBe(1);
  });

  test('startRace, quitRace and sendRaceProgress send protocol frames', () => {
    const { result } = renderHook(() => useRoomSocket());
    act(() => {
      result.current.join({ code: 'DWRF42' });
    });
    const socket = FakeWebSocket.instances[0];
    act(() => {
      socket.serverOpen();
      socket.serverMessage(snapshot());
    });

    act(() => {
      result.current.startRace();
      result.current.quitRace();
      result.current.sendRaceProgress({ validatedChars: 10, correctKeystrokes: 11, totalKeystrokes: 12 });
    });
    expect(socket.sentPayloads().slice(-3)).toEqual([
      { type: 'startRace' },
      { type: 'quitRace' },
      { type: 'raceProgress', validatedChars: 10, correctKeystrokes: 11, totalKeystrokes: 12 },
    ]);
  });

  test('sendRaceProgress never sends invalid counters (validation before send)', () => {
    const { result } = renderHook(() => useRoomSocket());
    act(() => {
      result.current.join({ code: 'DWRF42' });
    });
    const socket = FakeWebSocket.instances[0];
    act(() => {
      socket.serverOpen();
      socket.serverMessage(snapshot());
    });

    act(() => {
      result.current.sendRaceProgress({ validatedChars: -1, correctKeystrokes: 0, totalKeystrokes: 0 });
      result.current.sendRaceProgress({ validatedChars: 1.5, correctKeystrokes: 2, totalKeystrokes: 3 });
    });
    expect(socket.sentPayloads().filter((m) => m.type === 'raceProgress')).toHaveLength(0);
  });

  test('a reconnect during a race re-applies the resume snapshot after rejoinRace', () => {
    const { result } = renderHook(() => useRoomSocket());
    act(() => {
      result.current.join({ code: 'DWRF42' });
    });
    let socket = FakeWebSocket.instances[0];
    act(() => {
      socket.serverOpen();
      socket.serverMessage(snapshotRoom({ status: 'en_course' }));
    });
    const sentPayloads = socket.sentPayloads();
    expect(sentPayloads[sentPayloads.length - 1]).toEqual({ type: 'rejoinRace' });

    act(() => {
      socket.serverMessage({
        type: 'raceSnapshot',
        roomPublicId: ROOM_PUBLIC_ID,
        phase: 'en_course',
        startedAt: '2026-11-08T18:00:00.000Z',
        startAt: '2026-11-08T18:00:03.000Z',
        textId: '7',
        text: 'the quick brown fox',
        totalLength: 19,
        progress: { validatedChars: 6, correctKeystrokes: 6, totalKeystrokes: 7 },
      });
    });
    expect(result.current.race?.phase).toBe('en_course');
    expect(result.current.race?.ownProgress?.validatedChars).toBe(6);
    expect(result.current.race?.text).toBe('the quick brown fox');

    // Second socket after a transport drop: the same join → rejoin flow.
    act(() => {
      result.current.leave();
    });
    act(() => {
      result.current.join({ code: 'DWRF42' });
    });
    socket = FakeWebSocket.instances[1];
    act(() => {
      socket.serverOpen();
      socket.serverMessage(snapshotRoom({ status: 'decompte' }));
    });
    expect(socket.sentPayloads()).toEqual([
      { type: 'joinRoom', code: 'DWRF42' },
      { type: 'rejoinRace' },
    ]);
    expect(result.current.race).toBeNull(); // resume arrives with the snapshot answer
  });

  test('an invalid server frame never reaches state (TECH-07)', () => {
    const { result } = renderHook(() => useRoomSocket());
    act(() => {
      result.current.join({ code: 'DWRF42' });
    });
    const socket = FakeWebSocket.instances[0];
    act(() => {
      socket.serverOpen();
      socket.serverMessage(snapshot());
      socket.serverMessage({ type: 'raceTick', participants: [{ participantId: BOB_ID }] });
    });
    expect(result.current.error?.message).toBe('received an invalid frame from the server');
    expect(result.current.race).toBeNull();
  });
});
