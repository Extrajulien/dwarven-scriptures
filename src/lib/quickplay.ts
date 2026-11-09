/**
 * JOIN-03 pure logic: "Faire une course" picks the joinable public room
 * closest to its capacity, the oldest room winning exact ties. Kept free of
 * database and framework imports so it can be unit-tested directly; the
 * server action (`quickPlay` in `src/app/rooms/actions.ts`) feeds it the
 * `listPublicRooms` summary rows.
 */

export interface QuickPlayCandidate {
  publicId: string;
  /** Participant capacity (spectators do not count, SALLE-05). */
  capacity: number;
  /** Present participants (spectators excluded). */
  participantCount: number;
  /** Creation time; older rooms win ties. */
  createdAt: Date | string;
}

/**
 * Sorts candidates best-first: non-full rooms ranked by fill ratio
 * (participants ÷ capacity, highest first), the oldest `createdAt` breaking
 * exact ties, then oldest-first for everything else. Full rooms are
 * excluded — a full room is never joinable (SALLE-05).
 */
export function rankQuickPlayRooms<T extends QuickPlayCandidate>(rooms: readonly T[]): T[] {
  const joinable = rooms.filter((room) => room.participantCount < room.capacity);
  return [...joinable].sort((a, b) => {
    // Cross-multiplied fill comparison: integer-exact, no float rounding.
    const fillDelta = a.participantCount * b.capacity - b.participantCount * a.capacity;
    if (fillDelta !== 0) {
      return fillDelta > 0 ? -1 : 1;
    }
    const timeDelta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (timeDelta !== 0) {
      return timeDelta;
    }
    return 0;
  });
}

/**
 * The room "Faire une course" should join, or `null` when no public room is
 * joinable right now (JOIN-03).
 */
export function pickQuickPlayRoom<T extends QuickPlayCandidate>(rooms: readonly T[]): T | null {
  return rankQuickPlayRooms(rooms)[0] ?? null;
}
