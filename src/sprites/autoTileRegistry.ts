import type { SheetKey } from './spriteRegistry';

/**
 * Auto-tiling registry (Dwarf Fortress wall / vein visibility).
 *
 * Walls and mineral veins use an 8-way visibility model:
 *   * a solid cell renders a face only when at least one of its 8 neighbors is Air;
 *   * the base face is chosen from a 4-bit mask of SOLID orthogonal neighbors;
 *   * diagonal inner corners are drawn as overlays on top of the base face.
 *
 * ## Sheet layout
 * `wall` (rock_wall.png) and `vein` (vein.png) are 4x5 grids: 16 base faces
 * (indices 0-15, row-major) plus 4 inner-corner overlays on the 5th row
 * (indices 16-19: NE, SE, SW, NW). The vein sheet is grayscale and is tinted
 * per mineral via `MINERALS[].tint`.
 */

export const MASK = {
  NORTH: 1,
  EAST: 2,
  SOUTH: 4,
  WEST: 8,
} as const;

export interface TileOffset {
  gridX: number;
  gridY: number;
}

// --- Mineral veins -----------------------------------------------------------

export interface Mineral {
  /** CSS color used to tint the grayscale vein sprite (multiply blend). */
  tint: string;
  /** Human-readable label for tooling / debugging. */
  label: string;
}

/** Mineral veins available in the world. Each carries its own tint color. */
export const MINERALS = {
  gold: { tint: '#eec14b', label: 'Gold' },
  silver: { tint: '#c9d1d9', label: 'Silver' },
  iron: { tint: '#b08d68', label: 'Iron' },
  copper: { tint: '#d98a5f', label: 'Copper' },
  coal: { tint: '#3a3a3a', label: 'Coal' },
} as const satisfies Record<string, Mineral>;

export type MineralId = keyof typeof MINERALS;

// --- Wall / vein visibility --------------------------------------------------

/** Rock wall sheet key: 4x5 grid (16 base faces + 4 corner overlays). */
export const WALL_SHEET: SheetKey = 'wall';

/** Grayscale vein sheet key (tinted per mineral). */
export const VEIN_SHEET: SheetKey = 'vein';

/** Wall inner-corner overlay flags. */
export const WALL_CORNER = {
  NE: 1,
  SE: 2,
  SW: 4,
  NW: 8,
} as const;

/** Atlas offsets for the 4 diagonal inner-corner overlays (indices 16-19). */
export const WALL_CORNER_OFFSETS = {
  NE: { gridX: 0, gridY: 4 },
  SE: { gridX: 1, gridY: 4 },
  SW: { gridX: 2, gridY: 4 },
  NW: { gridX: 3, gridY: 4 },
} as const satisfies Record<keyof typeof WALL_CORNER, TileOffset>;

/** Base wall face offset for a 0-15 mask (4x4 grid, row-major). */
export function wallBaseOffset(mask: number): TileOffset {
  return { gridX: mask & 3, gridY: (mask >> 2) & 3 };
}
