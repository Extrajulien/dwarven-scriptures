import { memo, useCallback, useMemo, useState } from 'react';
import {
  airTile,
  computeNeighborMask,
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
const ISOLATED = { row: 1, col: 7 }; // lone ore (isolated cluster)
const DWARF = { row: 5, col: 0 }; // occupant on plain stone

function buildBaseGrid(): GridCell[][] {
  const grid: GridCell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => solidTile('terrain.solid-rock')),
  );

  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      grid[VEIN_ORIGIN.row + dr][VEIN_ORIGIN.col + dc] = {
        ...solidTile('terrain.solid-rock'),
        veinOrFeature: 'vein.gold',
      };
    }
  }

  grid[ISOLATED.row][ISOLATED.col] = {
    ...solidTile('terrain.solid-rock'),
    veinOrFeature: 'vein.gold',
  };

  grid[DWARF.row][DWARF.col] = {
    ...solidTile('terrain.solid-rock'),
    occupant: { spriteKey: 'actor.dwarf-miner-idle' },
  };

  return grid;
}

const BASE_GRID: GridCell[][] = buildBaseGrid();

interface CellRender {
  layers: ResolvedSpriteRef[];
  mask: number | undefined; // undefined = not a connectable vein tile
}

interface CellButtonProps {
  layers: readonly ResolvedSpriteRef[];
  mask: number | undefined;
  mined: boolean;
  row: number;
  col: number;
  onToggle: (row: number, col: number) => void;
}

const CellButton = memo(function CellButton({
  layers,
  mask,
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
      {mask !== undefined && (
        <span className="pointer-events-none absolute right-0 top-0 bg-black/70 px-space-xs font-label-sm text-primary">
          {mask}
        </span>
      )}
    </button>
  );
});

export default function AutoTileDemo() {
  const [mined, setMined] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((row: number, col: number) => {
    const key = `${row},${col}`;
    setMined((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const reset = useCallback(() => setMined(new Set()), []);

  const grid = useMemo<GridCell[][]>(
    () =>
      BASE_GRID.map((row, r) =>
        row.map((cell, c) => {
          if (!mined.has(`${r},${c}`)) return cell;
          return {
            ...airTile('terrain.rock.floor'),
            diggingState: { frame: 2 },
            occupant: cell.occupant,
          };
        }),
      ),
    [mined],
  );

  const cells = useMemo<CellRender[][]>(
    () =>
      grid.map((row, r) =>
        row.map((cell, c) => ({
          layers: resolveCellSprites(grid, r, c),
          mask: cell.veinOrFeature
            ? computeNeighborMask(grid, r, c, (cc) => cc.veinOrFeature)
            : undefined,
        })),
      ),
    [grid],
  );

  return (
    <section className="flex flex-col gap-space-md rounded-lg border border-outline-variant bg-surface-container-low p-space-lg">
      <header className="flex flex-col gap-space-xs">
        <h2 className="font-headline-md text-primary">Auto-Tiling &amp; Layered Cells</h2>
        <p className="font-body-sm text-on-surface-variant">
          Click a tile to mine it out and watch the gold vein re-connect in real time. The 3×3
          cluster merges seamlessly; the lone ore is an isolated blob. The badge on each vein tile
          is its 4-way neighbor bitmask (N=1 · E=2 · S=4 · W=8).
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
              mask={cell.mask}
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
            <span className="text-primary">■</span> gold vein
          </span>
          <span>
            <span className="text-on-surface-variant">■</span> solid stone
          </span>
          <span>
            <span className="text-secondary">■</span> mined (dig overlay)
          </span>
          <span>
            <span className="text-tertiary">■</span> dwarf occupant
          </span>
        </div>
      </footer>
    </section>
  );
}
