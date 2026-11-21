import type { RaceTrackParticipant } from '../../realtime/client-types';
import { airTile, solidTile, type GridCell } from '../../sprites/autoTileEvaluator';
import {
  blockIndexWithinColumn,
  charsWithinBlock,
  columnOf,
  digFrameForChars,
  highestValueMineral,
  type MineralId,
  type TileKind,
  wallTile,
} from './mine';

/**
 * Pure client-side view builders for the tile-based progress track (DES-04,
 * COURSE-05). They turn a `raceTick` participant (position + streamed mining
 * window) into the `GridCell` layers the sprite system renders — no React,
 * no DOM.
 *
 * Layout (normal variant), mirroring the "camera follows the miner" model:
 *
 *   [solid rock fill] [unmined rock] [mined floor] [miner] [ahead columns]
 *
 * The miner is always in the center column, on the block (row 0..2) being
 * mined; the tiles to the left are the recently mined floor (then solid rock
 * for the "not yet mined" backdrop at the very start), and the tiles to the
 * right are the streamed ahead columns. Auto-tiling exposure — minerals only
 * showing their vein face when adjacent to air — is left to the existing
 * `resolveCellSprites`, so this module just flags solid vs air per cell.
 */

/** Tile rows of a normal (3-high) player row. */
export const NORMAL_ROW_COUNT = 3;

/** Solid-rock columns drawn on the far left (the unmined backdrop). */
export const LEFT_ROCK_COLUMNS = 4;

/** How many recently-mined floor columns sit between the rock and the miner. */
export const LEFT_MINE_COLUMNS = 4;

/** Unmined columns rendered ahead of the miner (≤ `TRACK_COLUMNS_AHEAD - 1`). */
export const AHEAD_COLUMNS = 12;

/** The column index of the miner in a normal-row grid. */
export const MINER_COLUMN = LEFT_ROCK_COLUMNS + LEFT_MINE_COLUMNS;

/** Total columns of a normal-row grid. */
export const NORMAL_GRID_COLUMNS = MINER_COLUMN + 1 + AHEAD_COLUMNS;

/** The render window for one normal (3-high) player row. */
export interface NormalTrackView {
  grid: GridCell[][];
  /** The cell the miner avatar overlays (always `MINER_COLUMN` horizontally). */
  miner: { row: number; col: number };
}

/** Fetches one tile from the streamed window, falling back to plain wall. */
function trackTile(
  track: RaceTrackParticipant['track'],
  columnIndex: number,
  row: number,
): TileKind {
  return track[columnIndex]?.[row] ?? wallTile();
}

/** Builds the 3-row × {@link NORMAL_GRID_COLUMNS} grid for one participant. */
export function buildNormalGrid(participant: RaceTrackParticipant): NormalTrackView {
  const position = participant.position;
  const column = columnOf(position);
  const blockIndex = blockIndexWithinColumn(position);
  const chars = charsWithinBlock(position);
  const minedFloorCols = Math.min(column, LEFT_MINE_COLUMNS);

  const grid: GridCell[][] = Array.from({ length: NORMAL_ROW_COUNT }, () =>
    Array.from({ length: NORMAL_GRID_COLUMNS }, () => solidTile('terrain.solid-rock')),
  );

  for (let col = 0; col < NORMAL_GRID_COLUMNS; col++) {
    if (col < MINER_COLUMN) {
      // Behind the miner: recently-mined floor, then solid rock further back.
      const isMined = MINER_COLUMN - col <= minedFloorCols;
      for (let row = 0; row < NORMAL_ROW_COUNT; row++) {
        grid[row][col] = isMined ? airTile('terrain.rock.floor') : solidTile('terrain.solid-rock');
      }
    } else if (col === MINER_COLUMN) {
      // The current column: mined above, the active block (with a crack
      // overlay), still-solid below.
      for (let row = 0; row < NORMAL_ROW_COUNT; row++) {
        if (row < blockIndex) {
          grid[row][col] = airTile('terrain.rock.floor');
        } else if (row === blockIndex) {
          grid[row][col] = {
            ...solidTile('terrain.solid-rock', trackTile(participant.track, 0, row).mineral ?? undefined),
            diggingState: { frame: digFrameForChars(chars) },
          };
        } else {
          grid[row][col] = solidTile('terrain.solid-rock', trackTile(participant.track, 0, row).mineral ?? undefined);
        }
      }
    } else {
      // Ahead of the miner: the streamed window (track[1..]).
      const aheadIndex = col - MINER_COLUMN;
      for (let row = 0; row < NORMAL_ROW_COUNT; row++) {
        grid[row][col] = solidTile('terrain.solid-rock', trackTile(participant.track, aheadIndex, row).mineral ?? undefined);
      }
    }
  }

  return { grid, miner: { row: blockIndex, col: MINER_COLUMN } };
}

/**
 * The single tile the condensed (1-high) top-3 row shows: the highest-value
 * mineral of the participant's current column, or `null` for plain wall.
 */
export function condensedMineral(participant: RaceTrackParticipant): MineralId | null {
  const column = participant.track[0] ?? [wallTile(), wallTile(), wallTile()];
  return highestValueMineral(column);
}
