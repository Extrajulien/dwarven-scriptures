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
| `src/db/verify-users.ts` | Live check of the user tables (`npm run db:verify`)           |
| `drizzle.config.ts`  | Drizzle Kit configuration (loads `.env.local`)                   |
| `drizzle/`           | Generated SQL migrations + journal — commit these, never edit by hand |

Adding a table means re-running `npm run db:generate` and `npm run db:migrate`.
Because `drizzle-kit` bundles the schema, everything reachable from
`src/db/schema.ts` must live in a `pg-core` module: relations and inferred types
are declared there rather than in a separate file.

## Schema

Three tables, all keyed so that no internal id ever reaches a client: the
`users.id` `bigserial` is used only for foreign keys, while `public_id` (uuid)
and `username` (slug) are the public identifiers. `user_stats` and
`user_resources` reference `users(id)` with `ON DELETE CASCADE`.

| Table             | Key            | Notes                                                   |
| ----------------- | -------------- | ------------------------------------------------------- |
| `users`           | `id` bigserial | unique `publicId` (uuid, `gen_random_uuid()`), unique `username` (≤ 32 chars), `passwordHash`, `pfpUrl`, `createdAt` |
| `user_stats`      | `userId` → `users.id` | `racesCompleted`, `totalWords`, `totalTimeMs`, `bestWpm`, `updatedAt` |
| `user_resources`  | `userId` → `users.id` | `coins`, `gems`, `updatedAt`                    |

`totalWords`, `totalTimeMs` and `coins` are `bigint` (surfaced as JavaScript
`bigint`); `bestWpm` is `numeric(6, 2)` (surfaced as a string so no precision is
lost). Every counter carries a `CHECK (... >= 0)` constraint as a last line of
defence behind the validation in `src/db/queries/users.ts`.

## Queries

`src/db/queries/users.ts` is the only module that touches these tables.

| Function | Behaviour |
| -------- | --------- |
| `createUserWithProfiles` | Inserts the user and both child rows in one transaction, so a partial write can never commit |
| `getUserFullProfile` | Joins by `publicId` **or** `username`, derives `avgWpm`, returns `null` when absent, and never returns `passwordHash` |
| `recordCompletedRace` | Upserts `user_stats`; every counter is incremented in SQL and `bestWpm` uses `GREATEST`, so concurrent finishes cannot clobber each other |
| `adjustUserCoins` | Applies a signed delta with `WHERE (coins + delta) >= 0`, throwing `InsufficientCoinsError` when the guard matches no row and `UserNotFoundError` when the row is absent |

`avgWpm` is `totalWords / (totalTimeMs / 60000)` and is `0` when no time has been
recorded, so an untouched profile never divides by zero.

Types: `User`, `NewUser`, `UserStat`, `UserResource`, … are inferred with
`InferSelectModel` / `InferInsertModel`. `UserProfileWithStats` omits the
internal `id` for API responses, while `UserProfileWithStatsInternal` keeps it
for server-side follow-up writes. Neither includes `passwordHash`.

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
| `npm run db:push`    | Push the schema straight to a database (no SQL files)|
| `npm run db:studio`  | Open Drizzle Studio to browse the data               |
| `npm run db:verify`  | Exercise the user tables against the configured database |

`db:push` and `db:studio` are convenient while iterating locally. Anything that
must reach a shared or deployed database goes through committed migrations with
`db:generate` + `db:migrate` instead.

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
