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
| `src/db/schema.ts`   | Schema entry point, referenced by `drizzle.config.ts` and `src/db/index.ts` |
| `src/db/index.ts`    | Drizzle client over a `pg` `Pool`, cached on `globalThis` in development |
| `src/db/migrate.ts`  | Migration runner (`npm run db:migrate`)                           |
| `drizzle.config.ts`  | Drizzle Kit configuration (loads `.env.local`)                   |
| `drizzle/`           | Generated SQL migrations + journal — commit these, never edit by hand |

`src/db/schema.ts` intentionally defines no tables yet: the domain
requirements are still preliminary, so tables are added with the features that
need them. Adding a table means re-running `npm run db:generate` and
`npm run db:migrate`.

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

`src/db/index.test.ts` mocks `pg` and `drizzle-orm/node-postgres`, so it asserts
the pool options (TLS on/off) and the single-pool-per-process contract without
touching a real database. `NODE_ENV=test` skips `.env.local` in Next.js, so
tests set the variables they need themselves.
