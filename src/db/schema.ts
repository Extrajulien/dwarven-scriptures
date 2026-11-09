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
  uniqueIndex,
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

/**
 * Alphabet for the 6-character room code (SALLE-02). The ambiguous characters
 * 0/O and 1/I/L are excluded so codes survive being read aloud or retyped. The
 * `rooms_code_valid` CHECK below mirrors this exact set — keep the two in sync
 * (the generator in `src/lib/room-rules.ts` draws from this constant).
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Levels a host can assign to bots (BOT-01). */
export type BotLevel = 'noob' | 'debutant' | 'intermediaire' | 'expert' | 'impossible';

/**
 * JSON shape of the host-configurable race configuration stored in
 * `rooms.config` (CONF-01..12). This type is the storage contract; the Zod
 * schema that validates it on every write lives in `src/lib/room-config.ts`
 * and must stay assignable to it.
 */
export type RoomConfig = {
  textLanguage: 'fr' | 'en';
  textComplexity: 'facile' | 'moyen' | 'difficile';
  textType: 'coherent' | 'random';
  wordCount: number;
  timeLimitSeconds: number | null;
  errorMode: 'accumulate' | 'stop';
  options: {
    punctuation: boolean;
    numbers: boolean;
    capitals: boolean;
    accents: boolean;
  };
  bonusesEnabled: boolean;
  bots: Array<{ level: BotLevel; count: number }>;
};

/**
 * A race room (SALLE-01/02/03/05, COURSE-01 groundwork).
 *
 * `code` is the human-facing join handle; `publicId` is the external id used
 * by APIs and the realtime layer. Internal ids never reach clients.
 */
export const rooms = pgTable(
  'rooms',
  {
    /** Internal primary key. Foreign keys reference this; never expose it. */
    id: bigserial({ mode: 'number' }).primaryKey(),
    /** External identifier used by public APIs and room URLs. */
    publicId: uuid().defaultRandom().notNull().unique(),
    /**
     * Short 6-character join code drawn from {@link ROOM_CODE_ALPHABET}
     * (SALLE-02). Stored uppercase; the CHECK below rejects anything outside
     * the alphabet so a bad generator or a direct write can never persist an
     * ambiguous code.
     */
    code: varchar({ length: 6 }).notNull().unique(),
    /** Owning user. Kept with `restrict` so a room can never silently vanish. */
    hostUserId: bigint({ mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Who may find the room: public listing, code/link, or link only (SALLE-03). */
    visibility: varchar({ length: 16 }).notNull(),
    /** Race state machine, COURSE-01. */
    status: varchar({ length: 16 }).default('en_attente').notNull(),
    /** Max participants; spectators do not count (SALLE-05). */
    capacity: integer().default(10).notNull(),
    /**
     * Host-configurable race settings, validated by `src/lib/room-config.ts`
     * before every write (CONF-01..12). The column default is the empty
     * object only as a last resort — application code always writes a full,
     * parsed config.
     */
    config: jsonb().$type<RoomConfig>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow().notNull(),
    /** Set when the host closes the room (`status = 'fermee'`). */
    closedAt: timestamp({ mode: 'date', withTimezone: true }),
  },
  (table) => [
    // Mirrors ROOM_CODE_ALPHABET: A-H, J, K, M, N, P-Z and 2-9 only.
    check(
      'rooms_code_valid',
      sql`${table.code} ~ '^[A-HJKMNP-Z2-9]{6}$'`,
    ),
    check('rooms_visibility_valid', sql`${table.visibility} in ('public', 'code', 'private')`),
    check(
      'rooms_status_valid',
      sql`${table.status} in ('en_attente', 'decompte', 'en_course', 'resultats', 'fermee')`,
    ),
    check('rooms_capacity_range', sql`${table.capacity} >= 2 and ${table.capacity} <= 30`),
  ],
);

/**
 * One row per person present in a room. A person is either a connected user
 * (`userId`) or a guest identified by their signed guest-cookie id
 * (`guestToken`), never both (SALLE-06, AUTH-02).
 *
 * `leftAt` marks the end of a presence: leaving, being kicked, or moving to
 * another room sets it. Only rows with `leftAt IS NULL` count as present, and
 * the two partial unique indexes below make "one active room per person" a
 * database guarantee — a second tab, a second room, or a race between two
 * joins cannot produce two active rows for the same identity.
 */
export const roomMembers = pgTable(
  'room_members',
  {
    /** Internal primary key. Foreign keys reference this; never expose it. */
    id: bigserial({ mode: 'number' }).primaryKey(),
    roomId: bigint({ mode: 'number' })
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    /** Connected user; `null` for guests, who use `guestToken` instead. */
    userId: bigint({ mode: 'number' }).references(() => users.id, {
      onDelete: 'cascade',
    }),
    /** Guest cookie id (uuid) for guest members; `null` for connected users. */
    guestToken: varchar({ length: 36 }),
    /** Host owns the room; participants race; spectators watch (SALLE-01/05). */
    role: varchar({ length: 16 }).notNull(),
    joinedAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow().notNull(),
    /** Set when the member leaves, is kicked, or moves to another room. */
    leftAt: timestamp({ mode: 'date', withTimezone: true }),
    /** Kicked members cannot rejoin this room (SALLE-07). */
    kicked: boolean().default(false).notNull(),
  },
  (table) => [
    check('room_members_role_valid', sql`${table.role} in ('host', 'participant', 'spectator')`),
    // Exactly one identity: a member is a user XOR a guest.
    check(
      'room_members_exactly_one_identity',
      sql`(${table.userId} is null) <> (${table.guestToken} is null)`,
    ),
    // SALLE-06: one active room per connected user.
    uniqueIndex('room_members_one_active_user_idx')
      .on(table.userId)
      .where(sql`${table.userId} is not null and ${table.leftAt} is null`),
    // SALLE-06: one active room per guest identity.
    uniqueIndex('room_members_one_active_guest_idx')
      .on(table.guestToken)
      .where(sql`${table.guestToken} is not null and ${table.leftAt} is null`),
    index('room_members_room_id_idx').on(table.roomId),
  ],
);

/**
 * Invitation links (SALLE-04): one row per generated link, with a
 * cryptographically random token (>= 128 bits of entropy). The first use binds
 * the link to an IP address and a membership; only that bound member may reuse
 * it. Kicking a member or closing the room revokes their links.
 */
export const invitationLinks = pgTable(
  'invitation_links',
  {
    /** Internal primary key. Foreign keys reference this; never expose it. */
    id: bigserial({ mode: 'number' }).primaryKey(),
    roomId: bigint({ mode: 'number' })
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    /** base64url random token with >= 128 bits of entropy (SALLE-04). */
    token: text().notNull().unique(),
    status: varchar({ length: 16 }).default('unused').notNull(),
    /** IP address the link was first consumed from; set together with the binding. */
    boundIp: varchar({ length: 45 }),
    /** Membership the link is bound to after its first use. */
    boundMemberId: bigint({ mode: 'number' }).references(() => roomMembers.id, {
      onDelete: 'set null',
    }),
    usedAt: timestamp({ mode: 'date', withTimezone: true }),
    revokedAt: timestamp({ mode: 'date', withTimezone: true }),
    createdAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('invitation_links_status_valid', sql`${table.status} in ('unused', 'used', 'revoked')`),
    // A used link is always bound to an IP, a membership and a timestamp.
    check(
      'invitation_links_used_requires_binding',
      sql`${table.status} <> 'used' or (${table.boundIp} is not null and ${table.boundMemberId} is not null and ${table.usedAt} is not null)`,
    ),
    // A revoked link always records when it was revoked.
    check(
      'invitation_links_revoked_requires_timestamp',
      sql`${table.status} <> 'revoked' or ${table.revokedAt} is not null`,
    ),
  ],
);

/**
 * One finished race (RES-05, HIST-01/02). A race is persisted once, at the
 * `en_course → resultats` transition, and outlives its room: `roomId` is
 * nullable with `ON DELETE SET NULL` so closing a room never erases history.
 * `roomPublicId` is denormalized from `rooms.publicId` so replay routing and
 * history links survive the room's deletion.
 *
 * `config` is the Zod-validated `RoomConfig` snapshot taken at race start
 * (CONF-12) — later edits of the room config never rewrite a stored race.
 * Only finished races are written today (aborted races are not ranked —
 * GAME-5 — and produce no history); `status` keeps `aborted` as a legal
 * value for the future, guarded by the CHECK below.
 */
export const races = pgTable(
  'races',
  {
    /** Internal primary key. Foreign keys reference this; never expose it. */
    id: bigserial({ mode: 'number' }).primaryKey(),
    /** External identifier used by the replay route `/races/[publicId]`. */
    publicId: uuid().defaultRandom().notNull().unique(),
    /**
     * The room this race ran in; `SET NULL` because the room may close while
     * the race history must survive (RES-05).
     */
    roomId: bigint({ mode: 'number' }).references(() => rooms.id, {
      onDelete: 'set null',
    }),
    /** Denormalized room public id (uuid string) for replay routing. */
    roomPublicId: varchar({ length: 36 }).notNull(),
    /** The full text typed in this race (history replay renders it). */
    textBody: text().notNull(),
    /** ISO 639-1 code of the text (`fr` or `en`). */
    textLanguage: varchar({ length: 2 }).notNull(),
    /** Race config snapshot taken at start (CONF-12). */
    config: jsonb().$type<RoomConfig>().notNull(),
    /** `finished` today; `aborted` reserved for a future change of policy. */
    status: varchar({ length: 16 }).notNull(),
    /** Typing-start → `resultats` duration in milliseconds (Annexe A base). */
    durationMs: integer().notNull(),
    /** Typing start (countdown end). */
    startedAt: timestamp({ mode: 'date', withTimezone: true }).notNull(),
    /** When the race reached `resultats`. */
    finishedAt: timestamp({ mode: 'date', withTimezone: true }).notNull(),
  },
  (table) => [
    check('races_language_valid', sql`${table.textLanguage} in ('fr', 'en')`),
    check('races_status_valid', sql`${table.status} in ('finished', 'aborted')`),
    check('races_duration_positive', sql`${table.durationMs} > 0`),
    check('races_room_public_id_not_empty', sql`${table.roomPublicId} <> ''`),
    // Replay routing and late-joiner lookups by the (denormalized) room id.
    index('races_room_public_id_idx').on(table.roomPublicId),
  ],
);

/**
 * One ranked result line of a persisted race (RES-05). Identity snapshots
 * match the engine's participant kinds: a connected user (`userId`), a guest
 * (`guestToken`), or a bot (Phase 4 — no identity). The CHECK ties the
 * identity columns to `kind`, so a user row can never carry a guest token
 * and vice versa. `displayName` is the snapshot at finish; `wpmSeries` is
 * the JSON array of `{elapsedMs, wpm}` samples the results chart replays.
 */
export const raceParticipants = pgTable(
  'race_participants',
  {
    /** Internal primary key. Foreign keys reference this; never expose it. */
    id: bigserial({ mode: 'number' }).primaryKey(),
    raceId: bigint({ mode: 'number' })
      .notNull()
      .references(() => races.id, { onDelete: 'cascade' }),
    /** `user` | `guest` | `bot` (bots arrive in Phase 4). */
    kind: varchar({ length: 16 }).notNull(),
    /** Connected user; `SET NULL` so history survives an account deletion. */
    userId: bigint({ mode: 'number' }).references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Guest cookie id (uuid) for guest participants; `null` otherwise. */
    guestToken: varchar({ length: 36 }),
    /** Display-name snapshot at finish (usernames can change later). */
    displayName: varchar({ length: 64 }).notNull(),
    /** Net WPM (Annexe A). */
    wpm: numeric({ precision: 8, scale: 2 }).notNull(),
    /** Raw WPM (Annexe A). */
    rawWpm: numeric({ precision: 8, scale: 2 }).notNull(),
    /** Correct ÷ total keystrokes × 100. */
    accuracy: numeric({ precision: 5, scale: 2 }).notNull(),
    /** totalKeystrokes − correctKeystrokes. */
    errors: integer().notNull(),
    /** `finished` | `timeout` | `quit` (COURSE-10). */
    status: varchar({ length: 16 }).notNull(),
    /** Milliseconds after typing start at which the status was recorded. */
    finishedAtMs: integer().notNull(),
    /** Final rank (COURSE-10), 1-based. */
    rank: integer().notNull(),
    /** Bonus count snapshot; always 0 until Phase 4 (BONUS-01..04). */
    bonusesReceived: integer().default(0).notNull(),
    /** WPM-over-time series (RES-03/05), array of `{elapsedMs, wpm}`. */
    wpmSeries: jsonb().$type<Array<{ elapsedMs: number; wpm: number }>>().notNull(),
  },
  (table) => [
    check('race_participants_kind_valid', sql`${table.kind} in ('user', 'guest', 'bot')`),
    check(
      'race_participants_status_valid',
      sql`${table.status} in ('finished', 'timeout', 'quit')`,
    ),
    check('race_participants_errors_non_negative', sql`${table.errors} >= 0`),
    check('race_participants_rank_positive', sql`${table.rank} >= 1`),
    check('race_participants_bonuses_non_negative', sql`${table.bonusesReceived} >= 0`),
    check('race_participants_finished_at_ms_non_negative', sql`${table.finishedAtMs} >= 0`),
    // Exactly one identity, matching the kind: a user carries `userId`, a
    // guest carries `guestToken`, a bot carries neither (AUTH-03).
    check(
      'race_participants_identity_matches_kind',
      sql`(${table.kind} = 'user' and ${table.userId} is not null and ${table.guestToken} is null)
          or (${table.kind} = 'guest' and ${table.guestToken} is not null and ${table.userId} is null)
          or (${table.kind} = 'bot' and ${table.userId} is null and ${table.guestToken} is null)`,
    ),
    index('race_participants_race_id_idx').on(table.raceId),
    // History listings (HIST-01) filter by the user's own rows.
    index('race_participants_user_id_idx')
      .on(table.userId)
      .where(sql`${table.userId} is not null`),
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

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  host: one(users, {
    fields: [rooms.hostUserId],
    references: [users.id],
  }),
  members: many(roomMembers),
  invitationLinks: many(invitationLinks),
  races: many(races),
}));

export const roomMembersRelations = relations(roomMembers, ({ one, many }) => ({
  room: one(rooms, {
    fields: [roomMembers.roomId],
    references: [rooms.id],
  }),
  user: one(users, {
    fields: [roomMembers.userId],
    references: [users.id],
  }),
  invitationLinks: many(invitationLinks),
}));

export const invitationLinksRelations = relations(invitationLinks, ({ one }) => ({
  room: one(rooms, {
    fields: [invitationLinks.roomId],
    references: [rooms.id],
  }),
  boundMember: one(roomMembers, {
    fields: [invitationLinks.boundMemberId],
    references: [roomMembers.id],
  }),
}));

export const racesRelations = relations(races, ({ one, many }) => ({
  room: one(rooms, {
    fields: [races.roomId],
    references: [rooms.id],
  }),
  participants: many(raceParticipants),
}));

export const raceParticipantsRelations = relations(raceParticipants, ({ one }) => ({
  race: one(races, {
    fields: [raceParticipants.raceId],
    references: [races.id],
  }),
  user: one(users, {
    fields: [raceParticipants.userId],
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
export type Room = InferSelectModel<typeof rooms>;
export type NewRoom = InferInsertModel<typeof rooms>;
export type RoomMember = InferSelectModel<typeof roomMembers>;
export type NewRoomMember = InferInsertModel<typeof roomMembers>;
export type InvitationLink = InferSelectModel<typeof invitationLinks>;
export type NewInvitationLink = InferInsertModel<typeof invitationLinks>;
export type Race = InferSelectModel<typeof races>;
export type NewRace = InferInsertModel<typeof races>;
export type RaceParticipant = InferSelectModel<typeof raceParticipants>;
export type NewRaceParticipant = InferInsertModel<typeof raceParticipants>;

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
