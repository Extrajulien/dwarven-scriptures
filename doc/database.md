# Database

PostgreSQL is the source of persistent application data ([AGENTS.md](../AGENTS.md)).
Drizzle ORM is the only way the application talks to it; every schema change goes
through a committed migration.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in DATABASE_URL
npm run db:docker            # local PostgreSQL 16 on port 5432
npm run db:generate          # SQL migrations from src/db/schema.ts -> ./drizzle
npm run db:migrate           # apply pending migrations
```

`docker-compose.yml` runs `postgres:16-alpine` as `local_postgres` and keeps its
data in the `postgres_data` volume, so `docker compose down` preserves data
unless the volume is removed explicitly.

Because the container publishes port 5432 on the host, only one local PostgreSQL
can run at a time; stop any other instance if the port is taken.

## Files

| Path                 | Role                                                              |
| -------------------- | ----------------------------------------------------------------- |
| `src/db/schema.ts`   | Tables, relations and inferred types                |
| `src/db/index.ts`    | Drizzle client over a `pg` `Pool`, cached on `globalThis` in development |
| `src/db/queries/`    | Query and mutation functions, one module per aggregate |
| `src/db/migrate.ts`  | Migration runner (`npm run db:migrate`)                           |
| `src/db/seed.ts`     | Idempotent demo-data seed (`npm run db:seed`)                     |
| `src/db/verify-users.ts` | Live check of the user tables (`npm run db:verify`)           |
| `src/lib/text-metrics.ts` | Pure complexity metrics + classification (CONF-05)          |
| `drizzle.config.ts`  | Drizzle Kit configuration (loads `.env.local`)                   |
| `drizzle/`           | Generated SQL migrations + journal — commit these, never edit by hand |

Adding a table means re-running `npm run db:generate` and `npm run db:migrate`.
Because `drizzle-kit` bundles the schema, everything reachable from
`src/db/schema.ts` must live in a `pg-core` module: relations and inferred types
are declared there rather than in a separate file.

## Schema

Six tables, all keyed so that no internal id ever reaches a client: the
`users.id` `bigserial` is used only for foreign keys, while `publicId` (uuid)
and `username` are the public identifiers. `username` holds the trimmed
**display name** (it may contain spaces, is unique and ≤ 32 chars) rather than a
URL slug — see [`doc/auth.md`](auth.md) for how registration and OAuth populate
it. `user_stats`, `user_resources` and `oauth_accounts` reference `users(id)`
with `ON DELETE CASCADE`. `texts` and `word_dictionaries` hold the typing
content itself (reference data): they also have internal `id`s, but clients
will only ever receive a passage's `title`/`body`, never a row id.

| Table             | Key            | Notes                                                   |
| ----------------- | -------------- | ------------------------------------------------------- |
| `users`           | `id` bigserial | unique `publicId` (uuid, `gen_random_uuid()`), unique `username` (display name ≤ 32 chars), `passwordHash` (**nullable** for OAuth accounts), `pfpUrl`, `createdAt` |
| `user_stats`      | `userId` → `users.id` | `racesCompleted`, `totalWords`, `totalTimeMs`, `bestWpm`, `wins`, `correctKeystrokes`, `totalKeystrokes`, `updatedAt` |
| `user_resources`  | `userId` → `users.id` | `coins`, `gems`, `updatedAt`                    |
| `oauth_accounts`  | `userId` → `users.id` | unique `(provider, providerAccountId)`, `provider`, `providerAccountId`, `createdAt` |
| `texts`           | `id` bigserial | coherent-mode corpus: `language` (`fr`/`en` CHECK), `title`, `body`, `wordCount` (`> 0` CHECK), `complexity` (`facile`/`moyen`/`difficile` CHECK), metrics `avgWordLength`, `longWordRatio`, `specialCharRatio` (`>= 0` CHECKs), config flags `hasPunctuation`, `hasNumbers`, `hasCapitals`, `hasAccents`, `createdAt`; index on `(language, complexity)` |
| `word_dictionaries` | `id` bigserial | random-mode word pools: unique `(language, complexity)`, `words` jsonb (string array, `jsonb_array_length >= 100` CHECK), `createdAt` |

`totalWords`, `totalTimeMs`, `coins`, `correctKeystrokes` and `totalKeystrokes`
are `bigint` (surfaced as JavaScript `bigint`); `bestWpm` is `numeric(6, 2)`
(surfaced as a string so no precision is lost). Every counter carries a
`CHECK (... >= 0)` constraint as a last line of defence behind the validation
in `src/db/queries/users.ts`.

Accuracy (AUTH-06) is **not** stored as a column: `avgAccuracy` is derived at
read time as `correctKeystrokes / totalKeystrokes * 100` (rounded to 2
decimals, `0` when nothing was typed yet — see `src/db/queries/users.ts`). A
stored percentage could drift away from the counters that justify it; the
formula can never contradict them.

### Complexity (CONF-05)

`texts.complexity` is a stored classification justified by measurable metrics,
never an opinion. `src/lib/text-metrics.ts` computes three metrics per passage
and stores them next to the level they produced:

| Metric | Meaning | facile vote | difficile vote |
| ------ | ------- | ------------ | -------------- |
| `avgWordLength` | mean letters per word | `<= 4.3` | `>= 4.55` |
| `longWordRatio` | share of words with >= 8 letters | `<= 0.09` | `>= 0.13` |
| `specialCharRatio` | share of characters that are not letters, digits or whitespace | `<= 0.03` | `>= 0.07` |

`classifyComplexity` turns the metrics into a level: each metric votes
facile (0) / moyen (1) / difficile (2) against the thresholds above, the
word-length vote **counts double** (long words dominate typing effort), and the
sum maps to `<= 1` → facile, `2–4` → moyen, `>= 5` → difficile. Word length
counts letters only, so punctuation never inflates it — it is measured
separately by `specialCharRatio`. The same thresholds are documented in the
code comments of `src/db/schema.ts`, and the functions are unit-tested in
`src/lib/text-metrics.test.ts`.

The word dictionaries follow the same three levels; their lists are curated by
hand (short/common words for facile, long/rare words for difficile — the seeded
lists average ~4, ~7 and ~10 letters per word respectively) rather than
re-classified with `classifyComplexity`, because frequency of use matters as
much as length for a word pool.

## Queries

`src/db/queries/users.ts` owns the core user tables (profiles, stats,
resources), while `src/db/queries/oauth-accounts.ts` owns `oauth_accounts` and
the find-or-create entry point used by the OAuth callback.

| Function | Behaviour |
| -------- | --------- |
| `createUserWithProfiles` | Inserts the user and both child rows in one transaction, so a partial write can never commit |
| `getUserFullProfile` | Joins by `publicId` **or** `username`, derives `avgWpm` and `avgAccuracy`, returns `null` when absent, and never returns `passwordHash` |
| `recordCompletedRace` | Upserts `user_stats`; every counter is incremented in SQL and `bestWpm` uses `GREATEST`, so concurrent finishes cannot clobber each other |
| `adjustUserCoins` | Applies a signed delta with `WHERE (coins + delta) >= 0`, throwing `InsufficientCoinsError` when the guard matches no row and `UserNotFoundError` when the row is absent |
| `createOrLinkOAuthUser` | Returns the user linked to a provider identity or creates user + both child rows + the `oauth_accounts` link in one transaction; a username collision is retried with a random suffix |
| `findUserByOAuthAccount` | Looks up the user for a `(provider, providerAccountId)` pair, returning `null` on first sign-in |

`avgWpm` is `totalWords / (totalTimeMs / 60000)` and is `0` when no time has been
recorded, so an untouched profile never divides by zero. `avgAccuracy` is
`correctKeystrokes / totalKeystrokes * 100` and is `0` when nothing has been
typed yet — see the [Schema](#schema) section for why it is derived rather than
stored.

Types: `User`, `NewUser`, `UserStat`, `UserResource`, `OAuthAccount`,
`NewOAuthAccount`, … are inferred with `InferSelectModel` / `InferInsertModel`.
`UserProfileWithStats` omits the internal `id` for API responses, while
`UserProfileWithStatsInternal` keeps it for server-side follow-up writes.
Neither includes `passwordHash`.

## Environment variables

| Variable       | Example                                                        |
| -------------- | -------------------------------------------------------------- |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/app_db`          |

* `.env.local` holds the real local value and is gitignored.
* `.env.example` is committed and must only ever contain placeholder values.
* `DATABASE_URL` is server-only: never expose it, and never prefix it with
  `NEXT_PUBLIC_`.
* Next.js loads `.env.local` itself for the app runtime. `src/db/migrate.ts` and
  `drizzle.config.ts` run outside Next.js, so they load it with `dotenv`
  explicitly.

### TLS

`src/db/index.ts` enables TLS when `NODE_ENV=production` or when the connection
string contains `railway`, using `rejectUnauthorized: false` for managed
providers; local connections stay plain. This is enough for Railway's
`DATABASE_URL` as-is. `?sslmode=require` in the URL remains a valid alternative
for other providers.

## Scripts

| Command              | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `npm run db:docker`  | Start the local PostgreSQL container (detached)      |
| `npm run db:generate`| Generate SQL migrations from the schema              |
| `npm run db:migrate` | Apply pending migrations                             |
| `npm run db:seed`    | Insert the corpus, dictionaries and demo users (idempotent) |
| `npm run db:push`    | Push the schema straight to a database (no SQL files)|
| `npm run db:studio`  | Open Drizzle Studio to browse the data               |
| `npm run db:verify`  | Exercise the user tables against the configured database |

`db:push` and `db:studio` are convenient while iterating locally. Anything that
must reach a shared or deployed database goes through committed migrations with
`db:generate` + `db:migrate` instead.

## Seed

`npm run db:seed` (`src/db/seed.ts`, run through `tsx`, loads `.env.local` with
`dotenv` like `migrate.ts`) fills the local database with demo content:

* **Corpus** (30 passages): 13 French and 17 English public-domain passages
  from Project Gutenberg — La Fontaine, Hugo, Perrault, Verne, Baudelaire,
  Maupassant, Rimbaud, Daudet and Zola for French; Mother Goose, Aesop
  (Townsend translation), Jane Taylor, Dickinson, Austen, Melville, Dickens,
  Carroll, Poe, Stevenson, Twain, Donne, Bacon, Swift, Darwin and Hamilton for
  English. Each entry cites its work, author and source in a code comment next
  to the text itself. Passages run from ~20 to ~200 words and spread across the
  three complexities; the stored `complexity` and metrics are computed by
  `src/lib/text-metrics.ts`, not hard-coded.
* **Word dictionaries** (6 rows): one ≥100-word pool per
  (language × complexity), profanity-free, curated so facile lists hold short
  common words and difficile lists long rare ones.
* **Demo accounts**: `demo`, `demo2` and `demo3` (password
  `demo-password-123`, hashed with `src/lib/password.ts` before insert) with
  realistic `user_stats` rows (races, words, time, best WPM, wins, keystroke
  counters).

**Idempotency strategy** — the seed checks before it writes, so running it
twice never duplicates rows:

* `texts`: skipped entirely when the table already contains any row (the
  corpus is a fixed public-domain set; to re-seed it, delete the rows first).
* `word_dictionaries`: rows are keyed by the unique `(language, complexity)`
  pair — present pairs are skipped, missing ones inserted.
* `users`: demo accounts are keyed by their unique username — existing
  usernames are skipped together with their stats.

The demo password is a known constant used for local development and the
planned E2E tests (TEST-03); it must never be reused for real accounts.

## Deployment (Railway)

1. Provision a PostgreSQL service and copy its connection string into the
   deployed environment's `DATABASE_URL`.
2. Run `npm run db:migrate` (or `npx drizzle-kit migrate`) with that
   `DATABASE_URL` set — the committed `drizzle/` folder is the migration source.
3. Never commit the deployed credentials.

## Tests

* `src/db/index.test.ts` mocks `pg` and `drizzle-orm/node-postgres`, so it
  asserts the pool options (TLS on/off) and the single-pool-per-process contract
  without touching a real database.
* `src/db/queries/users.test.ts` mocks the client and renders the statements
  the queries build, which is what proves the counters are incremented in SQL
  rather than through a JavaScript read-modify-write.
* `npm run db:verify` is the complement to both: it runs against a real
  database and checks what a mock cannot — column defaults, cascade deletes and
  the `CHECK` constraints. Run it after changing the schema or a migration.

`NODE_ENV=test` skips `.env.local` in Next.js, so tests set the variables they
need themselves. `db:verify` and `db:migrate` run outside Next.js and therefore
load `.env.local` through `dotenv` before importing the client; keeping that
order matters, because `src/db/index.ts` reads `DATABASE_URL` as it is
evaluated.
