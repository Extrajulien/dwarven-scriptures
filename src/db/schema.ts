// Drizzle schema entry point.
//
// No tables are defined yet: the domain requirements are still preliminary
// (see AGENTS.md), so the schema will be added together with the features that
// need it. Keep this file as the single schema entry referenced by
// `drizzle.config.ts` and `src/db/index.ts`.
//
// Example of how a table is declared once a feature is confirmed:
//
//   import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
//
//   export const players = pgTable('players', {
//     id: uuid('id').primaryKey().defaultRandom(),
//     displayName: text('display_name').notNull(),
//     createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
//   });

export {};
