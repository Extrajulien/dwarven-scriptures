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

Twelve tables, all keyed so that no internal id ever reaches a client: the
`users.id` `bigserial` is used only for foreign keys, while `publicId` (uuid)
and `username` are the public identifiers. `username` holds the trimmed
**display name** (it may contain spaces, is unique and ≤ 32 chars) rather than a
URL slug — see [`doc/auth.md`](auth.md) for how registration and OAuth populate
it. `user_stats`, `user_resources`, `user_avatars` and `oauth_accounts`
reference `users(id)` with `ON DELETE CASCADE`. `texts` and `word_dictionaries`
hold the typing content itself (reference data): they also have internal
`id`s, but clients will only ever receive a passage's `title`/`body`, never a
row id.

| Table             | Key            | Notes                                                   |
| ----------------- | -------------- | ------------------------------------------------------- |
| `users`           | `id` bigserial | unique `publicId` (uuid, `gen_random_uuid()`), unique `username` (display name ≤ 32 chars), `passwordHash` (**nullable** for OAuth accounts), `pfpUrl`, `createdAt` |
| `user_stats`      | `userId` → `users.id` | `racesCompleted`, `totalWords`, `totalTimeMs`, `bestWpm`, `wins`, `correctKeystrokes`, `totalKeystrokes`, `updatedAt` |
| `user_resources`  | `userId` → `users.id` | `coins`, `gems`, `updatedAt`                    |
| `user_avatars`    | `userId` → `users.id` | uploaded profile picture: `contentType` (`image/jpeg`/`image/png`/`image/webp` CHECK), `bytes` bytea, `updatedAt` — see [Avatar uploads](#avatar-uploads-auth-04) below |
| `oauth_accounts`  | `userId` → `users.id` | unique `(provider, providerAccountId)`, `provider`, `providerAccountId`, `createdAt` |
| `texts`           | `id` bigserial | coherent-mode corpus: `language` (`fr`/`en` CHECK), `title`, `body`, `wordCount` (`> 0` CHECK), `complexity` (`facile`/`moyen`/`difficile` CHECK), metrics `avgWordLength`, `longWordRatio`, `specialCharRatio` (`>= 0` CHECKs), config flags `hasPunctuation`, `hasNumbers`, `hasCapitals`, `hasAccents`, `createdAt`; index on `(language, complexity)` |
| `word_dictionaries` | `id` bigserial | random-mode word pools: unique `(language, complexity)`, `words` jsonb (string array, `jsonb_array_length >= 100` CHECK), `createdAt` |
| `rooms`           | `id` bigserial | see [Rooms](#rooms-salle-0110) below |
| `room_members`    | `id` bigserial | see [Rooms](#rooms-salle-0110) below |
| `invitation_links` | `id` bigserial | see [Rooms](#rooms-salle-0110) below |
| `races`           | `id` bigserial | see [Race history](#race-history-res-05-hist-0102) below |
| `race_participants` | `id` bigserial | see [Race history](#race-history-res-05-hist-0102) below |

`totalWords`, `totalTimeMs`, `coins`, `correctKeystrokes` and `totalKeystrokes`
are `bigint` (surfaced as JavaScript `bigint`); `bestWpm` is `numeric(8, 2)`
(surfaced as a string so no precision is lost — widened from `(6, 2)` by
migration `0005_gorgeous_lady_ursula.sql` so a very short race's Annexe-A WPM
fits, RES-05). Every counter carries a
`CHECK (... >= 0)` constraint as a last line of defence behind the validation
in `src/db/queries/users.ts`.

Accuracy (AUTH-06) is **not** stored as a column: `avgAccuracy` is derived at
read time as `correctKeystrokes / totalKeystrokes * 100` (rounded to 2
decimals, `0` when nothing was typed yet — see `src/db/queries/users.ts`). A
stored percentage could drift away from the counters that justify it; the
formula can never contradict them.

### Avatar uploads (AUTH-04)

Uploaded profile pictures are stored **in PostgreSQL**, not on disk: the
Railway filesystem is ephemeral, and PostgreSQL is already the one durable
service the app owns, so no external object store is needed (TECH-08 — free
tiers only). `user_avatars` keeps one row per user (re-uploads replace the
bytes in place via `ON CONFLICT (userId) DO UPDATE`); `users.pfpUrl` only ever
holds the serving route `GET /api/avatar/[publicId]?v=<upload epoch ms>`, so
the write of the bytes and the URL pointer commit in a single transaction
(`storeUserAvatar`, `src/db/queries/avatars.ts`). The file type was already
decided by magic bytes before the write (SEC-02); the `contentType` CHECK is
the database-side backstop. Migration: `0006_gigantic_queen_noir.sql`.

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

### Rooms (SALLE-01..10)

The three room tables implement the lobby model. Internal ids (`rooms.id`,
`room_members.id`, `invitation_links.id`) never reach clients: rooms are
addressed by `rooms.publicId` (uuid) or their 6-character `code`, members by
their user `publicId` or guest token.

**`rooms`** — one row per race room (SALLE-01/02/03/05, COURSE-01):

* `code` varchar(6) **unique**, drawn from the alphabet
  `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no ambiguous 0/O or 1/I/L — SALLE-02) by
  `generateRoomCode` in `src/lib/room-rules.ts` (CSPRNG-backed in
  `src/db/queries/rooms.ts`). A CHECK mirrors the alphabet with the regex
  `^[A-HJKMNP-Z2-9]{6}$`, so no other code can ever be persisted.
* `visibility` CHECK `public | code | private` (SALLE-03); `status` CHECK
  `en_attente | decompte | en_course | resultats | fermee`, default
  `en_attente` (COURSE-01); `capacity` CHECK 2–30, default 10 (SALLE-05);
  `hostUserId` FK → `users.id` (`ON DELETE RESTRICT` — a room never vanishes
  because its host's account did); `closedAt` is set when the room closes.
* `config` jsonb NOT NULL, default `'{}'::jsonb`: the host-configurable race
  settings (CONF-01..12). The JSON shape is defined twice, deliberately tied
  together: the storage type `RoomConfig` in `src/db/schema.ts` and the Zod v4
  schema in `src/lib/room-config.ts`, which is declared
  `satisfies z.ZodType<RoomConfig>` so the two cannot drift. Every write goes
  through the Zod schema (`createRoom` resolves defaults for
  `null`/`undefined`; `updateRoomConfig` parses strictly and rejects unknown
  keys), so the column default is only a last resort.

**`room_members`** — one row per presence in a room. A member is exactly one
of a connected user (`userId` FK → `users.id`, `ON DELETE CASCADE`) or a guest
(`guestToken` = the uuid from the signed `guest` cookie — AUTH-02); a CHECK
`(userId is null) <> (guestToken is null)` enforces the XOR. `role` is
`participant` or `spectator` (the host's own row uses one of these too,
SALLE-01 — who is host is tracked by `rooms.hostUserId`, never by role),
`leftAt` marks the end of a presence (leaving, kick, room close, or moving to
another room) and `kicked` blocks any rejoin (SALLE-07).

The one-active-room rule (SALLE-06) is a **database constraint**, not just
application logic — two partial unique indexes:

* `room_members_one_active_user_idx` — UNIQUE (`userId`) WHERE `userId IS NOT
  NULL AND leftAt IS NULL`
* `room_members_one_active_guest_idx` — UNIQUE (`guestToken`) WHERE
  `guestToken IS NOT NULL AND leftAt IS NULL`

so a second tab, a second room, or a race between two joins can never produce
two active rows for the same person. A plain index on `roomId` serves member
listings. `joinRoom` works *with* the indexes instead of against them: inside
a transaction that locks the room row, a join of a **different** room first
sets `leftAt` on the previous active membership (preserving history) and then
inserts; a join of the **same** room raises `AlreadyInRoomError`. A
concurrent join that loses the index race retries and adopts the winner's
outcome. Kicking sets `kicked = true` **and** `leftAt`, so a kicked member is
free to join other rooms while `joinRoom`'s kick-history check blocks only
their old room.

**`invitation_links`** — one row per invitation link (SALLE-04). `token` is
unique text: 24 random bytes base64url (192 bits ≥ the 128-bit floor), so
links cannot be guessed. `status` CHECK `unused | used | revoked`; the first
consumption binds `boundIp` (varchar(45)) and `boundMemberId` (FK →
`room_members.id`, `ON DELETE SET NULL`) together with `usedAt` — a CHECK
requires a used link to carry all three, and a revoked link to carry
`revokedAt`. Reuse is allowed **only for the bound member** (same user or same
guest identity — the identity lives in the membership row, so reconnects work
from a new IP); anyone else is refused. Kicking a member revokes their links,
and closing a room revokes every remaining link, both inside the same
transaction as the kick/close itself (`src/db/queries/rooms.ts`).

### Race history (RES-05, HIST-01/02)

The two race tables persist every **finished** race and feed the account
history, the progression charts and the replay page. Internal ids never reach
clients: races are addressed by `races.publicId` (uuid), participants by their
wire identity (user `publicId` or guest token).

**`races`** — one row per finished race, written exactly once at the
`en_course → resultats` transition (PERF-02: one write per race):

* `publicId` uuid unique — the `/races/[publicId]` replay route (HIST-02).
* `roomId` FK → `rooms.id`, nullable with `ON DELETE SET NULL`: the room may
  close, the history survives. `roomPublicId` is **denormalized** from
  `rooms.publicId` (indexed) so replay routing keeps working after the room
  row is gone.
* `textBody` (the full typed text), `textLanguage` (`fr`/`en` CHECK) and
  `config` jsonb — the Zod-validated `RoomConfig` snapshot taken at race
  start (CONF-12); later config edits never rewrite a stored race.
* `status` CHECK `finished | aborted`. **Only `finished` is written today**:
  an aborted race (GAME-5) produces no ranking and no history — the decision
  is documented in `doc/ARCHITECTURE.md`; the `aborted` value stays legal for
  a future change of policy.
* `durationMs` (`> 0` CHECK) from typing start to `resultats`, plus
  `startedAt`/`finishedAt` timestamptz.

**`race_participants`** — one row per ranked result line (bounded batch,
≤ 30 racers while bots do not race yet): `kind` CHECK `user | guest | bot`,
`userId` FK → `users.id` (`ON DELETE SET NULL` — history survives an account
deletion) for users, `guestToken` for guests, nothing for bots, and a CHECK
that ties the identity columns to `kind` (a user row can never carry a guest
token — AUTH-03). `displayName` is the snapshot at finish; `wpm`/`rawWpm`
(`numeric(8,2)`), `accuracy` (`numeric(5,2)`), `errors`, `status` CHECK
`finished | timeout | quit`, `finishedAtMs`, `rank`, `bonusesReceived`
(always 0 until Phase 4) and `wpmSeries` jsonb (array of
`{elapsedMs, wpm}` — the RES-03/05 series the replay chart redraws).

Indexes: `races_room_public_id_idx` (replay routing), 
`race_participants_race_id_idx`, and the partial
`race_participants_user_id_idx` (`WHERE userId IS NOT NULL`) that serves the
per-user history listing (HIST-01).

**Persistence flow (RES-05):** at the finish, `RaceEngine` builds the
`RaceResultsPayload` (room routing id, text, config snapshot, per-participant
identity + counters + series) and hands it to the `persistResults` seam —
fire-and-forget with error logging, the in-memory state stays authoritative.
`persistRaceResult` writes everything in **one transaction**: the `races`
row, all `race_participants` rows, and for every human user participant a
`user_stats` upsert whose counters move in SQL (`racesCompleted + 1`,
`totalWords + floor(totalKeystrokes/5)`, `totalTimeMs + finishedAtMs`,
`bestWpm = GREATEST(bestWpm, wpm)`, `wins + 1` when the participant ranked
first and did not quit, keystroke counters for `avgAccuracy`). Guests and
bots never touch `user_stats` (AUTH-03). The engine payload → row mapping is
a pure function (`mapEngineResultsToPersistence`) with a defensive
`clampPersistedWpm` bound at the column capacity.

### Rate limiting (SALLE-10)

Room-code joins are rate-limited in memory by
`src/lib/rate-limit.ts` (sliding window, default 10 attempts per 60 s per IP,
wired into the `joinRoomByCode` server action). The window lives in one
process: correct for the current single-instance deployment, but if the
realtime layer later runs as a second process, both processes must share a
store (Redis/PostgreSQL) — documented in the module header as the single-
instance assumption.

## Queries

`src/db/queries/users.ts` owns the core user tables (profiles, stats,
resources), `src/db/queries/oauth-accounts.ts` owns `oauth_accounts` and the
find-or-create entry point used by the OAuth callback, `src/db/queries/rooms.ts`
owns `rooms`/`room_members` (creation, joins, host actions, presence),
`src/db/queries/invitations.ts` owns `invitation_links` and
`src/db/queries/races.ts` owns the race history (persistence, listing,
replay).

| Function | Behaviour |
| -------- | --------- |
| `createUserWithProfiles` | Inserts the user and both child rows in one transaction, so a partial write can never commit |
| `getUserFullProfile` | Joins by `publicId` **or** `username`, derives `avgWpm` and `avgAccuracy`, returns `null` when absent, and never returns `passwordHash` |
| `recordCompletedRace` | Upserts `user_stats`; every counter is incremented in SQL and `bestWpm` uses `GREATEST`, so concurrent finishes cannot clobber each other |
| `adjustUserCoins` | Applies a signed delta with `WHERE (coins + delta) >= 0`, throwing `InsufficientCoinsError` when the guard matches no row and `UserNotFoundError` when the row is absent |
| `createOrLinkOAuthUser` | Returns the user linked to a provider identity or creates user + both child rows + the `oauth_accounts` link in one transaction; a username collision is retried with a random suffix |
| `findUserByOAuthAccount` | Looks up the user for a `(provider, providerAccountId)` pair, returning `null` on first sign-in |
| `createRoom` (rooms) | Inserts the room and the host membership in one transaction; the 6-char code is drawn with a CSPRNG and retried on the rare collision; the config is resolved through the Zod schema; refuses when the host is already active in another room (SALLE-06) |
| `joinRoom` (rooms) | Locks the room row, checks status (SALLE-09), kick history (SALLE-07) and participant capacity (SALLE-05) in SQL, then inserts — left-marking the previous active membership when the person was in another room, rejecting the same room (SALLE-06); retries a lost unique-index race |
| `kickMember` / `closeRoom` (rooms) | Host-verified (SEC-01) transactions that also revoke the member's / room's invitation links in the same statement batch (SALLE-04) |
| `updateRoomConfig` (rooms) | Re-parses the config with the Zod schema and stores it, host-only |
| `consumeInvitationToken` (invitations) | Locks the link, binds IP + membership on first use, allows reuse only for the bound member, refuses revoked links |
| `persistRaceResult` (races) | One transaction: `races` row + all `race_participants` rows + SQL-side `user_stats` increments for every human user participant (RES-05); guests/bots skipped (AUTH-03) |
| `listUserRaces` (races) | Paginated history of a user's finished races (HIST-01): LIMIT/OFFSET with a total count — the pagination choice is documented in the module header |
| `listRecentUserRaces` / `countUserRacesPerDay` (races) | Feed the account progression charts (AUTH-06, STAT-3): the most recent races and the per-day aggregates |
| `getRaceForReplay` (races) | Public replay view of a persisted race by its public id (HIST-02), `null` when absent |

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

Production is live at `https://dwarven-scriptures.up.railway.app` (project
`dwarven-scriptures`, environment `production`, region `sfo`). What actually
worked at checkpoint 1 (2026-11-08):

1. **Infrastructure** — one project with two services: `Postgres` (plugin,
   `ghcr.io/railwayapp-templates/postgres-ssl:18`, volume-backed) and
   `dwarven-scriptures` (the app, built by Railpack from the repo). The app's
   service domain `dwarven-scriptures.up.railway.app` targets port 8080.
2. **Variables on the app service** — `DATABASE_URL` is the reference
   `${{Postgres.DATABASE_URL}}` (resolved by Railway; inside the private
   network it points at `postgres.railway.internal`), plus `SESSION_SECRET`
   (64 hex chars, generated with `node:crypto`, set via the CLI, never
   committed), `WS_ALLOWED_ORIGINS=https://dwarven-scriptures.up.railway.app`,
   `NODE_ENV=production` and `PORT=8080`. Never commit any of these values.
3. **Build** — Railpack runs `npm ci` + `npm run build` (auto-detected) and
   starts `npm run start` = `tsx server.ts`. `package.json` pins
   `"packageManager": "npm@11.19.0"` because Railpack otherwise picks Bun when
   a stray `bun.lock` sits in the uploaded directory. The build works without
   `DATABASE_URL` (the pool in `src/db/index.ts` is created lazily on first
   query), but Railway injects the service variables at build time anyway.
4. **Deploy** — `railway up --project <id> --service dwarven-scriptures
   --environment production` (with `RAILWAY_API_TOKEN` set). Deploys of this
   repo from the local directory are the authorized path; pushes to GitHub are
   not (AGENTS.md).
5. **Migrate + seed** — the production `DATABASE_URL` uses the private-network
   hostname, which is only reachable from inside Railway. From a local
   machine: temporarily create a TCP proxy on the `Postgres` service
   (`railway tcp-proxy create --port 5432 --service Postgres`), redeploy
   Postgres once to activate it, run `npm run db:migrate` then `npm run
   db:seed` with a `DATABASE_URL` built from `postgres://postgres:<password>@
   <proxy-domain>:<proxy-port>/railway`, then delete the proxy (`railway
   tcp-proxy delete`) and redeploy Postgres again so the public port closes.
   **Final-remise fallback (used 2026-11-09):** the public proxy port was
   unreachable from the development machine (TCP connect ETIMEDOUT to the
   proxy IP; likely egress filtering), so the migrations were applied over an
   **SSH port-forward instead**: `railway ssh keys add`, generate the config
   with `railway ssh config -s dwarven-scriptures --path <file>`, then
   `ssh -F <file> -N -L 15432:postgres.railway.internal:5432
   railway-dwarven-scriptures` in one process and run `npm run db:migrate` /
   `db:seed` locally with `postgres://postgres:<password>@[::1]:15432/railway`
   (the tunnel binds `::1`). Note `railway run` does **not** tunnel the
   private network in the current CLI (it passed
   `postgres.railway.internal` through → ENOTFOUND), and running
   `npm run db:migrate` **inside** the app container via `railway ssh` only
   applies the migration files shipped with the deployed image — always run
   migrations from the local repo to get the latest `drizzle/` files.
   Migrations and the seed are idempotent.
6. **Never commit the deployed credentials** — including the SESSION_SECRET
   and any proxy URL.

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
