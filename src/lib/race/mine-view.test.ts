import type { RaceTrackParticipant } from '../../realtime/client-types';
import {
  AHEAD_COLUMNS,
  MINER_COLUMN,
  NORMAL_GRID_COLUMNS,
  NORMAL_ROW_COUNT,
  buildNormalGrid,
} from './mine-view';
import { veinTile, wallTile } from './mine';

/**
 * DES-04 / COURSE-05: the pure mining-track view builder — the camera-follow
 * tunnel (floor behind, miner in the center column on the active block, wall
 * ahead up to the last column, then floor again at the tunnel's end).
 */

const ADA = '11111111-1111-4111-8111-111111111111';

function participant(position: number, overrides: Partial<RaceTrackParticipant> = {}): RaceTrackParticipant {
  return {
    participantId: ADA,
    kind: 'user',
    displayName: 'ada',
    position,
    wpm: 30,
    finished: false,
    totalLength: 300,
    gold: 0,
    track: Array.from({ length: 16 }, () => [wallTile(), wallTile(), wallTile()]),
    ...overrides,
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
    const { miner } = buildNormalGrid(participant(15));
    expect(miner).toEqual({ row: 1, col: MINER_COLUMN });
  });

  test('renders the tunnel floor behind the miner (he came from a tunnel)', () => {
    const { grid } = buildNormalGrid(participant(0));
    for (let col = 0; col < MINER_COLUMN; col++) {
      for (let row = 0; row < NORMAL_ROW_COUNT; row++) {
        expect(grid[row][col].isAir).toBe(true);
      }
    }
  });

  test('mines the current column top-to-bottom with a crack overlay on the active block', () => {
    const { grid, miner } = buildNormalGrid(participant(25));
    expect(miner.row).toBe(2);
    expect(grid[0][MINER_COLUMN].isAir).toBe(true);
    expect(grid[1][MINER_COLUMN].isAir).toBe(true);
    const active = grid[2][MINER_COLUMN];
    expect(active.isSolid).toBe(true);
    expect(active.diggingState?.frame).toBe(1); // chars 5 → first blink
  });

  test('draws ahead columns from the streamed window with their minerals', () => {
    const track = [
      [wallTile(), wallTile(), wallTile()],
      [veinTile('copper'), wallTile(), wallTile()],
      [veinTile('iron'), wallTile(), wallTile()],
      ...Array.from({ length: 13 }, () => [wallTile(), wallTile(), wallTile()]),
    ] as RaceTrackParticipant['track'];
    const { grid } = buildNormalGrid(participant(0, { totalLength: 90, track }));
    expect(grid[0][MINER_COLUMN + 1].mineral).toBe('copper');
    expect(grid[0][MINER_COLUMN + 2].mineral).toBe('iron');
  });

  test('renders floor after the last column so the end of the tunnel is visible', () => {
    // totalLength 30 → exactly one column; everything ahead is floor.
    const { grid } = buildNormalGrid(participant(0, { totalLength: 30 }));
    for (let col = MINER_COLUMN + 1; col < NORMAL_GRID_COLUMNS; col++) {
      for (let row = 0; row < NORMAL_ROW_COUNT; row++) {
        expect(grid[row][col].isAir).toBe(true);
      }
    }
  });

  test('shows wall only up to the last column, floor beyond it', () => {
    // totalLength 60 → two columns: column 1 is wall, column 2+ is floor.
    const { grid } = buildNormalGrid(participant(0, { totalLength: 60 }));
    expect(grid[0][MINER_COLUMN + 1].isSolid).toBe(true); // absolute column 1
    expect(grid[0][MINER_COLUMN + 2].isAir).toBe(true); // absolute column 2
  });
});
