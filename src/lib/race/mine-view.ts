import type { RaceTrackParticipant } from '../../realtime/client-types';
import { airTile, solidTile, type GridCell } from '../../sprites/autoTileEvaluator';
import {
  blockIndexWithinColumn,
  charsWithinBlock,
  CHARS_PER_COLUMN,
  columnOf,
  digFrameForChars,
  type TileKind,
  wallTile,
} from './mine';

/**
 * Pure client-side view builders for the tile-based progress track (DES-04,
 * COURSE-05). They turn a `raceTick` participant (position + streamed mining
 * window) into the `GridCell` layers the sprite system renders — no React,
 * no DOM.
 *
 * Normal-variant layout (the "camera follows the miner" tunnel):
 *
 *   [floor …] [miner] [wall/vein … up to the last column] [floor …]
 *
 * The miner is always in the center column, on the block (row 0..2) being
 * mined. The tiles to the left are the mined floor he came from (a tunnel),
 * and the tiles to the right are the streamed ahead columns — but only up to
 * the race's last column (`ceil(totalLength / 30)`); beyond that they render
 * as floor too, so the player sees the end of the tunnel approaching.
 * Auto-tiling exposure — minerals only showing their vein face when adjacent
 * to air — is left to the existing `resolveCellSprites`.
 */

/** Tile rows of a normal (3-high) player row. */
export const NORMAL_ROW_COUNT = 3;

/** Floor columns rendered behind the miner (the tunnel he came from). */
export const MINER_COLUMN = 4;

/** Columns rendered ahead of the miner (≤ `TRACK_COLUMNS_AHEAD - 1`). */
export const AHEAD_COLUMNS = 12;

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
  // The last column the player will mine: totalLength / 30, rounded up.
  const totalColumns = Math.ceil(participant.totalLength / CHARS_PER_COLUMN);

  const grid: GridCell[][] = Array.from({ length: NORMAL_ROW_COUNT }, () =>
    Array.from({ length: NORMAL_GRID_COLUMNS }, () => airTile('terrain.rock.floor')),
  );

  for (let col = 0; col < NORMAL_GRID_COLUMNS; col++) {
    if (col < MINER_COLUMN) {
      // Behind the miner: the tunnel floor he came from.
      continue; // already floor
    }

    if (col === MINER_COLUMN) {
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
      continue;
    }

    // Ahead of the miner: the streamed window (track[1..]) until the last
    // column, then floor — the visible end of the tunnel.
    const aheadIndex = col - MINER_COLUMN;
    const absoluteColumn = column + aheadIndex;
    if (absoluteColumn >= totalColumns) {
      continue; // already floor
    }
    for (let row = 0; row < NORMAL_ROW_COUNT; row++) {
      grid[row][col] = solidTile('terrain.solid-rock', trackTile(participant.track, aheadIndex, row).mineral ?? undefined);
    }
  }

  return { grid, miner: { row: blockIndex, col: MINER_COLUMN } };
}
