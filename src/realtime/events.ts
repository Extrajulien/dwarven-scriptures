import type { RoomConfig } from '../db/schema';
import type { MemberRef, RoomHub } from './hub';
import type { HostInfo } from './protocol';

/**
 * In-process bridge between the server actions and the realtime hub
 * (ADR-010, Decision A: one process — no LISTEN/NOTIFY needed).
 *
 * `src/realtime/server.ts` registers the hub at boot with
 * {@link setRealtimeHub}; the room actions call the `publish*` helpers after
 * their database mutations succeed. When no hub is registered (unit tests,
 * contexts without the realtime layer) every call is a safe no-op, so the
 * actions keep working unchanged. The realtime layer must never be able to
 * break an action: failures are logged, not thrown.
 */

let hub: RoomHub | null = null;

export function setRealtimeHub(instance: RoomHub | null): void {
  hub = instance;
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
  publish(() => hub?.notifyConfigUpdated(roomId, config));
}

/** SALLE-07: the kicked member is evicted and the room is notified. */
export function publishMemberKicked(roomId: number, ref: MemberRef): void {
  publish(() => hub?.notifyMemberKicked(roomId, ref));
}

/** SALLE-08: the room is notified of the new host. */
export function publishHostChanged(roomId: number, host: HostInfo): void {
  publish(() => hub?.notifyHostChanged(roomId, host));
}

/** The host closed the room: everyone is evicted. */
export function publishRoomClosed(roomId: number): void {
  publish(() => hub?.notifyRoomClosed(roomId));
}

/** A member left through the `leaveRoom` action: presence is updated. */
export function publishMemberLeft(roomId: number, ref: MemberRef): void {
  publish(() => hub?.notifyMemberLeft(roomId, ref));
}
