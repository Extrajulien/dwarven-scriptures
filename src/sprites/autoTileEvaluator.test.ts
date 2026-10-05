import {
  clearAutoTileCache,
  computeNeighborMask,
  resolveCellSprites,
  type GridCell,
} from './autoTileEvaluator';
import { resolveMaskOffset, type ConnectedSpriteSet } from './autoTileRegistry';
import { computeSpriteStyleFromOffset } from './spriteRegistry';

const rock = (): GridCell => ({ baseTerrain: 'terrain.solid-rock' });
const gold = (): GridCell => ({ baseTerrain: 'terrain.solid-rock', veinOrFeature: 'vein.gold' });

describe('autoTileEvaluator', () => {
  test('3x3 cluster center is fully connected (mask 15)', () => {
    const grid = [
      [gold(), gold(), gold()],
      [gold(), gold(), gold()],
      [gold(), gold(), gold()],
    ];
    expect(computeNeighborMask(grid, 1, 1, (c) => c.veinOrFeature)).toBe(15);
  });

  test('isolated vein has mask 0', () => {
    const grid = [
      [rock(), rock(), rock()],
      [rock(), gold(), rock()],
      [rock(), rock(), rock()],
    ];
    expect(computeNeighborMask(grid, 1, 1, (c) => c.veinOrFeature)).toBe(0);
  });

  test('cardinal bits are N=1, E=2, S=4, W=8', () => {
    const north = [
      [rock(), gold(), rock()],
      [rock(), gold(), rock()],
      [rock(), rock(), rock()],
    ];
    expect(computeNeighborMask(north, 1, 1, (c) => c.veinOrFeature)).toBe(1);

    const east = [
      [rock(), rock(), rock()],
      [rock(), gold(), gold()],
      [rock(), rock(), rock()],
    ];
    expect(computeNeighborMask(east, 1, 1, (c) => c.veinOrFeature)).toBe(2);

    const south = [
      [rock(), rock(), rock()],
      [rock(), gold(), rock()],
      [rock(), gold(), rock()],
    ];
    expect(computeNeighborMask(south, 1, 1, (c) => c.veinOrFeature)).toBe(4);

    const west = [
      [rock(), rock(), rock()],
      [gold(), gold(), rock()],
      [rock(), rock(), rock()],
    ];
    expect(computeNeighborMask(west, 1, 1, (c) => c.veinOrFeature)).toBe(8);
  });

  test('resolveCellSprites returns back-to-front layers', () => {
    const grid = [
      [rock(), gold(), rock()],
      [rock(), gold(), rock()],
      [rock(), rock(), rock()],
    ];
    grid[1][1] = {
      baseTerrain: 'terrain.solid-rock',
      veinOrFeature: 'vein.gold',
      diggingState: { frame: 1 },
      occupant: { spriteKey: 'actor.dwarf-miner-idle' },
    };

    const layers = resolveCellSprites(grid, 1, 1);
    expect(layers).toHaveLength(4);
    expect(layers[0]).toEqual({ sheet: 'ramp_stone', gridX: 0, gridY: 0 }); // base rock
    expect(layers[1].sheet).toBe('vein'); // connected gold vein
    expect(layers[2]).toEqual({ sheet: 'mining', gridX: 1, gridY: 0 }); // progress-1
    expect(layers[3]).toEqual({ sheet: 'actors', gridX: 0, gridY: 0 }); // dwarf idle
  });

  test('resolveMaskOffset falls back when a mask is missing', () => {
    const partial: ConnectedSpriteSet = {
      sheet: 'vein',
      fallbackMask: 15,
      masks: { 15: { gridX: 3, gridY: 3 } },
    };
    expect(resolveMaskOffset(partial, 0)).toEqual({ gridX: 3, gridY: 3 });
    expect(resolveMaskOffset(partial, 15)).toEqual({ gridX: 3, gridY: 3 });
  });

  test('resolveCellSprites memoizes identical cells (stable reference)', () => {
    clearAutoTileCache();
    const grid = [
      [rock(), gold(), rock()],
      [rock(), gold(), rock()],
      [rock(), rock(), rock()],
    ];
    const first = resolveCellSprites(grid, 1, 1);
    expect(resolveCellSprites(grid, 1, 1)).toBe(first);

    clearAutoTileCache();
    expect(resolveCellSprites(grid, 1, 1)).not.toBe(first);
  });

  test('computeSpriteStyleFromOffset derives pixel-exact offsets', () => {
    const style = computeSpriteStyleFromOffset('vein', 2, 1, 1);
    expect(style.backgroundPosition).toBe('-64px -32px');
    expect(style.backgroundSize).toBe('128px 128px');
  });
});
