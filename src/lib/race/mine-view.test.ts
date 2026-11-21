import type { RaceTrackParticipant } from '../../realtime/client-types';
import {
  AHEAD_COLUMNS,
  MINER_COLUMN,
  NORMAL_GRID_COLUMNS,
  NORMAL_ROW_COUNT,
  buildNormalGrid,
  condensedMineral,
} from './mine-view';
import { veinTile, wallTile } from './mine';

/**
 * DES-04 / COURSE-05: the pure mining-track view builders — the camera-follow
 * grid layout (mined floor behind, miner in the center column on the active
 * block, streamed ahead columns) and the condensed highest-value tile.
 */

const ADA = '11111111-1111-4111-8111-111111111111';

function trackColumn(a: 'wall' | 'coal' | 'copper' | 'iron' | 'silver' | 'gold', b = a, c = a) {
  return [a === 'wall' ? wallTile() : veinTile(a), b === 'wall' ? wallTile() : veinTile(b), c === 'wall' ? wallTile() : veinTile(c)];
}

function participant(position: number, track?: RaceTrackParticipant['track']): RaceTrackParticipant {
  return {
    participantId: ADA,
    kind: 'user',
    displayName: 'ada',
    position,
    wpm: 30,
    finished: false,
    totalLength: 300,
    gold: 0,
    track: track ?? [],
  };
}

describe('buildNormalGrid', () => {
  test('returns a 3-row grid with the fixed camera width', () => {
    const { grid } = buildNormalGrid(participant(0));
    expect(grid).toHaveLength(NORMAL_ROW_COUNT);
    expect(grid[0]).toHaveLength(NORMAL_GRID_COLUMNS);
    expect(NORMAL_GRID_COLUMNS).toBe(MINER_COLUMN + 1 + AHEAD_COLUMNS);
  });

  test('places the miner on the active block of the center column', () => {
    // position 15 → column 0, block 1 (chars 10..19), chars 5 (first blink).
    const { miner } = buildNormalGrid(participant(15));
    expect(miner).toEqual({ row: 1, col: MINER_COLUMN });
  });

  test('renders the start as solid rock everywhere behind the miner', () => {
    // No columns mined yet: the whole left region is solid rock.
    const { grid } = buildNormalGrid(participant(0));
    for (let col = 0; col < MINER_COLUMN; col++) {
      for (let row = 0; row < NORMAL_ROW_COUNT; row++) {
        expect(grid[row][col].isSolid).toBe(true);
        expect(grid[row][col].mineral).toBeUndefined();
      }
    }
  });

  test('turns recently-mined columns behind the miner into floor', () => {
    // position 61 → column 2: two columns fully mined.
    const { grid } = buildNormalGrid(participant(61));
    // The two columns immediately left of the miner are floor.
    expect(grid[0][MINER_COLUMN - 1].isAir).toBe(true);
    expect(grid[1][MINER_COLUMN - 2].isAir).toBe(true);
    // Further left stays solid rock (the backdrop).
    expect(grid[0][0].isSolid).toBe(true);
  });

  test('mines the current column top-to-bottom with a crack overlay on the active block', () => {
    // position 25 → column 0, block 2 (chars 20..29), chars 5.
    const { grid, miner } = buildNormalGrid(participant(25));
    expect(miner.row).toBe(2);
    // Above the active block: floor.
    expect(grid[0][MINER_COLUMN].isAir).toBe(true);
    expect(grid[1][MINER_COLUMN].isAir).toBe(true);
    // The active block is still solid and carries the crack overlay.
    const active = grid[2][MINER_COLUMN];
    expect(active.isSolid).toBe(true);
    expect(active.diggingState?.frame).toBe(1); // chars 5 → first blink
  });

  test('draws ahead columns from the streamed window with their minerals', () => {
    const track = [
      trackColumn('wall'),
      trackColumn('copper'),
      trackColumn('iron'),
      ...Array.from({ length: 13 }, () => trackColumn('wall')),
    ] as RaceTrackParticipant['track'];
    const { grid } = buildNormalGrid(participant(0, track));
    // track[0] is the current column (all wall); track[1] = copper, track[2] = iron.
    expect(grid[0][MINER_COLUMN + 1].mineral).toBe('copper');
    expect(grid[1][MINER_COLUMN + 2].mineral).toBe('iron');
  });
});

describe('condensedMineral', () => {
  test('returns the highest-value mineral of the current column, or null for wall', () => {
    const allWall = [trackColumn('wall')] as RaceTrackParticipant['track'];
    expect(condensedMineral(participant(0, allWall))).toBeNull();

    const mixed = [
      [veinTile('copper'), veinTile('iron'), wallTile()],
    ] as RaceTrackParticipant['track'];
    expect(condensedMineral(participant(0, mixed))).toBe('iron');

    const gold = [[veinTile('gold'), veinTile('coal'), veinTile('silver')]] as RaceTrackParticipant['track'];
    expect(condensedMineral(participant(0, gold))).toBe('gold');
  });
});
