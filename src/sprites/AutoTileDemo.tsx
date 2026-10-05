import { memo, useCallback, useMemo, useState } from 'react';
import {
  airTile,
  resolveCellSprites,
  solidTile,
  type GridCell,
  type ResolvedSpriteRef,
} from './autoTileEvaluator';
import { LayeredTileCell } from './LayeredTileCell';

const ROWS = 8;
const COLS = 9;
const SCALE = 2;
const CELL_PX = 32 * SCALE;

const VEIN_ORIGIN = { row: 3, col: 3 }; // top-left of the 3x3 cluster
const ISOLATED = { row: 1, col: 7 }; // lone ore (isolated blob)
const DWARF = { row: 2, col: 1 }; // dwarf on the pre-mined corridor floor

function buildBaseGrid(): GridCell[][] {
  const grid: GridCell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => solidTile('terrain.solid-rock')),
  );

  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      grid[VEIN_ORIGIN.row + dr][VEIN_ORIGIN.col + dc] = solidTile('terrain.solid-rock', 'gold');
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

interface CellRender {
  layers: ResolvedSpriteRef[];
}

interface CellButtonProps {
  layers: readonly ResolvedSpriteRef[];
  mined: boolean;
  row: number;
  col: number;
  onToggle: (row: number, col: number) => void;
}

const CellButton = memo(function CellButton({
  layers,
  mined,
  row,
  col,
  onToggle,
}: CellButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(row, col)}
      aria-pressed={mined}
      title={mined ? 'Restore tile' : 'Mine tile'}
      className="relative block transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <LayeredTileCell layers={layers} scale={SCALE} />
    </button>
  );
});

export default function AutoTileDemo() {
  const [mined, setMined] = useState<ReadonlySet<string>>(() => INITIAL_MINED);

  const toggle = useCallback((row: number, col: number) => {
    const key = `${row},${col}`;
    setMined((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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

  const cells = useMemo<CellRender[][]>(
    () => grid.map((row, r) => row.map((_, c) => ({ layers: resolveCellSprites(grid, r, c) }))),
    [grid],
  );

  return (
    <section className="flex flex-col gap-space-md rounded-lg border border-outline-variant bg-surface-container-low p-space-lg">
      <header className="flex flex-col gap-space-xs">
        <h2 className="font-headline-md text-primary">Auto-Tiling &amp; Layered Cells</h2>
        <p className="font-body-sm text-on-surface-variant">
          Click a tile to mine it out (air). Buried rock is culled; exposed rock renders a wall
          face, and exposed gold veins render a tinted mineral face with inner corners. A corridor
          is pre-mined so you can see the effect immediately.
        </p>
      </header>

      <div
        className="inline-grid bg-outline-variant/30"
        style={{ gridTemplateColumns: `repeat(${COLS}, ${CELL_PX}px)`, gap: 1 }}
      >
        {cells.map((row, r) =>
          row.map((cell, c) => (
            <CellButton
              key={`${r},${c}`}
              layers={cell.layers}
              mined={mined.has(`${r},${c}`)}
              row={r}
              col={c}
              onToggle={toggle}
            />
          )),
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-space-md">
        <button
          type="button"
          onClick={reset}
          className="rounded bg-primary px-space-md py-space-xs font-label-md text-on-primary transition-colors hover:bg-primary-fixed"
        >
          Reset
        </button>
        <div className="flex flex-wrap gap-space-md font-body-sm text-on-surface-variant">
          <span>
            <span className="text-primary">■</span> gold vein (mineral tint)
          </span>
          <span>
            <span className="text-on-surface-variant">■</span> exposed rock wall
          </span>
          <span>
            <span className="text-secondary">■</span> mined floor (air)
          </span>
          <span>
            <span className="text-tertiary">■</span> dwarf occupant
          </span>
        </div>
      </footer>
    </section>
  );
}
