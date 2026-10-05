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
  WALL_SOLID_KEYS,
  wallBaseOffset,
  type ConnectedFeature,
} from './autoTileRegistry';

/**
 * Multi-layer grid cell. Layers render back-to-front:
 *   baseTerrain -> veinOrFeature -> diggingState -> occupant.
 */
export interface GridCell {
  /** Bottom layer: unmined rock, soil, or bedrock. */
  baseTerrain: SpriteKey;
  /** Connectable layer: ore vein, magma stream, water, moss, … */
  veinOrFeature?: SpriteKey;
  /** Overlay layer: cracks / broken stone sequence (frame 0..3). */
  diggingState?: { frame: number };
  /** Top layer: dwarf miner, monster, item, … */
  occupant?: { spriteKey: SpriteKey; animationState?: string };
}

/** A fully-resolved tile reference (sheet + cell), independent of SpriteKey. */
export interface ResolvedSpriteRef {
  sheet: SheetKey;
  gridX: number;
  gridY: number;
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
  /** false = interior/hidden (surrounded by solid walls — no face drawn). */
  visible: boolean;
  /** 4-bit base mask: N=1, E=2, S=4, W=8 (which orthogonal neighbors are SOLID). */
  baseMask: number;
  /** Bitmask of active diagonal inner corners (WALL_CORNER.NE/SE/SW/NW). */
  corners: number;
}

/** A cell is a solid wall when its base terrain is in WALL_SOLID_KEYS. */
export function isSolidWall(cell: GridCell | undefined): boolean {
  return Boolean(cell && WALL_SOLID_KEYS.has(cell.baseTerrain));
}

/**
 * Evaluate DF-style wall visibility for a cell using all 8 neighbors.
 * Out-of-bounds cells count as Air (not solid).
 */
export function evaluateWall(
  grid: readonly GridCell[][],
  row: number,
  col: number,
  isSolid: (cell: GridCell | undefined) => boolean = isSolidWall,
): WallEvaluation {
  const center = grid[row]?.[col];
  if (!center || !isSolid(center)) {
    return { visible: false, baseMask: 0, corners: 0 };
  }

  const N = isSolid(grid[row - 1]?.[col]);
  const E = isSolid(grid[row]?.[col + 1]);
  const S = isSolid(grid[row + 1]?.[col]);
  const W = isSolid(grid[row]?.[col - 1]);
  const NE = isSolid(grid[row - 1]?.[col + 1]);
  const SE = isSolid(grid[row + 1]?.[col + 1]);
  const SW = isSolid(grid[row + 1]?.[col - 1]);
  const NW = isSolid(grid[row - 1]?.[col - 1]);

  const airNeighbors = [N, E, S, W, NE, SE, SW, NW].filter((solid) => !solid).length;

  const baseMask =
    (N ? MASK.NORTH : 0) |
    (E ? MASK.EAST : 0) |
    (S ? MASK.SOUTH : 0) |
    (W ? MASK.WEST : 0);

  const corners =
    (N && E && !NE ? WALL_CORNER.NE : 0) |
    (S && E && !SE ? WALL_CORNER.SE : 0) |
    (S && W && !SW ? WALL_CORNER.SW : 0) |
    (N && W && !NW ? WALL_CORNER.NW : 0);

  return { visible: airNeighbors > 0, baseMask, corners };
}

/** Resolve a solid wall cell into its wall-face layers (base + corner overlays).
 *  Returns [] for interior/hidden walls (no face drawn). */
export function resolveWallCell(
  grid: readonly GridCell[][],
  row: number,
  col: number,
  isSolid: (cell: GridCell | undefined) => boolean = isSolidWall,
): ResolvedSpriteRef[] {
  const { visible, baseMask, corners } = evaluateWall(grid, row, col, isSolid);
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

type LayerSelector = 'baseTerrain' | 'veinOrFeature';

const cache = new Map<string, ResolvedSpriteRef[]>();
const MAX_CACHE_ENTRIES = 20_000;

/** Clear the memo cache (mainly for tests and hot reloads). */
export function clearAutoTileCache(): void {
  cache.clear();
}

/**
 * Resolve a cell into its ordered back-to-front layer list:
 *   0 base terrain -> 1 connected vein/wall -> 2 dig overlay -> 3 actor/item.
 *
 * Pure with respect to (grid, row, col); results are memoized on a
 * content-based key so unchanged cells return the same array reference across
 * grid updates — letting React skip re-renders of untouched tiles.
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

/** Base terrain layer: DF wall faces for solid walls, else generic connectable/plain. */
function resolveBaseLayer(
  cell: GridCell,
  grid: readonly GridCell[][],
  row: number,
  col: number,
): ResolvedSpriteRef[] {
  if (isSolidWall(cell)) {
    const wall = resolveWallCell(grid, row, col);
    return wall.length > 0 ? wall : [spriteRef(cell.baseTerrain)];
  }
  return resolveConnectable(cell.baseTerrain, grid, row, col, (c) => c.baseTerrain);
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

function layerKeyAt(
  grid: readonly GridCell[][],
  row: number,
  col: number,
  layer: LayerSelector,
): SpriteKey | undefined {
  return grid[row]?.[col]?.[layer];
}

function signature(grid: readonly GridCell[][], row: number, col: number): string {
  const cell = grid[row][col];
  return [
    row,
    col,
    cell.baseTerrain,
    layerKeyAt(grid, row - 1, col, 'baseTerrain') ?? '', // N
    layerKeyAt(grid, row, col + 1, 'baseTerrain') ?? '', // E
    layerKeyAt(grid, row + 1, col, 'baseTerrain') ?? '', // S
    layerKeyAt(grid, row, col - 1, 'baseTerrain') ?? '', // W
    layerKeyAt(grid, row - 1, col + 1, 'baseTerrain') ?? '', // NE
    layerKeyAt(grid, row + 1, col + 1, 'baseTerrain') ?? '', // SE
    layerKeyAt(grid, row + 1, col - 1, 'baseTerrain') ?? '', // SW
    layerKeyAt(grid, row - 1, col - 1, 'baseTerrain') ?? '', // NW
    cell.veinOrFeature ?? '',
    layerKeyAt(grid, row - 1, col, 'veinOrFeature') ?? '',
    layerKeyAt(grid, row, col + 1, 'veinOrFeature') ?? '',
    layerKeyAt(grid, row + 1, col, 'veinOrFeature') ?? '',
    layerKeyAt(grid, row, col - 1, 'veinOrFeature') ?? '',
    cell.diggingState?.frame ?? '',
    cell.occupant?.spriteKey ?? '',
  ].join('|');
}
