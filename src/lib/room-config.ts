import { z } from 'zod';
import type { BotLevel, RoomConfig } from '../db/schema';

/**
 * Zod v4 schema for the host-configurable race configuration (CONF-01..12).
 *
 * The schema is the single source of truth for the JSON stored in
 * `rooms.config`: every write goes through it (`src/db/queries/rooms.ts`
 * re-parses before persisting), and `satisfies z.ZodType<RoomConfig>` ties it
 * to the storage contract type in `src/db/schema.ts` at compile time, so the
 * two can never drift silently.
 *
 * Semantic notes:
 *
 * - `errorMode: 'stop'` is correction obligatoire — the typist cannot advance
 *   past an uncorrected error; `'accumulate'` lets errors stand while they are
 *   counted against the final accuracy (CONF-08).
 * - `options` are the CONF-06 toggles (punctuation, numbers, capitals,
 *   accents); in coherent mode the corpus is filtered by them (CONF-07 is
 *   documented in `doc/database.md`).
 * - `bots` is a list of `{ level, count }` pairs (CONF-10, BOT-01). Bots
 *   occupy participant capacity like humans, so each count is capped at
 *   `ROOM_MAX_BOTS` (the room capacity ceiling, SALLE-05).
 */

export const ROOM_WORD_COUNT_MIN = 10;
export const ROOM_WORD_COUNT_MAX = 200;

/** Time-limit bounds in seconds (CONF-01); `null` means no time limit. */
export const ROOM_TIME_LIMIT_MIN_SECONDS = 30;
export const ROOM_TIME_LIMIT_MAX_SECONDS = 600;

/** Highest number of bots of one level a host may add (capacity ceiling). */
export const ROOM_MAX_BOTS = 30;

export const textLanguageSchema = z.enum(['fr', 'en']);
export const textComplexitySchema = z.enum(['facile', 'moyen', 'difficile']);
export const textTypeSchema = z.enum(['coherent', 'random']);
export const errorModeSchema = z.enum(['accumulate', 'stop']);

export const BOT_LEVELS = [
  'noob',
  'debutant',
  'intermediaire',
  'expert',
  'impossible',
] as const satisfies readonly BotLevel[];

export const botLevelSchema = z.enum(BOT_LEVELS);

/**
 * The full room-configuration shape. `.strict()` rejects unknown keys, so a
 * client cannot smuggle extra settings into the stored JSON.
 */
export const roomConfigSchema = z
  .object({
    textLanguage: textLanguageSchema,
    textComplexity: textComplexitySchema,
    textType: textTypeSchema,
    wordCount: z
      .number()
      .int()
      .min(ROOM_WORD_COUNT_MIN)
      .max(ROOM_WORD_COUNT_MAX),
    timeLimitSeconds: z
      .number()
      .int()
      .min(ROOM_TIME_LIMIT_MIN_SECONDS)
      .max(ROOM_TIME_LIMIT_MAX_SECONDS)
      .nullable(),
    errorMode: errorModeSchema,
    options: z.object({
      punctuation: z.boolean(),
      numbers: z.boolean(),
      capitals: z.boolean(),
      accents: z.boolean(),
    }),
    bonusesEnabled: z.boolean(),
    bots: z.array(
      z.object({
        level: botLevelSchema,
        count: z.number().int().min(0).max(ROOM_MAX_BOTS),
      }),
    ),
  })
  .strict() satisfies z.ZodType<RoomConfig>;

export type RoomConfigInput = z.input<typeof roomConfigSchema>;
export type RoomConfigOutput = z.output<typeof roomConfigSchema>;

/** Sensible defaults for a newly created room (CONF-01..10). */
export const defaultRoomConfig: RoomConfig = {
  textLanguage: 'fr',
  textComplexity: 'moyen',
  textType: 'coherent',
  wordCount: 60,
  timeLimitSeconds: 60,
  errorMode: 'accumulate',
  options: {
    punctuation: true,
    numbers: true,
    capitals: true,
    accents: true,
  },
  bonusesEnabled: true,
  bots: [],
};

/**
 * Parses and validates a configuration. Throws a `ZodError` on any invalid
 * field — callers that already validated for UX can use `safeParseRoomConfig`
 * instead; storage paths should always go through one of the two.
 */
export function parseRoomConfig(value: unknown): RoomConfig {
  return roomConfigSchema.parse(value);
}

/** Parses a configuration, returning `null` when the shape is invalid. */
export function safeParseRoomConfig(value: unknown): RoomConfig | null {
  const result = roomConfigSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * Parses a configuration with defaults: an `undefined`/`null` value means
 * "not configured yet" and yields `defaultRoomConfig`. Used by `createRoom`
 * so a room is never created without a complete config.
 */
export function resolveRoomConfig(value: unknown): RoomConfig {
  if (value === undefined || value === null) {
    return defaultRoomConfig;
  }
  return roomConfigSchema.parse(value);
}
