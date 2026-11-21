import {
  BLOCKS_PER_COLUMN,
  CHARS_PER_BLOCK,
  CHARS_PER_COLUMN,
  MINERAL_GOLD_VALUES,
  MINERAL_IDS,
  MINERAL_VALUE_ORDER,
  blockIndexWithinColumn,
  charsWithinBlock,
  columnGoldValue,
  columnOf,
  createColumnStream,
  digFrameForChars,
  generateColumn,
  generateTile,
  highestValueMineral,
  mineralValueRank,
  veinTile,
  wallTile,
} from './mine';

/**
 * Mining-track domain (DES-04 / COURSE-05): the position → block/column
 * mapping, the mineral value order, the seeded rarity generation and the
 * ring-buffer column stream.
 */

describe('constants', () => {
  test('a block is 10 chars, a column 3 blocks = 30 chars', () => {
    expect(CHARS_PER_BLOCK).toBe(10);
    expect(BLOCKS_PER_COLUMN).toBe(3);
    expect(CHARS_PER_COLUMN).toBe(30);
  });

  test('mineral value order is wall < coal < copper < iron < silver < gold', () => {
    expect(MINERAL_VALUE_ORDER).toEqual(['coal', 'copper', 'iron', 'silver', 'gold']);
    expect(MINERAL_IDS).toEqual(['coal', 'copper', 'iron', 'silver', 'gold']);
    // Every mineral has a gold value and a strictly ascending value rank.
    MINERAL_VALUE_ORDER.forEach((mineral, index) => {
      expect(MINERAL_GOLD_VALUES[mineral]).toBeGreaterThan(0);
      expect(mineralValueRank(mineral)).toBe(index + 1);
    });
  });
});

describe('position mapping', () => {
  test('columnOf buckets 30 characters per column', () => {
    expect(columnOf(0)).toBe(0);
    expect(columnOf(29)).toBe(0);
    expect(columnOf(30)).toBe(1);
    expect(columnOf(59)).toBe(1);
    expect(columnOf(60)).toBe(2);
  });

  test('blockIndexWithinColumn walks rows 0→1→2 within a column', () => {
    expect(blockIndexWithinColumn(0)).toBe(0);
    expect(blockIndexWithinColumn(9)).toBe(0);
    expect(blockIndexWithinColumn(10)).toBe(1);
    expect(blockIndexWithinColumn(19)).toBe(1);
    expect(blockIndexWithinColumn(20)).toBe(2);
    expect(blockIndexWithinColumn(29)).toBe(2);
    expect(blockIndexWithinColumn(30)).toBe(0); // next column resets
  });

  test('charsWithinBlock is the 0..9 offset inside the current block', () => {
    expect(charsWithinBlock(0)).toBe(0);
    expect(charsWithinBlock(9)).toBe(9);
    expect(charsWithinBlock(10)).toBe(0);
    expect(charsWithinBlock(37)).toBe(7);
  });
});

describe('mineral value / gold', () => {
  test('highestValueMineral picks the highest mineral, wall ranks below all', () => {
    expect(highestValueMineral([wallTile(), wallTile(), wallTile()])).toBeNull();
    expect(highestValueMineral([wallTile(), veinTile('copper'), wallTile()])).toBe('copper');
    expect(highestValueMineral([veinTile('copper'), veinTile('iron'), wallTile()])).toBe('iron');
    expect(highestValueMineral([veinTile('coal'), veinTile('copper'), veinTile('gold')])).toBe('gold');
  });

  test('columnGoldValue sums every vein in the column', () => {
    expect(columnGoldValue([wallTile(), wallTile(), wallTile()])).toBe(0);
    expect(columnGoldValue([veinTile('coal'), veinTile('copper'), wallTile()])).toBe(
      MINERAL_GOLD_VALUES.coal + MINERAL_GOLD_VALUES.copper,
    );
    expect(columnGoldValue([veinTile('gold'), veinTile('gold'), veinTile('gold')])).toBe(
      MINERAL_GOLD_VALUES.gold * 3,
    );
  });
});

describe('digFrameForChars (blink at chars 5 and 7)', () => {
  test('steps through 4 frames, changing at the 5th and 7th characters', () => {
    expect(digFrameForChars(0)).toBe(0);
    expect(digFrameForChars(4)).toBe(0);
    expect(digFrameForChars(5)).toBe(1); // first blink
    expect(digFrameForChars(6)).toBe(1);
    expect(digFrameForChars(7)).toBe(2); // second blink
    expect(digFrameForChars(8)).toBe(2);
    expect(digFrameForChars(9)).toBe(3);
  });

  test('clamps hostile inputs into 0..3', () => {
    expect(digFrameForChars(-5)).toBe(0);
    expect(digFrameForChars(99)).toBe(3);
    expect(digFrameForChars(4.9)).toBe(0);
    expect(digFrameForChars(5.1)).toBe(1);
  });
});

describe('seeded generation', () => {
  test('generateTile always yields a wall or a known mineral', () => {
    for (let seed = 0; seed < 20; seed++) {
      const rng = (() => {
        let state = seed >>> 0;
        return () => {
          state = (state + 0x6d2b79f5) >>> 0;
          let t = state;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      })();
      for (let i = 0; i < 50; i++) {
        const tile = generateTile(rng);
        expect(tile.mineral === null || MINERAL_IDS.includes(tile.mineral)).toBe(true);
      }
    }
  });

  test('generateColumn is deterministic for the same seed', () => {
    const a = (() => {
      let state = 7 >>> 0;
      return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();
    const b = (() => {
      let state = 7 >>> 0;
      return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();
    expect(generateColumn(a)).toEqual(generateColumn(b));
  });
});

describe('ColumnStream (ring buffer)', () => {
  test('peek returns the current column followed by the ahead window', () => {
    const stream = createColumnStream(42);
    expect(stream.column).toBe(0);
    const window = stream.peek(3);
    expect(window).toHaveLength(3);
    expect(window[0]).toHaveLength(3); // each column is 3 tiles
    // The current column is index 0; peeking must not advance the stream.
    expect(stream.column).toBe(0);
  });

  test('advance mines the current column and moves forward monotonically', () => {
    const stream = createColumnStream(42);
    const current = stream.peek(1)[0];
    const removed = stream.advance();
    expect(removed).toEqual(current);
    expect(stream.column).toBe(1);
    expect(stream.peek(1)[0]).not.toEqual(removed);
  });

  test('the stream is deterministic for a given seed and number of advances', () => {
    const a = createColumnStream(123);
    const b = createColumnStream(123);
    for (let i = 0; i < 10; i++) {
      expect(a.peek(16)).toEqual(b.peek(16));
      expect(a.advance()).toEqual(b.advance());
    }
    expect(a.column).toBe(10);
    expect(b.column).toBe(10);
  });

  test('different seeds produce a different world', () => {
    const a = createColumnStream(1);
    const b = createColumnStream(2);
    expect(a.peek(16)).not.toEqual(b.peek(16));
  });

  test('peek beyond the prefill never underflows', () => {
    const stream = createColumnStream(0);
    for (let i = 0; i < 40; i++) {
      stream.advance();
    }
    expect(stream.peek(16)).toHaveLength(16);
  });
});
