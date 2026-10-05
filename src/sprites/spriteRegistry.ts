/**
 * Centralized, immutable sprite registry for the grid-based 2D typing game.
 *
 * Every sprite is addressed by a fully-qualified dot-notation key
 * (`category.name`) that maps to a `SpriteDef` referencing one sheet and a
 * grid cell. `SpriteKey = keyof typeof SPRITES` gives complete editor
 * auto-completion and compile-time safety anywhere a sprite key is expected.
 *
 * ## Asset convention
 * Sheets live under `/assets/tiles/<sheet>.png` (public dir). `columns` and
 * `rows` MUST match the real PNG grid; when you swap in an actual Dwarf
 * Fortress tileset, update those values (and the sprite grid coordinates)
 * here — the renderer derives all offsets from them, so nothing else changes.
 */

export const DEFAULT_TILE_SIZE = 32;

export interface SpriteSheet {
  /** Public URL of the sprite-sheet image (relative to the app root). */
  url: string;
  /** Edge length of a single tile in pixels. */
  tileSize: number;
  /** Number of tile columns in the sheet grid. */
  columns: number;
  /** Number of tile rows in the sheet grid. */
  rows: number;
  /** Human-readable label for tooling / debugging. */
  label: string;
}

export const SPRITE_SHEETS = {
  ramp_stone: {
    url: '/assets/tiles/ramps_stone.png',
    tileSize: 32,
    columns: 15,
    rows: 13,
    label: 'Terrain & Walls',
  },
  mining: {
    url: '/assets/tiles/mining.png',
    tileSize: 32,
    columns: 4,
    rows: 2,
    label: 'Digging / Mining Progress',
  },
  actors: {
    url: '/assets/tiles/actors.png',
    tileSize: 32,
    columns: 4,
    rows: 2,
    label: 'Player Actors',
  },
  monsters: {
    url: '/assets/tiles/monsters.png',
    tileSize: 32,
    columns: 4,
    rows: 2,
    label: 'Dynamic Monsters / Overlays',
  },
  vein: {
    url: '/assets/tiles/vein.png',
    tileSize: 32,
    columns: 4,
    rows: 4,
    label: 'Connected Mineral Veins (16 bitmask tiles)',
  },
  wall: {
    url: '/assets/tiles/wall.png',
    tileSize: 32,
    columns: 4,
    rows: 4,
    label: 'Connected Wall Faces (16 bitmask tiles)',
  },
} as const satisfies Record<string, SpriteSheet>;

export type SheetKey = keyof typeof SPRITE_SHEETS;

export interface SpriteDef {
  /** Which sheet this sprite lives on. Typed so a bad sheet key is a compile error. */
  sheet: SheetKey;
  /** Tile column (0-based) within the sheet. */
  gridX: number;
  /** Tile row (0-based) within the sheet. */
  gridY: number;
}

export const SPRITES = {
  // --- Terrain & Walls -------------------------------------------------------
  'terrain.rock.floor': { sheet: 'ramp_stone', gridX: 5, gridY: 9},
  'terrain.rock.ramp-up-north': { sheet: 'ramp_stone', gridX: 3, gridY: 5 },
  'terrain.solid-rock': { sheet: 'ramp_stone', gridX: 0, gridY: 0 },
  'terrain.tunnel-ceiling': { sheet: 'ramp_stone', gridX: 1, gridY: 0 },
  'terrain.cleared-path': { sheet: 'ramp_stone', gridX: 2, gridY: 0 },
  'terrain.wall-north': { sheet: 'ramp_stone', gridX: 3, gridY: 0 },
  'terrain.wall-south': { sheet: 'ramp_stone', gridX: 0, gridY: 1 },
  'terrain.wall-east': { sheet: 'ramp_stone', gridX: 1, gridY: 1 },
  'terrain.wall-west': { sheet: 'ramp_stone', gridX: 2, gridY: 1 },

  // --- Digging / Mining progress frames -------------------------------------
  'mining.progress-0': { sheet: 'mining', gridX: 0, gridY: 0 },
  'mining.progress-1': { sheet: 'mining', gridX: 1, gridY: 0 },
  'mining.progress-2': { sheet: 'mining', gridX: 2, gridY: 0 },
  'mining.progress-3': { sheet: 'mining', gridX: 3, gridY: 0 },

  // --- Player actors ---------------------------------------------------------
  'actor.dwarf-miner-idle': { sheet: 'actors', gridX: 0, gridY: 0 },
  'actor.dwarf-miner-digging': { sheet: 'actors', gridX: 1, gridY: 0 },
  'actor.dwarf-miner-swing-0': { sheet: 'actors', gridX: 2, gridY: 0 },
  'actor.dwarf-miner-swing-1': { sheet: 'actors', gridX: 3, gridY: 0 },
  'actor.dwarf-miner-swing-2': { sheet: 'actors', gridX: 0, gridY: 1 },
  'actor.dwarf-miner-swing-3': { sheet: 'actors', gridX: 1, gridY: 1 },

  // --- Dynamic monsters / overlays ------------------------------------------
  'monster.forgotten-beast.head': { sheet: 'monsters', gridX: 0, gridY: 0 },
  'monster.forgotten-beast.body': { sheet: 'monsters', gridX: 1, gridY: 0 },
  'monster.forgotten-beast.tentacle': { sheet: 'monsters', gridX: 2, gridY: 0 },
  'monster.forgotten-beast.overlay': { sheet: 'monsters', gridX: 3, gridY: 0 },

  // --- Connected features (auto-tiling identity / fallback keys) ------------
  'vein.gold': { sheet: 'vein', gridX: 0, gridY: 0 },
  'wall.face': { sheet: 'wall', gridX: 0, gridY: 0 },
} as const satisfies Record<string, SpriteDef>;

/** Union of every registered sprite key — use this for props/args. */
export type SpriteKey = keyof typeof SPRITES;

/** Reusable animation sequences, expressed as ordered sprite keys. */
export const ANIMATIONS = {
  pickaxeSwing: [
    'actor.dwarf-miner-swing-0',
    'actor.dwarf-miner-swing-1',
    'actor.dwarf-miner-swing-2',
    'actor.dwarf-miner-swing-3',
  ],
  miningProgress: [
    'mining.progress-0',
    'mining.progress-1',
    'mining.progress-2',
    'mining.progress-3',
  ],
} as const satisfies Record<string, readonly SpriteKey[]>;

export type AnimationName = keyof typeof ANIMATIONS;

// --- Lookup helpers ---------------------------------------------------------

export function getSheet(key: SheetKey): SpriteSheet {
  return SPRITE_SHEETS[key];
}

export function getSpriteDef(key: SpriteKey): SpriteDef {
  return SPRITES[key];
}

export interface ResolvedSprite {
  def: SpriteDef;
  sheet: SpriteSheet;
}

/** Resolve a sprite key to its definition plus the sheet it references. */
export function resolveSprite(key: SpriteKey): ResolvedSprite {
  const def = SPRITES[key];
  return { def, sheet: SPRITE_SHEETS[def.sheet] };
}

/** Unique sheet URLs across the registry — what the preloader loads. */
export function getAllSheetUrls(): string[] {
  return Array.from(new Set(Object.values(SPRITE_SHEETS).map((sheet) => sheet.url)));
}

export interface SpriteStyle {
  width: number;
  height: number;
  backgroundImage: string;
  backgroundPosition: string;
  backgroundSize: string;
  backgroundRepeat: 'no-repeat';
}

/**
 * Compute the CSS background box that isolates a single tile at the given
 * scale. Offsets are `-grid * tileSize`; the whole sheet is scaled to
 * `columns/rows * tileSize * scale` so the position math stays pixel-exact.
 * `scale` should be an integer for pixel-perfect output.
 */
export function computeSpriteStyleFromOffset(
  sheet: SheetKey,
  gridX: number,
  gridY: number,
  scale = 1,
): SpriteStyle {
  const meta = SPRITE_SHEETS[sheet];
  const px = Math.round(meta.tileSize * scale);
  const sheetW = Math.round(meta.columns * meta.tileSize * scale);
  const sheetH = Math.round(meta.rows * meta.tileSize * scale);
  const offsetX = Math.round(gridX * meta.tileSize * scale);
  const offsetY = Math.round(gridY * meta.tileSize * scale);

  return {
    width: px,
    height: px,
    backgroundImage: `url("${meta.url}")`,
    backgroundPosition: `-${offsetX}px -${offsetY}px`,
    backgroundSize: `${sheetW}px ${sheetH}px`,
    backgroundRepeat: 'no-repeat',
  };
}

/** Convenience wrapper: resolve a sprite key and compute its background box. */
export function computeSpriteStyle(key: SpriteKey, scale = 1): SpriteStyle {
  const { def } = resolveSprite(key);
  return computeSpriteStyleFromOffset(def.sheet, def.gridX, def.gridY, scale);
}
