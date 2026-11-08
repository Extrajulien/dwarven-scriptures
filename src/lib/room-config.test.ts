import { z } from 'zod';
import {
  defaultRoomConfig,
  parseRoomConfig,
  resolveRoomConfig,
  ROOM_TIME_LIMIT_MAX_SECONDS,
  ROOM_TIME_LIMIT_MIN_SECONDS,
  roomConfigSchema,
  safeParseRoomConfig,
} from './room-config';

/**
 * @jest-environment node
 *
 * Unit tests for the room-configuration schema (CONF-01..12). The schema is
 * pure Zod: no database, no Next.js — it validates the JSON stored in
 * `rooms.config`.
 */

const validConfig = {
  textLanguage: 'fr',
  textComplexity: 'moyen',
  textType: 'coherent',
  wordCount: 60,
  timeLimitSeconds: 120,
  errorMode: 'accumulate',
  options: { punctuation: true, numbers: false, capitals: true, accents: true },
  bonusesEnabled: true,
  bots: [{ level: 'expert', count: 2 }],
};

describe('roomConfigSchema', () => {
  test('accepts a complete valid configuration', () => {
    expect(roomConfigSchema.safeParse(validConfig).success).toBe(true);
  });

  test.each(['fr', 'en'])('accepts textLanguage %s', (language) => {
    const result = roomConfigSchema.safeParse({ ...validConfig, textLanguage: language });
    expect(result.success).toBe(true);
  });

  test.each(['facile', 'moyen', 'difficile'])(
    'accepts textComplexity %s',
    (complexity) => {
      const result = roomConfigSchema.safeParse({ ...validConfig, textComplexity: complexity });
      expect(result.success).toBe(true);
    },
  );

  test.each(['coherent', 'random'])('accepts textType %s', (type) => {
    const result = roomConfigSchema.safeParse({ ...validConfig, textType: type });
    expect(result.success).toBe(true);
  });

  test('accepts null timeLimitSeconds (no time limit)', () => {
    const result = roomConfigSchema.safeParse({ ...validConfig, timeLimitSeconds: null });
    expect(result.success).toBe(true);
  });

  test('rejects timeLimitSeconds below 30', () => {
    const result = roomConfigSchema.safeParse({ ...validConfig, timeLimitSeconds: 29 });
    expect(result.success).toBe(false);
  });

  test('rejects timeLimitSeconds above 600', () => {
    const result = roomConfigSchema.safeParse({ ...validConfig, timeLimitSeconds: 601 });
    expect(result.success).toBe(false);
  });

  test('rejects a non-integer timeLimitSeconds', () => {
    const result = roomConfigSchema.safeParse({ ...validConfig, timeLimitSeconds: 30.5 });
    expect(result.success).toBe(false);
  });

  test('accepts wordCount at the bounds', () => {
    expect(roomConfigSchema.safeParse({ ...validConfig, wordCount: 10 }).success).toBe(true);
    expect(roomConfigSchema.safeParse({ ...validConfig, wordCount: 200 }).success).toBe(true);
  });

  test('rejects wordCount outside 10–200', () => {
    expect(roomConfigSchema.safeParse({ ...validConfig, wordCount: 9 }).success).toBe(false);
    expect(roomConfigSchema.safeParse({ ...validConfig, wordCount: 201 }).success).toBe(false);
    expect(roomConfigSchema.safeParse({ ...validConfig, wordCount: 60.5 }).success).toBe(false);
  });

  test.each(['accumulate', 'stop'])('accepts errorMode %s', (mode) => {
    const result = roomConfigSchema.safeParse({ ...validConfig, errorMode: mode });
    expect(result.success).toBe(true);
  });

  test('rejects an unknown errorMode', () => {
    const result = roomConfigSchema.safeParse({ ...validConfig, errorMode: 'bloquant' });
    expect(result.success).toBe(false);
  });

  test('rejects a missing or non-boolean option toggle', () => {
    const withoutPunctuation = { ...validConfig, options: { numbers: true, capitals: true, accents: true } };
    expect(roomConfigSchema.safeParse(withoutPunctuation).success).toBe(false);

    const stringToggle = {
      ...validConfig,
      options: { punctuation: 'yes', numbers: true, capitals: true, accents: true },
    };
    expect(roomConfigSchema.safeParse(stringToggle).success).toBe(false);
  });

  test('rejects an unknown config key (strict shape)', () => {
    const result = roomConfigSchema.safeParse({ ...validConfig, cheatMode: true });
    expect(result.success).toBe(false);
  });

  test('accepts all five bot levels', () => {
    for (const level of ['noob', 'debutant', 'intermediaire', 'expert', 'impossible']) {
      const result = roomConfigSchema.safeParse({
        ...validConfig,
        bots: [{ level, count: 1 }],
      });
      expect(result.success).toBe(true);
    }
  });

  test('rejects an unknown bot level', () => {
    const result = roomConfigSchema.safeParse({
      ...validConfig,
      bots: [{ level: 'overlord', count: 1 }],
    });
    expect(result.success).toBe(false);
  });

  test('rejects a negative or fractional bot count', () => {
    expect(
      roomConfigSchema.safeParse({ ...validConfig, bots: [{ level: 'noob', count: -1 }] }).success,
    ).toBe(false);
    expect(
      roomConfigSchema.safeParse({ ...validConfig, bots: [{ level: 'noob', count: 1.5 }] }).success,
    ).toBe(false);
  });

  test('accepts an empty bots list', () => {
    const result = roomConfigSchema.safeParse({ ...validConfig, bots: [] });
    expect(result.success).toBe(true);
  });

  test('rejects a missing top-level field', () => {
    const { timeLimitSeconds: _omitted, ...rest } = validConfig;
    void _omitted;
    expect(roomConfigSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects non-object input', () => {
    expect(roomConfigSchema.safeParse(null).success).toBe(false);
    expect(roomConfigSchema.safeParse('config').success).toBe(false);
    expect(roomConfigSchema.safeParse(42).success).toBe(false);
  });
});

describe('parse helpers', () => {
  test('parseRoomConfig returns the parsed config', () => {
    expect(parseRoomConfig(validConfig)).toEqual(validConfig);
  });

  test('parseRoomConfig throws a ZodError on invalid input', () => {
    expect(() => parseRoomConfig({ ...validConfig, wordCount: 5 })).toThrow(z.ZodError);
  });

  test('safeParseRoomConfig returns null on invalid input', () => {
    expect(safeParseRoomConfig({ ...validConfig, wordCount: 5 })).toBeNull();
    expect(safeParseRoomConfig('nope')).toBeNull();
  });

  test('resolveRoomConfig falls back to defaults for null/undefined', () => {
    expect(resolveRoomConfig(undefined)).toEqual(defaultRoomConfig);
    expect(resolveRoomConfig(null)).toEqual(defaultRoomConfig);
  });

  test('resolveRoomConfig parses a provided config', () => {
    expect(resolveRoomConfig(validConfig)).toEqual(validConfig);
  });

  test('resolveRoomConfig throws on an invalid provided config', () => {
    expect(() => resolveRoomConfig({ ...validConfig, wordCount: 5 })).toThrow(z.ZodError);
  });
});

describe('defaultRoomConfig', () => {
  test('is itself valid according to the schema', () => {
    expect(roomConfigSchema.safeParse(defaultRoomConfig).success).toBe(true);
  });

  test('respects the documented time-limit bounds', () => {
    expect(defaultRoomConfig.timeLimitSeconds).toBeGreaterThanOrEqual(ROOM_TIME_LIMIT_MIN_SECONDS);
    expect(defaultRoomConfig.timeLimitSeconds).toBeLessThanOrEqual(ROOM_TIME_LIMIT_MAX_SECONDS);
  });
});
