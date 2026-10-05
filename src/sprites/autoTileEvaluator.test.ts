import {
  airTile,
  clearAutoTileCache,
  evaluateWall,
  resolveCellSprites,
  resolveWallCell,
  solidTile,
  type GridCell,
} from './autoTileEvaluator';
import { MINERALS } from './autoTileRegistry';
import { computeSpriteStyleFromOffset } from './spriteRegistry';

const rock = (): GridCell => solidTile('terrain.solid-rock');
const gold = (): GridCell => solidTile('terrain.solid-rock', 'gold');
const floor = (): GridCell => airTile('terrain.rock.floor');

describe('autoTileEvaluator', () => {
  test('solidTile/airTile set the IS_SOLID / IS_AIR flags and floor_type', () => {
    expect(rock()).toMatchObject({ isSolid: true, isAir: false, floor_type: 'terrain.solid-rock' });
    expect(floor()).toMatchObject({ isSolid: false, isAir: true, floor_type: 'terrain.rock.floor' });
    expect(gold().mineral).toBe('gold');
  });

  test('MINERALS enum carries a tint color per mineral', () => {
    expect(MINERALS.gold.tint).toBe('#eec14b');
    expect(MINERALS.gold.label).toBe('Gold');
    expect(MINERALS.silver.tint).toBe('#c9d1d9');
    expect(MINERALS.copper.tint).toBe('#d98a5f');
  });

  test('air cell renders its floor_type and no wall body', () => {
    const grid = [
      [rock(), rock(), rock()],
      [rock(), floor(), rock()],
      [rock(), rock(), rock()],
    ];
    expect(resolveCellSprites(grid, 1, 1)).toEqual([{ sheet: 'ramp_stone', gridX: 5, gridY: 9 }]);
  });

  test('interior solid (no air neighbor) is culled', () => {
    const grid = [
      [rock(), rock(), rock()],
      [rock(), rock(), rock()],
      [rock(), rock(), rock()],
    ];
    expect(evaluateWall(grid, 1, 1).visible).toBe(false);
    expect(resolveWallCell(grid, 1, 1)).toEqual([]);
    expect(resolveCellSprites(grid, 1, 1)).toEqual([]);
  });

  test('exposed solid rock renders wall face + inner corner (no tint)', () => {
    const grid = [
      [floor(), rock(), floor()],
      [floor(), rock(), rock()],
      [floor(), floor(), floor()],
    ];
    expect(resolveWallCell(grid, 1, 1)).toEqual([
      { sheet: 'wall', gridX: 3, gridY: 0 },
      { sheet: 'wall', gridX: 0, gridY: 4 },
    ]);
  });

  test('exposed gold vein renders tinted vein face alone (not rock)', () => {
    const grid = [
      [floor(), gold(), floor()],
      [floor(), gold(), gold()],
      [floor(), floor(), floor()],
    ];
    const layers = resolveCellSprites(grid, 1, 1);
    expect(layers).toEqual([
      { sheet: 'vein', gridX: 3, gridY: 0, tint: MINERALS.gold.tint },
      { sheet: 'vein', gridX: 0, gridY: 4, tint: MINERALS.gold.tint },
    ]);
  });

  test('dig overlay and occupant stack above the wall face', () => {
    const grid: GridCell[][] = [
      [floor(), rock(), floor()],
      [
        floor(),
        { ...rock(), diggingState: { frame: 1 }, occupant: { spriteKey: 'actor.dwarf-miner-idle' } },
        rock(),
      ],
      [floor(), floor(), floor()],
    ];
    const layers = resolveCellSprites(grid, 1, 1);
    expect(layers[0]).toEqual({ sheet: 'wall', gridX: 3, gridY: 0 }); // rock base (mask 3)
    expect(layers[1]).toEqual({ sheet: 'wall', gridX: 0, gridY: 4 }); // NE corner
    expect(layers[2]).toEqual({ sheet: 'mining', gridX: 1, gridY: 0 }); // progress-1
    expect(layers[3]).toEqual({ sheet: 'actors', gridX: 0, gridY: 0 }); // dwarf idle
  });

  test('base mask bits are N=1, E=2, S=4, W=8', () => {
    const north = [
      [floor(), rock(), floor()],
      [floor(), rock(), floor()],
      [floor(), floor(), floor()],
    ];
    expect(evaluateWall(north, 1, 1).baseMask).toBe(1);

    const east = [
      [floor(), floor(), floor()],
      [floor(), rock(), rock()],
      [floor(), floor(), floor()],
    ];
    expect(evaluateWall(east, 1, 1).baseMask).toBe(2);

    const south = [
      [floor(), floor(), floor()],
      [floor(), rock(), floor()],
      [floor(), rock(), floor()],
    ];
    expect(evaluateWall(south, 1, 1).baseMask).toBe(4);

    const west = [
      [floor(), floor(), floor()],
      [rock(), rock(), floor()],
      [floor(), floor(), floor()],
    ];
    expect(evaluateWall(west, 1, 1).baseMask).toBe(8);
  });

  test('diagonal inner corners (NE=1, SE=2, SW=4, NW=8)', () => {
    const ne = [
      [floor(), rock(), floor()],
      [floor(), rock(), rock()],
      [floor(), floor(), floor()],
    ];
    expect(evaluateWall(ne, 1, 1).corners).toBe(1);

    const se = [
      [floor(), floor(), floor()],
      [floor(), rock(), rock()],
      [floor(), rock(), floor()],
    ];
    expect(evaluateWall(se, 1, 1).corners).toBe(2);

    const sw = [
      [floor(), floor(), floor()],
      [rock(), rock(), floor()],
      [floor(), rock(), floor()],
    ];
    expect(evaluateWall(sw, 1, 1).corners).toBe(4);

    const nw = [
      [floor(), rock(), floor()],
      [rock(), rock(), floor()],
      [floor(), floor(), floor()],
    ];
    expect(evaluateWall(nw, 1, 1).corners).toBe(8);
  });

  test('different solid types connect as one wall (unified IS_SOLID)', () => {
    const grid = [
      [floor(), gold(), floor()],
      [floor(), rock(), floor()],
      [floor(), floor(), floor()],
    ];
    expect(evaluateWall(grid, 1, 1).baseMask).toBe(1); // gold-vein wall above counts as solid
  });

  test('resolveCellSprites memoizes identical cells (stable reference)', () => {
    clearAutoTileCache();
    const grid = [
      [floor(), gold(), floor()],
      [floor(), gold(), floor()],
      [floor(), floor(), floor()],
    ];
    const first = resolveCellSprites(grid, 1, 1);
    expect(resolveCellSprites(grid, 1, 1)).toBe(first);

    clearAutoTileCache();
    expect(resolveCellSprites(grid, 1, 1)).not.toBe(first);
  });

  test('computeSpriteStyleFromOffset derives pixel-exact offsets', () => {
    const style = computeSpriteStyleFromOffset('vein', 2, 1, 1);
    expect(style.backgroundPosition).toBe('-64px -32px');
    expect(style.backgroundSize).toBe('128px 160px');
  });
});
