import { relations, sql, type InferInsertModel, type InferSelectModel } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
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
  passwordHash: text().notNull(),
  pfpUrl: text(),
  createdAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow().notNull(),
});

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
    updatedAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('user_stats_races_completed_non_negative', sql`${table.racesCompleted} >= 0`),
    check('user_stats_total_words_non_negative', sql`${table.totalWords} >= 0`),
    check('user_stats_total_time_ms_non_negative', sql`${table.totalTimeMs} >= 0`),
    check('user_stats_best_wpm_non_negative', sql`${table.bestWpm} >= 0`),
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

export const usersRelations = relations(users, ({ one }) => ({
  stats: one(userStats, {
    fields: [users.id],
    references: [userStats.userId],
  }),
  resources: one(userResources, {
    fields: [users.id],
    references: [userResources.userId],
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

/**
 * Public projection of a user: the internal `id` is dropped so it cannot leak
 * through an API response or a cached payload.
 */
type PublicUser = Omit<User, 'id'>;

type StatsFields = Pick<
  UserStat,
  'racesCompleted' | 'totalWords' | 'totalTimeMs' | 'bestWpm'
>;

type ResourceFields = Pick<UserResource, 'coins' | 'gems'>;

/**
 * A user joined with both child rows, plus metrics derived at read time.
 *
 * `avgWpm` is `totalWords / (totalTimeMs / 60000)`, and is `0` whenever no time
 * has been recorded, so an untouched profile never divides by zero.
 */
export type UserProfileWithStats = PublicUser &
  StatsFields &
  ResourceFields & {
    avgWpm: number;
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
  };
