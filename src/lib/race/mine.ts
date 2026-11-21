import { createSeededRandom } from './text-generator';

/**
 * Mining-track domain (DES-04 signature element, COURSE-05): the pure rules
 * that turn a participant's validated-character position into a Dwarf-Fortress
 * style "mining" progression.
 *
 * A **block** is one wall tile and always costs 10 characters to mine; a
 * **column** is 3 blocks (3 tiles of height) and therefore 30 characters. The
 * player mines a column top-to-bottom (block 0 → 1 → 2) and then moves to the
 * next column; the server streams columns as a ring buffer and discards the
 * mined ones. Each block "blinks" (cracks) at the 5th and 7th character of its
 * 10-character lifetime.
 *
 * A **vein** is a solid block carrying a mineral; each mineral has a
 * `goldValue` (the coins credited to the player's account when the block is
 * mined). Rarity is a fixed weighted distribution, drawn from a seeded PRNG so
 * a race's world replays from its seed (BOT-05-style reproducibility).
 *
 * This module is pure: no React, no Node/Next, no database — it is imported
 * by the sprite layer (for mineral tinting), by the realtime protocol (for the
 * wire contract), by the race engine (for authoritative generation/gold) and
 * by the client components (for the render window).
 */

/** Characters a single wall block costs to mine. */
export const CHARS_PER_BLOCK = 10;

/** Number of blocks (tiles of height) per column. */
export const BLOCKS_PER_COLUMN = 3;

/** Characters a full 3-block column costs to mine. */
export const CHARS_PER_COLUMN = CHARS_PER_BLOCK * BLOCKS_PER_COLUMN;

/** How many columns the server streams ahead of the current column. */
export const TRACK_COLUMNS_AHEAD = 16;

/** Characters within a block at which the block "blinks" (cracks). */
export const BLOCK_BLINK_AT = [5, 7] as const;

// --- Minerals -----------------------------------------------------------------

export const MINERAL_IDS = ['coal', 'copper', 'iron', 'silver', 'gold'] as const;

export type MineralId = (typeof MINERAL_IDS)[number];

/**
 * Coins credited to the player account when a block of this mineral is mined.
 * Ordered like {@link MINERAL_VALUE_ORDER} — coal is the least valuable vein,
 * gold the most.
 */
export const MINERAL_GOLD_VALUES: Record<MineralId, number> = {
  coal: 1,
  copper: 2,
  iron: 5,
  silver: 10,
  gold: 25,
};

/**
 * Ascending mineral value order used by the condensed top-3 view. Wall (no
 * mineral) ranks below every entry here, i.e. `wall < coal < copper < iron <
 * silver < gold`.
 */
export const MINERAL_VALUE_ORDER: readonly MineralId[] = [
  'coal',
  'copper',
  'iron',
  'silver',
  'gold',
];

const MINERAL_VALUE_RANK: Readonly<Record<MineralId, number>> = (() => {
  const rank = {} as Record<MineralId, number>;
  MINERAL_VALUE_ORDER.forEach((mineral, index) => {
    rank[mineral] = index + 1;
  });
  return rank;
})();

/** Numeric value rank of a mineral (wall = 0, coal = 1, … gold = 5). */
export function mineralValueRank(mineral: MineralId): number {
  return MINERAL_VALUE_RANK[mineral];
}

// --- Tiles --------------------------------------------------------------------

/** One mined-out or unmined block; `mineral: null` is a plain wall. */
export interface TileKind {
  mineral: MineralId | null;
}

/** A 3-block column, top to bottom. */
export type TileColumn = [TileKind, TileKind, TileKind];

/** A plain wall block (no mineral). */
export function wallTile(): TileKind {
  return { mineral: null };
}

/** A vein block carrying the given mineral. */
export function veinTile(mineral: MineralId): TileKind {
  return { mineral };
}

/** Rarity weights for generated blocks (documented assumption; tweakable). */
const TILE_KIND_WEIGHTS: ReadonlyArray<{ tile: TileKind; weight: number }> = [
  { tile: wallTile(), weight: 60 },
  { tile: veinTile('coal'), weight: 20 },
  { tile: veinTile('copper'), weight: 10 },
  { tile: veinTile('iron'), weight: 6 },
  { tile: veinTile('silver'), weight: 3 },
  { tile: veinTile('gold'), weight: 1 },
];

const TOTAL_TILE_WEIGHT = TILE_KIND_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0);

/** Draws one block from the rarity distribution using a seeded PRNG. */
export function generateTile(rng: () => number): TileKind {
  const roll = rng() * TOTAL_TILE_WEIGHT;
  let acc = 0;
  for (const entry of TILE_KIND_WEIGHTS) {
    acc += entry.weight;
    if (roll < acc) {
      return entry.tile;
    }
  }
  return TILE_KIND_WEIGHTS[TILE_KIND_WEIGHTS.length - 1].tile;
}

/** Generates one 3-block column, top to bottom. */
export function generateColumn(rng: () => number): TileColumn {
  return [generateTile(rng), generateTile(rng), generateTile(rng)];
}

/** The highest-value mineral among a column's blocks, or `null` for pure wall. */
export function highestValueMineral(tiles: readonly TileKind[]): MineralId | null {
  let best: MineralId | null = null;
  for (const tile of tiles) {
    if (tile.mineral !== null && (best === null || mineralValueRank(tile.mineral) > mineralValueRank(best))) {
      best = tile.mineral;
    }
  }
  return best;
}

/** Coins earned by mining a whole column (the sum of its veins' values). */
export function columnGoldValue(column: TileColumn): number {
  let sum = 0;
  for (const tile of column) {
    if (tile.mineral !== null) {
      sum += MINERAL_GOLD_VALUES[tile.mineral];
    }
  }
  return sum;
}

// --- Position mapping ---------------------------------------------------------

/** Absolute column index of a character position. */
export function columnOf(position: number): number {
  return Math.floor(position / CHARS_PER_COLUMN);
}

/** Which block (row 0..2, top to bottom) of the current column is being mined. */
export function blockIndexWithinColumn(position: number): number {
  return Math.floor((position % CHARS_PER_COLUMN) / CHARS_PER_BLOCK);
}

/** Characters mined within the current block (0..9). */
export function charsWithinBlock(position: number): number {
  return position % CHARS_PER_BLOCK;
}

/**
 * Crack frame (`mining.progress-0..3`) for a block at `chars` characters into
 * its 10-character lifetime. The frame changes at {@link BLOCK_BLINK_AT} (chars
 * 5 and 7) — the two "blinks" — and steps to the final frame just before the
 * block breaks.
 */
export function digFrameForChars(chars: number): number {
  const clamped = Math.max(0, Math.min(CHARS_PER_BLOCK - 1, Math.floor(chars)));
  if (clamped < BLOCK_BLINK_AT[0]) {
    return 0;
  }
  if (clamped < BLOCK_BLINK_AT[1]) {
    return 1;
  }
  if (clamped < CHARS_PER_BLOCK - 1) {
    return 2;
  }
  return 3;
}

// --- Column stream (ring buffer) ---------------------------------------------

/** A bounded look-ahead buffer of generated columns (the "infinite" mine). */
export interface ColumnStream {
  /** The absolute index of the current (about-to-be-mined) column. */
  readonly column: number;
  /** The next `count` columns, starting at the current column. */
  peek(count: number): TileColumn[];
  /** Mines the current column, returns it, and appends a fresh one behind. */
  advance(): TileColumn;
}

/** Columns kept ahead of the current one so `peek` never underflows. */
const STREAM_PREFILL = 32;

/**
 * A seeded column stream. The buffer is pre-filled at construction and topped
 * back up on every `advance`, so `peek` never triggers generation and the RNG
 * stream is deterministic given the seed and the number of advances (BOT-05
 * reproducibility). `advance` is monotonic-only by construction.
 */
export function createColumnStream(seed: number): ColumnStream {
  const rng = createSeededRandom(seed);
  const buffer: TileColumn[] = [];
  let column = 0;

  for (let i = 0; i < STREAM_PREFILL; i++) {
    buffer.push(generateColumn(rng));
  }

  return {
    get column() {
      return column;
    },
    peek(count: number): TileColumn[] {
      return buffer.slice(0, Math.max(0, count));
    },
    advance(): TileColumn {
      if (buffer.length === 0) {
        buffer.push(generateColumn(rng));
      }
      const removed = buffer.shift() as TileColumn;
      column += 1;
      while (buffer.length < STREAM_PREFILL) {
        buffer.push(generateColumn(rng));
      }
      return removed;
    },
  };
}
