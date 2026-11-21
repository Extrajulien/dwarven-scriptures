import type { RoomConfig } from '../db/schema';
import type { MemberRef, RoomHub } from './hub';
import type { HostInfo } from './protocol';
import type { RaceEngine, RaceEngineOutcome } from './race-engine';

/**
 * In-process bridge between the server actions and the realtime layer
 * (ADR-010, Decision A: one process — no LISTEN/NOTIFY needed).
 *
 * `src/realtime/server.ts` registers the hub and the race engine at boot
 * with {@link setRealtimeHub}/{@link setRaceEngine}; the room actions call
 * the `publish*` helpers after their database mutations succeed. When no
 * hub/engine is registered (unit tests, contexts without the realtime layer)
 * every call is a safe no-op, so the actions keep working unchanged. The
 * realtime layer must never be able to break an action: failures are logged,
 * not thrown.
 *
 * The hub and engine are kept on `globalThis`, not in module-level variables.
 * Next.js compiles server actions into their own server bundle, so a server
 * action can load a *different* copy of this module than the custom server
 * that calls `setRealtimeHub` (the same reason `src/db/index.ts` caches the
 * connection pool on `globalThis`). `globalThis` is the one object every
 * copy shares inside the same Node process, which keeps the registered
 * instances reachable from both sides.
 */

const globalForRealtime = globalThis as unknown as {
  __dwarfRealtimeHub?: RoomHub | null;
  __dwarfRealtimeEngine?: RaceEngine | null;
};

export function setRealtimeHub(instance: RoomHub | null): void {
  globalForRealtime.__dwarfRealtimeHub = instance;
}

export function setRaceEngine(instance: RaceEngine | null): void {
  globalForRealtime.__dwarfRealtimeEngine = instance;
}

function getHub(): RoomHub | null {
  return globalForRealtime.__dwarfRealtimeHub ?? null;
}

function getRaceEngine(): RaceEngine | null {
  return globalForRealtime.__dwarfRealtimeEngine ?? null;
}

function publish(action: () => void): void {
  try {
    action();
  } catch (error) {
    console.error('realtime: publishing a room event failed', error);
  }
}

/** CONF-12: everyone present sees the config change immediately. */
export function publishConfigUpdated(roomId: number, config: RoomConfig): void {
  publish(() => getHub()?.notifyConfigUpdated(roomId, config));
}

/** SALLE-07: the kicked member is evicted and the room is notified. */
export function publishMemberKicked(roomId: number, ref: MemberRef): void {
  publish(() => getHub()?.notifyMemberKicked(roomId, ref));
}

/** SALLE-08: the room is notified of the new host. */
export function publishHostChanged(roomId: number, host: HostInfo): void {
  publish(() => getHub()?.notifyHostChanged(roomId, host));
}

/** The host closed the room: everyone is evicted. */
export function publishRoomClosed(roomId: number): void {
  publish(() => getHub()?.notifyRoomClosed(roomId));
}

/** A member left through the `leaveRoom` action: presence is updated. */
export function publishMemberLeft(roomId: number, ref: MemberRef): void {
  publish(() => getHub()?.notifyMemberLeft(roomId, ref));
}

/**
 * COURSE-02, SEC-01: the `startRace` server action starts the race through
 * the in-process engine. The action has already verified the caller against
 * `rooms.hostUserId`; the engine re-verifies the host key, applies the
 * COURSE-02 participant guards and broadcasts `countdownStarted`. Returns
 * `null` when no engine is registered (unit tests, non-realtime contexts) —
 * the action maps that to its typed `unexpected` result.
 */
export function requestEngineStart(
  roomId: number,
  hostUserId: number,
): Promise<RaceEngineOutcome | null> {
  const engine = getRaceEngine();
  if (!engine) {
    return Promise.resolve(null);
  }
  return engine.startRace(roomId, `user:${hostUserId}`);
}
