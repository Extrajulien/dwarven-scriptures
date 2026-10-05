import type { SheetKey, SpriteKey } from './spriteRegistry';

/**
 * Auto-tiling (bitmask) registry.
 *
 * A 4-way neighbor mask encodes which cardinal neighbors belong to the same
 * "family": North = 1, East = 2, South = 4, West = 8. The resulting integer
 * (0..15) indexes a `ConnectedSpriteSet`, which maps each mask to a concrete
 * tile offset on a sheet.
 *
 * ## Sheet layout convention (placeholders)
 * `vein.png` uses a 4x4 grid (16 tiles) where tile == mask (row-major).
 * `wall.png` uses a 4x5 grid: 16 base faces (indices 0-15, row-major) plus the
 * 4 diagonal inner-corner overlays on the 5th row (indices 16-19: NE, SE, SW, NW).
 * When you wire up a real DF tileset, just adjust the sheet/offsets here —
 * nothing downstream needs to change.
 */

export const MASK = {
  NORTH: 1,
  EAST: 2,
  SOUTH: 4,
  WEST: 8,
} as const;

/** 4-way connectivity bitmask value (0..15). */
export type NeighborMask = number;

export interface TileOffset {
  gridX: number;
  gridY: number;
}

/**
 * A set of connected tiles for one material/feature. `masks` maps a neighbor
 * mask to the tile that renders that connectivity; `fallbackMask` is used when
 * a mask has no dedicated tile (e.g. a sheet that only ships a subset of the
 * 16 variations).
 */
export interface ConnectedSpriteSet {
  sheet: SheetKey;
  masks: Partial<Record<NeighborMask, TileOffset>>;
  fallbackMask: NeighborMask;
}

/** Canonical 4x4 layout: mask value == row-major tile index. */
function maskOffset(mask: number): TileOffset {
  return { gridX: mask & 3, gridY: (mask >> 2) & 3 };
}

function buildSet(sheet: SheetKey, fallbackMask: NeighborMask): ConnectedSpriteSet {
  const masks: Record<NeighborMask, TileOffset> = {};
  for (let m = 0; m < 16; m++) masks[m] = maskOffset(m);
  return { sheet, fallbackMask, masks };
}

export const CONNECTED_SETS = {
  goldVein: buildSet('vein', 0),
} satisfies Record<string, ConnectedSpriteSet>;

export type ConnectedSetId = keyof typeof CONNECTED_SETS;

/** A connectable sprite key's family plus the connected set that renders it. */
export interface ConnectedFeature {
  family: string;
  set: ConnectedSetId;
}

/**
 * Maps a sprite key to its auto-tiling feature. Two cells connect when their
 * features share the same `family` (so `vein.gold` and a future `vein.gold-rich`
 * could both belong to the "gold" family and still merge seamlessly).
 */
export const CONNECTABLE: Partial<Record<SpriteKey, ConnectedFeature>> = {
  'vein.gold': { family: 'gold', set: 'goldVein' },
};

export function getConnectedSet(id: ConnectedSetId): ConnectedSpriteSet {
  return CONNECTED_SETS[id];
}

export function getConnectedFeature(key: SpriteKey): ConnectedFeature | undefined {
  return CONNECTABLE[key];
}

/**
 * Resolve a mask to a concrete tile offset, falling back when the sheet has no
 * dedicated tile for that mask: fallbackMask -> first available mask -> (0,0).
 */
export function resolveMaskOffset(set: ConnectedSpriteSet, mask: NeighborMask): TileOffset {
  const direct = set.masks[mask];
  if (direct) return direct;
  const viaFallback = set.masks[set.fallbackMask];
  if (viaFallback) return viaFallback;
  const first = Object.values(set.masks)[0];
  return first ?? { gridX: 0, gridY: 0 };
}

// --- Dwarf Fortress wall visibility autotiling -------------------------------
// Walls use an 8-way visibility model (not the 4-way connectable model above):
//   * a wall cell renders a face only when at least one of its 8 neighbors is Air;
//   * the base face is chosen from a 4-bit mask of SOLID orthogonal neighbors;
//   * diagonal inner corners are drawn as overlays on top of the base face.

/** Wall sheet key: 4x5 grid (16 base faces + 4 corner overlays). */
export const WALL_SHEET: SheetKey = 'wall';

/** Wall inner-corner overlay flags. */
export const WALL_CORNER = {
  NE: 1,
  SE: 2,
  SW: 4,
  NW: 8,
} as const;

/** Atlas offsets for the 4 diagonal inner-corner overlays (indices 16-19). */
export const WALL_CORNER_OFFSETS = {
  NE: { gridX: 0, gridY: 4 }, // 16
  SE: { gridX: 1, gridY: 4 }, // 17
  SW: { gridX: 2, gridY: 4 }, // 18
  NW: { gridX: 3, gridY: 4 }, // 19
} as const satisfies Record<keyof typeof WALL_CORNER, TileOffset>;

/** Base wall face offset for a 0-15 mask (4x4 grid, row-major). */
export function wallBaseOffset(mask: number): TileOffset {
  return { gridX: mask & 3, gridY: (mask >> 2) & 3 };
}
