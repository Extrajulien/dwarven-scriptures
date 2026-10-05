import { memo, useMemo } from 'react';
import {
  resolveCellSprites,
  type GridCell,
  type ResolvedSpriteRef,
} from './autoTileEvaluator';
import { LayeredTileCell } from './LayeredTileCell';

export interface TileGridProps {
  /**
   * Row-major 2D grid of cells to render. The grid is owned by the caller
   * (in production, server-synced world state); this component only renders
   * it and never mutates it.
   */
  grid: readonly GridCell[][];
  /** Sprite scale multiplier. Defaults to 1 (32px tiles). */
  scale?: number;
  /** When provided, each cell renders as a button and reports clicks. */
  onCellClick?: (row: number, col: number) => void;
  /** Optional accessible label for a cell (used as `title` and `aria-label`). */
  getCellLabel?: (row: number, col: number) => string;
  /** Optional pressed state for a cell (`aria-pressed`). */
  getCellPressed?: (row: number, col: number) => boolean;
  /** Extra class(es) applied to the grid wrapper. */
  className?: string;
}

const TILE_SIZE = 32;

interface CellRender {
  layers: ResolvedSpriteRef[];
}

interface CellProps {
  layers: readonly ResolvedSpriteRef[];
  scale: number;
  row: number;
  col: number;
  label?: string;
  pressed?: boolean;
  onCellClick?: (row: number, col: number) => void;
}

const TileGridCell = memo(function TileGridCell({
  layers,
  scale,
  row,
  col,
  label,
  pressed,
  onCellClick,
}: CellProps) {
  const tile = <LayeredTileCell layers={layers} scale={scale} />;

  if (!onCellClick) return tile;

  return (
    <button
      type="button"
      onClick={() => onCellClick(row, col)}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className="relative block transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      {tile}
    </button>
  );
});

/**
 * Renders a 2D grid of layered tiles. Purely presentational: it receives the
 * grid as a prop and never owns or mutates tile state. Auto-tiling is resolved
 * per cell via `resolveCellSprites`, whose content-based cache keeps layer
 * arrays reference-stable so unchanged cells skip re-rendering when a neighbor
 * is updated.
 */
export default function TileGrid({
  grid,
  scale = 1,
  onCellClick,
  getCellLabel,
  getCellPressed,
  className,
}: TileGridProps) {
  const cols = grid[0]?.length ?? 0;
  const cellPx = TILE_SIZE * scale;

  const cells = useMemo<CellRender[][]>(
    () => grid.map((row, r) => row.map((_, c) => ({ layers: resolveCellSprites(grid, r, c) }))),
    [grid],
  );

  return (
    <div
      className={['inline-grid', className].filter(Boolean).join(' ')}
      style={{ gridTemplateColumns: `repeat(${cols}, ${cellPx}px)`, gap: 0 }}
    >
      {cells.map((row, r) =>
        row.map((cell, c) => (
          <TileGridCell
            key={`${r},${c}`}
            layers={cell.layers}
            scale={scale}
            row={r}
            col={c}
            label={getCellLabel?.(r, c)}
            pressed={getCellPressed?.(r, c)}
            onCellClick={onCellClick}
          />
        )),
      )}
    </div>
  );
}
