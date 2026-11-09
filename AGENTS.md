# Project

Competitive typing-race web app for students (Monkeytype × Kahoot style). Players join a room by a short code, type the same text, and compete in real time with a live progress track, bots, comeback bonuses, results and statistics.

## Documentation

Assignment deliverables live in `doc/` at the repo root:

* [`doc/EXIGENCES.md`](doc/EXIGENCES.md): the full requirements matrix — every requirement ID as a checkbox line (`[ ]` non fait, `[x]` complet, `[x] (partiel)`), with files and tests noted on checked lines. Keep statuses honest — false "complete" claims are penalized harder than honest ones.
* [`doc/ARCHITECTURE.md`](doc/ARCHITECTURE.md): data model diagram, race state machine, ADR for the real-time tech and for bots, message flow.
* [`doc/DEMARCHE-CREATIVE.md`](doc/DEMARCHE-CREATIVE.md): human-made name and logo (with sketches), moodboard, palette, typography.
* [`doc/IA.md`](doc/IA.md): AI agents/tools used; instruction files such as this `AGENTS.md` must be committed.

Agent-facing working docs live in [`doc/`](doc/): [`auth.md`](doc/auth.md), [`database.md`](doc/database.md). Update the matching doc when a change makes it outdated.

## Stack

* Next.js (App Router, current stable) + React + TypeScript
* TypeScript at 100 %: no `.js`/`.jsx` files in the repo, `strict: true`, no explicit `any` (ESLint `@typescript-eslint/no-explicit-any` = error), no `@ts-ignore`/`@ts-expect-error` without a justifying comment
* Tailwind CSS
* PostgreSQL + Drizzle; migrations versioned in the repo; a seed script creates demo data (texts corpus, users, typing history)
* Zod validates every server-side input: server actions, API routes and real-time messages
* Real-time transport is a free choice (WebSocket, MQTT, ...); document the decision as an ADR
* Unit tests + Playwright E2E; CI on GitHub runs lint, `tsc --noEmit` and unit tests on every push
* Local PostgreSQL via Docker Compose; `.env.example` documents every env var, no secrets committed
* Deployed on a VPS, publicly accessible in HTTPS, functional in production at checkpoint 1 and at the final; external services on free tiers only
* French and English UI; light/dark themes (selector + system preference by default, no wrong-theme flash); responsive from 360 px — on mobile the race is replaced by a physical-keyboard message

## Architecture

* Keep game/business logic outside React components.
* Server is authoritative for race state, ranking, score, permissions and persistent stats.
* Never trust client-provided competitive values.
* Keep real-time transport separate from game logic.
* Design race state to survive temporary client/host disconnections.
* Race state and rankings must remain synchronized between players.

## Domain

Use the race states from `COURSE-01`: `EN_ATTENTE → DÉCOMPTE → EN_COURSE → RÉSULTATS → (EN_ATTENTE | FERMÉE)`.

WPM formulas (annexe A — use these exactly so results are comparable):

* net WPM = correctly typed characters ÷ 5 ÷ elapsed minutes
* raw WPM = total typed characters ÷ 5 ÷ elapsed minutes
* accuracy = correct keystrokes ÷ total keystrokes × 100
* progression = validated characters ÷ total text length (bonus-adjusted); spaces count as characters

Bots use the same race model as players. Keep bonus mechanics modular because their final behavior is documented, not fixed.

## Database

PostgreSQL is the source of persistent application data.

* Use migrations (Drizzle) for every schema change.
* Avoid destructive migrations unless explicitly requested; preserve existing data.
* A seed script creates demo data: texts corpus, users and typing history.
* Never commit database credentials.

## Security

* Validate every server-side input with Zod: server actions, API routes, real-time messages.
* Authorization is enforced server-side, including all host actions.
* Hash passwords (Argon2, bcrypt or scrypt); never store or log them in clear.
* Validate uploads server-side: real file type and size.
* Rate-limit room-code attempts per IP; invitation tokens ≥ 128 bits.
* Secrets stay in environment variables; never commit credentials or expose secrets through `NEXT_PUBLIC_*`.

## Development

* Follow the existing architecture and conventions; read relevant existing code before implementing.
* Reference requirement IDs (e.g. `COURSE-04`) in commits/PRs and keep `doc/EXIGENCES.md` statuses accurate.
* Keep solutions simple and avoid unnecessary abstractions.
* Make the smallest reasonable change; do not modify or refactor unrelated files.
* Do not add dependencies unless necessary.
* Preserve French and English support and both themes.
* Add or update tests when behavior changes, especially business logic.
* Avoid a default-generated look (`DES-04`): no stock hero gradients, no emojis as icons; the progress track is the signature element.

## Before finishing

For code changes:

1. Run relevant tests.
2. Run lint and typecheck.
3. Check the final diff for accidental changes.
4. Briefly report what changed, assumptions, and any unresolved requirements or remaining issues.

Never claim tests passed unless they were actually run.

## Git

* Never commit directly to `main`. Use dedicated branches for features and fixes.
* Commit frequently with small, focused commits; one logical change per commit (a few massive commits at the final is penalized).
* Keep commit messages short and in English, using Conventional Commits (`feat:`, `fix:`, `chore:`, ...).
* You may create local commits and branches.
* Do not push, merge, rebase or force-push unless explicitly requested. The user handles pushes.
* Never add Claude, Anthropic or any AI as a co-author, and never add `Co-Authored-By` trailers for AI.
* Do not mention AI assistance in commits or PRs unless explicitly requested.

## GitHub

* Use `gh` to inspect issues, pull requests and CI status when useful.
* After the user pushes changes, verify relevant GitHub Actions checks when requested.
* Investigate failing CI logs and fix failures when appropriate.
* Never push, merge, close issues or modify remote state unless explicitly requested.

## Efficiency

* Keep reasoning and responses concise.
* Read only files relevant to the current task.
* Prefer targeted searches over reading large files entirely.
* Run only relevant tests during development; run broader checks when necessary.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
