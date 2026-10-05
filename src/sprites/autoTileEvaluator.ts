import type { SheetKey, SpriteKey } from './spriteRegistry';
import { resolveSprite } from './spriteRegistry';
import {
  CONNECTABLE,
  CONNECTED_SETS,
  MASK,
  resolveMaskOffset,
  WALL_CORNER,
  WALL_CORNER_OFFSETS,
  WALL_SHEET,
  wallBaseOffset,
  type ConnectedFeature,
} from './autoTileRegistry';

/**
 * Multi-layer grid cell. Layers render back-to-front:
 *   floor/surface -> veinOrFeature -> diggingState -> occupant.
 *
 * Tile state is expressed with flags (not by matching exact sprite keys):
 *   isSolid (IS_SOLID) — any wall variant: natural stone, mineral vein, dirt, built wall.
 *   isAir   (IS_AIR)   — walkable/open space or unrevealed void.
 * `floor_type` is the tile's surface texture: the floor for air cells, and the
 * interior fill (rock top) for solid cells that are buried from air.
 */
export interface GridCell {
  isSolid: boolean;
  isAir: boolean;
  floor_type: SpriteKey;
  veinOrFeature?: SpriteKey;
  diggingState?: { frame: number };
  occupant?: { spriteKey: SpriteKey; animationState?: string };
}

/** A fully-resolved tile reference (sheet + cell), independent of SpriteKey. */
export interface ResolvedSpriteRef {
  sheet: SheetKey;
  gridX: number;
  gridY: number;
}

/** Solid wall tile (IS_SOLID). */
export function solidTile(floor_type: SpriteKey): GridCell {
  return { isSolid: true, isAir: false, floor_type };
}

/** Air / open-space tile (IS_AIR). */
export function airTile(floor_type: SpriteKey): GridCell {
  return { isSolid: false, isAir: true, floor_type };
}

interface NeighborStep {
  dr: number;
  dc: number;
  bit: number;
}

const NEIGHBORS: readonly NeighborStep[] = [
  { dr: -1, dc: 0, bit: MASK.NORTH },
  { dr: 0, dc: 1, bit: MASK.EAST },
  { dr: 1, dc: 0, bit: MASK.SOUTH },
  { dr: 0, dc: -1, bit: MASK.WEST },
];

/** All 8 neighbor deltas in a stable order: N, E, S, W, NE, SE, SW, NW. */
const DIRS_8: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
];

const DIG_FRAMES: readonly SpriteKey[] = [
  'mining.progress-0',
  'mining.progress-1',
  'mining.progress-2',
  'mining.progress-3',
];

/** True when two cells belong to the same connectable family. */
export function sameFamily(
  a: ConnectedFeature | undefined,
  b: ConnectedFeature | undefined,
): boolean {
  return Boolean(a && b && a.family === b.family);
}

/** Compute the 4-way neighbor bitmask for a cell using the given feature selector. */
export function computeNeighborMask(
  grid: readonly GridCell[][],
  row: number,
  col: number,
  select: (cell: GridCell) => SpriteKey | undefined,
): number {
  const center = grid[row]?.[col];
  if (!center) return 0;
  const centerKey = select(center);
  if (centerKey === undefined) return 0;
  const centerFeature = CONNECTABLE[centerKey];

  let mask = 0;
  for (const { dr, dc, bit } of NEIGHBORS) {
    const neighbor = grid[row + dr]?.[col + dc];
    const neighborKey = neighbor ? select(neighbor) : undefined;
    if (neighborKey === undefined) continue;
    if (sameFamily(centerFeature, CONNECTABLE[neighborKey])) mask |= bit;
  }
  return mask;
}

// --- Dwarf Fortress wall visibility autotiling -------------------------------

export interface WallEvaluation {
  /** false = interior/hidden (surrounded by solid — no face drawn). */
  visible: boolean;
  /** 4-bit base mask: N=1, E=2, S=4, W=8 (which orthogonal neighbors are SOLID). */
  baseMask: number;
  /** Bitmask of active diagonal inner corners (WALL_CORNER.NE/SE/SW/NW). */
  corners: number;
}

function solidAt(grid: readonly GridCell[][], row: number, col: number): boolean {
  return grid[row]?.[col]?.isSolid ?? false;
}

function airAt(grid: readonly GridCell[][], row: number, col: number): boolean {
  const cell = grid[row]?.[col];
  return cell ? cell.isAir : true; // out-of-bounds = air
}

/**
 * Evaluate DF-style wall visibility for a cell using all 8 neighbors.
 * The base mask reads each orthogonal neighbor's IS_SOLID flag; air exposure
 * and inner corners read each neighbor's IS_AIR flag. Out-of-bounds = Air.
 */
export function evaluateWall(
  grid: readonly GridCell[][],
  row: number,
  col: number,
): WallEvaluation {
  const center = grid[row]?.[col];
  if (!center || !center.isSolid) {
    return { visible: false, baseMask: 0, corners: 0 };
  }

  const N = solidAt(grid, row - 1, col);
  const E = solidAt(grid, row, col + 1);
  const S = solidAt(grid, row + 1, col);
  const W = solidAt(grid, row, col - 1);

  const NE_air = airAt(grid, row - 1, col + 1);
  const SE_air = airAt(grid, row + 1, col + 1);
  const SW_air = airAt(grid, row + 1, col - 1);
  const NW_air = airAt(grid, row - 1, col - 1);

  const exposed =
    airAt(grid, row - 1, col) ||
    airAt(grid, row, col + 1) ||
    airAt(grid, row + 1, col) ||
    airAt(grid, row, col - 1) ||
    NE_air ||
    SE_air ||
    SW_air ||
    NW_air;

  const baseMask =
    (N ? MASK.NORTH : 0) |
    (E ? MASK.EAST : 0) |
    (S ? MASK.SOUTH : 0) |
    (W ? MASK.WEST : 0);

  const corners =
    (N && E && NE_air ? WALL_CORNER.NE : 0) |
    (S && E && SE_air ? WALL_CORNER.SE : 0) |
    (S && W && SW_air ? WALL_CORNER.SW : 0) |
    (N && W && NW_air ? WALL_CORNER.NW : 0);

  return { visible: exposed, baseMask, corners };
}

/** Resolve a solid wall cell into its wall-face layers (base + corner overlays).
 *  Returns [] for interior/hidden walls (no face drawn). */
export function resolveWallCell(
  grid: readonly GridCell[][],
  row: number,
  col: number,
): ResolvedSpriteRef[] {
  const { visible, baseMask, corners } = evaluateWall(grid, row, col);
  if (!visible) return [];

  const layers: ResolvedSpriteRef[] = [
    { sheet: WALL_SHEET, ...wallBaseOffset(baseMask) },
  ];
  if (corners & WALL_CORNER.NE) layers.push({ sheet: WALL_SHEET, ...WALL_CORNER_OFFSETS.NE });
  if (corners & WALL_CORNER.SE) layers.push({ sheet: WALL_SHEET, ...WALL_CORNER_OFFSETS.SE });
  if (corners & WALL_CORNER.SW) layers.push({ sheet: WALL_SHEET, ...WALL_CORNER_OFFSETS.SW });
  if (corners & WALL_CORNER.NW) layers.push({ sheet: WALL_SHEET, ...WALL_CORNER_OFFSETS.NW });
  return layers;
}

// --- memoized cell resolver --------------------------------------------------

const cache = new Map<string, ResolvedSpriteRef[]>();
const MAX_CACHE_ENTRIES = 20_000;

/** Clear the memo cache (mainly for tests and hot reloads). */
export function clearAutoTileCache(): void {
  cache.clear();
}

/**
 * Resolve a cell into its ordered back-to-front layer list:
 *   0 floor/surface -> 1 connected vein/feature -> 2 dig overlay -> 3 actor/item.
 *
 * Air cells render their `floor_type`; solid cells render a wall face when
 * exposed to air, or their `floor_type` as interior fill when buried.
 *
 * Pure with respect to (grid, row, col); memoized on a content-based key so
 * unchanged cells return the same array reference across grid updates.
 */
export function resolveCellSprites(
  grid: readonly GridCell[][],
  row: number,
  col: number,
): ResolvedSpriteRef[] {
  const cell = grid[row]?.[col];
  if (!cell) return [];

  const key = signature(grid, row, col);
  const cached = cache.get(key);
  if (cached) return cached;

  const layers = buildLayers(grid, row, col);
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(key, layers);
  return layers;
}

function buildLayers(grid: readonly GridCell[][], row: number, col: number): ResolvedSpriteRef[] {
  const cell = grid[row][col];
  const layers: ResolvedSpriteRef[] = [];

  layers.push(...resolveBaseLayer(cell, grid, row, col));

  if (cell.veinOrFeature) {
    layers.push(...resolveConnectable(cell.veinOrFeature, grid, row, col, (c) => c.veinOrFeature));
  }

  if (cell.diggingState) {
    layers.push(spriteRef(digFrameKey(cell.diggingState.frame)));
  }

  if (cell.occupant) {
    layers.push(spriteRef(cell.occupant.spriteKey));
  }

  return layers;
}

/** Base layer: wall face for exposed solid, interior fill for buried solid, floor for air. */
function resolveBaseLayer(
  cell: GridCell,
  grid: readonly GridCell[][],
  row: number,
  col: number,
): ResolvedSpriteRef[] {
  if (cell.isSolid) {
    const wall = resolveWallCell(grid, row, col);
    return wall.length > 0 ? wall : [spriteRef(cell.floor_type)];
  }
  return [spriteRef(cell.floor_type)];
}

function resolveConnectable(
  key: SpriteKey,
  grid: readonly GridCell[][],
  row: number,
  col: number,
  select: (cell: GridCell) => SpriteKey | undefined,
): ResolvedSpriteRef[] {
  const feature = CONNECTABLE[key];
  if (!feature) return [spriteRef(key)];

  const set = CONNECTED_SETS[feature.set];
  const mask = computeNeighborMask(grid, row, col, select);
  const offset = resolveMaskOffset(set, mask);
  return [{ sheet: set.sheet, gridX: offset.gridX, gridY: offset.gridY }];
}

function spriteRef(key: SpriteKey): ResolvedSpriteRef {
  const { def } = resolveSprite(key);
  return { sheet: def.sheet, gridX: def.gridX, gridY: def.gridY };
}

function digFrameKey(frame: number): SpriteKey {
  const index = Math.max(0, Math.min(DIG_FRAMES.length - 1, Math.floor(frame)));
  return DIG_FRAMES[index];
}

function signature(grid: readonly GridCell[][], row: number, col: number): string {
  const cell = grid[row][col];
  const parts: (string | number)[] = [
    row,
    col,
    Number(cell.isSolid),
    Number(cell.isAir),
    cell.floor_type,
  ];

  for (const [dr, dc] of DIRS_8) {
    const neighbor = grid[row + dr]?.[col + dc];
    parts.push(neighbor ? `${Number(neighbor.isSolid)}${Number(neighbor.isAir)}` : 'o');
  }

  parts.push(
    cell.veinOrFeature ?? '',
    grid[row - 1]?.[col]?.veinOrFeature ?? '',
    grid[row]?.[col + 1]?.veinOrFeature ?? '',
    grid[row + 1]?.[col]?.veinOrFeature ?? '',
    grid[row]?.[col - 1]?.veinOrFeature ?? '',
    cell.diggingState?.frame ?? '',
    cell.occupant?.spriteKey ?? '',
  );

  return parts.join('|');
}
