import { relations, sql, type InferInsertModel, type InferSelectModel } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Tables use an internal auto-incrementing `id` for foreign keys and a public
 * `public_id` / `username` for anything a client can see or request. Internal
 * ids must never reach the client: they leak row counts and make enumeration
 * trivial ([AGENTS.md](../../AGENTS.md) — the server stays authoritative and
 * client-provided values are never trusted).
 */

export const users = pgTable('users', {
  /** Internal primary key. Foreign keys reference this; never expose it. */
  id: bigserial({ mode: 'number' }).primaryKey(),
  /** External identifier used by public APIs. */
  publicId: uuid().defaultRandom().notNull().unique(),
  /** URL slug used by public routes, e.g. `/u/<username>`. */
  username: varchar({ length: 32 }).notNull().unique(),
  /** `NULL` for accounts created through OAuth, which have no password. */
  passwordHash: text(),
  pfpUrl: text(),
  createdAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow().notNull(),
});

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    /** Internal primary key. Foreign keys reference this; never expose it. */
    id: bigserial({ mode: 'number' }).primaryKey(),
    userId: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** OAuth provider this account is linked to (`github` or `discord`). */
    provider: varchar({ length: 16 }).notNull(),
    /** Provider-side user id, stringified so both numeric and snowflake ids fit. */
    providerAccountId: text().notNull(),
    createdAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // One row per (provider, account); two providers may link the same user.
    unique('oauth_accounts_provider_account_unique').on(
      table.provider,
      table.providerAccountId,
    ),
    check('oauth_accounts_provider_not_empty', sql`${table.provider} <> ''`),
  ],
);

export const userStats = pgTable(
  'user_stats',
  {
    userId: bigint({ mode: 'number' })
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    racesCompleted: integer().default(0).notNull(),
    totalWords: bigint({ mode: 'bigint' }).default(sql`0`).notNull(),
    totalTimeMs: bigint({ mode: 'bigint' }).default(sql`0`).notNull(),
    bestWpm: numeric({ precision: 6, scale: 2 }).default('0.00').notNull(),
    /** Races won (AUTH-06). */
    wins: integer().default(0).notNull(),
    /**
     * Keystroke counters backing the AUTH-06 accuracy figure. Accuracy is not
     * stored as a column: it is derived at read time as
     * `correct / total * 100` (see `src/db/queries/users.ts`), so it can never
     * contradict the underlying counters.
     */
    correctKeystrokes: bigint({ mode: 'bigint' }).default(sql`0`).notNull(),
    totalKeystrokes: bigint({ mode: 'bigint' }).default(sql`0`).notNull(),
    updatedAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('user_stats_races_completed_non_negative', sql`${table.racesCompleted} >= 0`),
    check('user_stats_total_words_non_negative', sql`${table.totalWords} >= 0`),
    check('user_stats_total_time_ms_non_negative', sql`${table.totalTimeMs} >= 0`),
    check('user_stats_best_wpm_non_negative', sql`${table.bestWpm} >= 0`),
    check('user_stats_wins_non_negative', sql`${table.wins} >= 0`),
    check('user_stats_correct_keystrokes_non_negative', sql`${table.correctKeystrokes} >= 0`),
    check('user_stats_total_keystrokes_non_negative', sql`${table.totalKeystrokes} >= 0`),
  ],
);

/**
 * Typing corpus for coherent mode (CONF-03): real, public-domain passages.
 *
 * `complexity` is a stored classification, not an opinion: the three metric
 * columns are computed by `src/lib/text-metrics.ts` before insert and
 * `classifyComplexity` derives the level from them — each metric votes
 * facile/moyen/difficile, the word-length vote counts double, and the sums
 * `<= 1` / `2–4` / `>= 5` map to facile / moyen / difficile. Thresholds:
 * avg word length `<= 4.3` facile, `>= 4.55` difficile; long-word (>= 8
 * letters) ratio `<= 0.09` facile, `>= 0.13` difficile; special-char ratio
 * `<= 0.03` facile, `>= 0.07` difficile. The rationale is documented in
 * `doc/database.md` (CONF-05).
 */
export const texts = pgTable(
  'texts',
  {
    /** Internal primary key. Foreign keys reference this; never expose it. */
    id: bigserial({ mode: 'number' }).primaryKey(),
    /** ISO 639-1 code of the passage language (`fr` or `en`). */
    language: varchar({ length: 2 }).notNull(),
    /** Author and work, e.g. `Moby-Dick (chapter 1) — Herman Melville (1851)`. */
    title: varchar({ length: 160 }).notNull(),
    /** The passage itself, verbatim from a public-domain source. */
    body: text().notNull(),
    /** Whitespace-separated word count (`computeTextMetrics`). */
    wordCount: integer().notNull(),
    /** Classification derived from the metric columns by `classifyComplexity`. */
    complexity: varchar({ length: 16 }).notNull(),
    /** Mean letters per word (2 decimals). */
    avgWordLength: numeric({ precision: 5, scale: 2 }).notNull(),
    /** Share of words with >= 8 letters (0–1, 4 decimals). */
    longWordRatio: numeric({ precision: 6, scale: 4 }).notNull(),
    /** Share of characters that are not letters, digits or whitespace (0–1, 4 decimals). */
    specialCharRatio: numeric({ precision: 6, scale: 4 }).notNull(),
    /** Config flags for CONF-06 filtering (punctuation/numbers/capitals/accents). */
    hasPunctuation: boolean().default(false).notNull(),
    hasNumbers: boolean().default(false).notNull(),
    hasCapitals: boolean().default(false).notNull(),
    hasAccents: boolean().default(false).notNull(),
    createdAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('texts_language_valid', sql`${table.language} in ('fr', 'en')`),
    check('texts_complexity_valid', sql`${table.complexity} in ('facile', 'moyen', 'difficile')`),
    check('texts_word_count_positive', sql`${table.wordCount} > 0`),
    check('texts_avg_word_length_non_negative', sql`${table.avgWordLength} >= 0`),
    check('texts_long_word_ratio_non_negative', sql`${table.longWordRatio} >= 0`),
    check('texts_special_char_ratio_non_negative', sql`${table.specialCharRatio} >= 0`),
    // Room configuration filters the corpus by language + complexity (CONF-02/05).
    index('texts_language_complexity_idx').on(table.language, table.complexity),
  ],
);

/**
 * Random-mode word source (CONF-03): a pool of words per language and
 * complexity. The list is a JSON array of strings with at least 100 entries
 * (enforced by CHECK), so a race can sample words without repeating them too
 * soon. One row per (language, complexity) — 6 rows in total.
 */
export const wordDictionaries = pgTable(
  'word_dictionaries',
  {
    /** Internal primary key. Foreign keys reference this; never expose it. */
    id: bigserial({ mode: 'number' }).primaryKey(),
    /** ISO 639-1 code of the word list language (`fr` or `en`). */
    language: varchar({ length: 2 }).notNull(),
    /** Hand-curated difficulty of the list (`facile`, `moyen`, `difficile`). */
    complexity: varchar({ length: 16 }).notNull(),
    /** Array of >= 100 words, e.g. `["the", "cat", "run"]`. */
    words: jsonb().$type<string[]>().notNull(),
    createdAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('word_dictionaries_language_complexity_unique').on(
      table.language,
      table.complexity,
    ),
    check('word_dictionaries_language_valid', sql`${table.language} in ('fr', 'en')`),
    check(
      'word_dictionaries_complexity_valid',
      sql`${table.complexity} in ('facile', 'moyen', 'difficile')`,
    ),
    check('word_dictionaries_words_min_length', sql`jsonb_array_length(${table.words}) >= 100`),
  ],
);

export const userResources = pgTable(
  'user_resources',
  {
    userId: bigint({ mode: 'number' })
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    coins: bigint({ mode: 'bigint' }).default(sql`0`).notNull(),
    gems: integer().default(0).notNull(),
    updatedAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('user_resources_coins_non_negative', sql`${table.coins} >= 0`),
    check('user_resources_gems_non_negative', sql`${table.gems} >= 0`),
  ],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  stats: one(userStats, {
    fields: [users.id],
    references: [userStats.userId],
  }),
  resources: one(userResources, {
    fields: [users.id],
    references: [userResources.userId],
  }),
  oauthAccounts: many(oauthAccounts),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id],
  }),
}));

export const userStatsRelations = relations(userStats, ({ one }) => ({
  user: one(users, {
    fields: [userStats.userId],
    references: [users.id],
  }),
}));

export const userResourcesRelations = relations(userResources, ({ one }) => ({
  user: one(users, {
    fields: [userResources.userId],
    references: [users.id],
  }),
}));

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type UserStat = InferSelectModel<typeof userStats>;
export type NewUserStat = InferInsertModel<typeof userStats>;
export type UserResource = InferSelectModel<typeof userResources>;
export type NewUserResource = InferInsertModel<typeof userResources>;
export type OAuthAccount = InferSelectModel<typeof oauthAccounts>;
export type NewOAuthAccount = InferInsertModel<typeof oauthAccounts>;
export type Text = InferSelectModel<typeof texts>;
export type NewText = InferInsertModel<typeof texts>;
export type WordDictionary = InferSelectModel<typeof wordDictionaries>;
export type NewWordDictionary = InferInsertModel<typeof wordDictionaries>;

/**
 * Public projection of a user: the internal `id` is dropped so it cannot leak
 * through an API response or a cached payload.
 */
type PublicUser = Omit<User, 'id'>;

type StatsFields = Pick<
  UserStat,
  | 'racesCompleted'
  | 'totalWords'
  | 'totalTimeMs'
  | 'bestWpm'
  | 'wins'
  | 'correctKeystrokes'
  | 'totalKeystrokes'
>;

type ResourceFields = Pick<UserResource, 'coins' | 'gems'>;

/**
 * A user joined with both child rows, plus metrics derived at read time.
 *
 * `avgWpm` is `totalWords / (totalTimeMs / 60000)`, and is `0` whenever no time
 * has been recorded, so an untouched profile never divides by zero.
 * `avgAccuracy` is `correctKeystrokes / totalKeystrokes * 100` (rounded to 2
 * decimals, `0` when nothing was typed yet) — accuracy is intentionally not a
 * stored column so it can never contradict the keystroke counters (AUTH-06).
 */
export type UserProfileWithStats = PublicUser &
  StatsFields &
  ResourceFields & {
    avgWpm: number;
    avgAccuracy: number;
  };

/**
 * Same shape, but for internal callers that need the numeric id to join tables
 * or write child rows. `passwordHash` is part of neither profile type: it is
 * only ever read by the authentication path. Keep this type confined to the
 * server.
 */
export type UserProfileWithStatsInternal = Omit<User, 'passwordHash'> &
  StatsFields &
  ResourceFields & {
    avgWpm: number;
    avgAccuracy: number;
  };
