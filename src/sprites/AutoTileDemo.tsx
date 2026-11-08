import { useCallback, useMemo, useState } from 'react';
import {
  airTile,
  solidTile,
  type GridCell,
} from './autoTileEvaluator';
import TileGrid from './TileGrid';
import type { Messages } from '../i18n/messages';

const ROWS = 8;
const COLS = 9;
const SCALE = 2;

const VEIN_ORIGIN = { row: 3, col: 3 }; // top-left of the 3x3 cluster
const ISOLATED = { row: 1, col: 7 }; // lone ore (isolated blob)
const DWARF = { row: 2, col: 1 }; // dwarf on the pre-mined corridor floor

function buildBaseGrid(): GridCell[][] {
  const grid: GridCell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => solidTile('terrain.solid-rock')),
  );

  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      grid[VEIN_ORIGIN.row + dr][VEIN_ORIGIN.col + dc] = solidTile('terrain.solid-rock', 'copper');
    }
  }

  grid[ISOLATED.row][ISOLATED.col] = solidTile('terrain.solid-rock', 'gold');

  grid[DWARF.row][DWARF.col] = {
    ...airTile('terrain.rock.floor'),
    occupant: { spriteKey: 'actor.dwarf-miner-idle' },
  };

  return grid;
}

const BASE_GRID: GridCell[][] = buildBaseGrid();

// Pre-mine a horizontal corridor so walls and veins are exposed on load.
const INITIAL_MINED: ReadonlySet<string> = (() => {
  const set = new Set<string>();
  for (let c = 0; c < COLS; c++) set.add(`2,${c}`);
  return set;
})();

export default function AutoTileDemo({ messages }: { messages: Messages }) {
  const [mined, setMined] = useState<ReadonlySet<string>>(() => INITIAL_MINED);

  const reset = useCallback(() => setMined(new Set(INITIAL_MINED)), []);

  const grid = useMemo<GridCell[][]>(
    () =>
      BASE_GRID.map((row, r) =>
        row.map((cell, c) => {
          if (!mined.has(`${r},${c}`)) return cell;
          return { ...airTile('terrain.rock.floor'), occupant: cell.occupant };
        }),
      ),
    [mined],
  );

  const getCellLabel = useCallback(
    (row: number, col: number) =>
      mined.has(`${row},${col}`)
        ? messages['demo.autoTileRestore']
        : messages['demo.autoTileMine'],
    [mined, messages],
  );

  const getCellPressed = useCallback(
    (row: number, col: number) => mined.has(`${row},${col}`),
    [mined],
  );

  return (
    <section className="flex flex-col gap-space-md rounded-lg border border-outline-variant bg-surface-container-low p-space-lg">
      <header className="flex flex-col gap-space-xs">
        <h2 className="font-headline-md text-primary">{messages['demo.autoTileTitle']}</h2>
        <p className="font-body-sm text-on-surface-variant">
          {messages['demo.autoTileBody']}
        </p>
      </header>

      <TileGrid
        grid={grid}
        scale={SCALE}
        getCellLabel={getCellLabel}
        getCellPressed={getCellPressed}
        className="bg-outline-variant/30"
      />

      <footer className="flex flex-wrap items-center gap-space-md">
        <button
          type="button"
          onClick={reset}
          className="rounded bg-primary px-space-md py-space-xs font-label-md text-on-primary transition-colors hover:bg-primary-fixed"
        >
          {messages['demo.autoTileReset']}
        </button>
        <div className="flex flex-wrap gap-space-md font-body-sm text-on-surface-variant">
          <span>
            <span className="text-primary">■</span> {messages['demo.legendGold']}
          </span>
          <span>
            <span className="text-on-surface-variant">■</span> {messages['demo.legendRock']}
          </span>
          <span>
            <span className="text-secondary">■</span> {messages['demo.legendFloor']}
          </span>
          <span>
            <span className="text-tertiary">■</span> {messages['demo.legendDwarf']}
          </span>
        </div>
      </footer>
    </section>
  );
}
