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
 * `vein.png` / `wall.png` use a 4x4 grid where tile at (gridX, gridY) == mask:
 *   gridX = mask % 4, gridY = floor(mask / 4).
 * When you wire up a real DF tileset, just point `sheet` at it and adjust the
 * `masks` offsets here — nothing downstream needs to change.
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
  wallFaces: buildSet('wall', 0),
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
  'wall.face': { family: 'wall', set: 'wallFaces' },
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
