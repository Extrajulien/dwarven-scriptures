/**
 * Session-storage bridge for the local player's per-key error counts (RES-03).
 *
 * The per-key keyboard heatmap is client-side only: the typing reducer records
 * wrong keystrokes during the race (`TypingState.keyErrors`), the arena holds
 * the latest map, and the results view — a separate route reached after the
 * race finishes — reads it back. `sessionStorage` survives the client-side
 * navigation from the arena to the results route (and a refresh), so the map
 * is stored keyed by room public id and read once the results screen mounts.
 */

const KEY_PREFIX = 'dsh:race:keyErrors:';

function storageKey(roomPublicId: string): string {
  return `${KEY_PREFIX}${roomPublicId}`;
}

/** Stores the local racer's per-key error map for the room's results screen. */
export function storeRaceKeyErrors(
  roomPublicId: string,
  keyErrors: Readonly<Record<string, number>>,
): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(storageKey(roomPublicId), JSON.stringify(keyErrors));
  } catch {
    // Storage unavailable (private mode / quota): the results screen falls
    // back to the honest "unavailable" state.
  }
}

/**
 * Reads the local racer's per-key error map for a room, or `null` when there
 * is none (spectator, hard reload before the race finished, or storage
 * unavailable). Entries that are not finite non-negative numbers are dropped
 * defensively — this data is read back into a trusted typed shape.
 */
export function readRaceKeyErrors(
  roomPublicId: string,
): Readonly<Record<string, number>> | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(storageKey(roomPublicId));
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return null;
  }
}
