# Project

Competitive typing-race web app for students, inspired by Monkeytype and Kahoot. Players type the same text and compete in real time. It should feel like a game rather than a traditional typing test: live rankings, progression indicators, results and statistics.

The requirements are still preliminary. Do not treat unconfirmed ideas as final requirements or implement speculative features.

## Documentation

Detailed docs live in [`doc/`](doc/README.md). Read the relevant file before working in that area:

* [`doc/architecture.md`](doc/architecture.md): folder layout and where code belongs
* [`doc/design-system.md`](doc/design-system.md): Persona 5 theme, tokens and UI patterns
* [`doc/i18n.md`](doc/i18n.md): adding translated text
* [`doc/testing.md`](doc/testing.md): checks and test conventions
* [`doc/status.md`](doc/status.md): what is built, mocked or undecided

Update the matching doc when a change makes it outdated.

## Stack

* Next.js + React + TypeScript
* Tailwind CSS
* PostgreSQL
* French and English UI
* Light/dark mode and responsive layouts (the race itself is primarily designed for desktop)
* Unit + E2E tests
* CI on GitHub

Keep TypeScript strict. Avoid `any`.

## Core features

* Real-time multiplayer typing races.
* Public, unlisted and private lobbies.
* Guest users and registered accounts.
* Google, GitHub and Discord OAuth.
* Customizable typing texts and race settings.
* Different error-handling modes.
* Human-like bots with multiple difficulty levels.
* Player statistics and typing history.
* Per-character performance / keyboard heatmaps.
* Race results and podium.
* Host and spectator modes.
* Reconnection during active races.
* Game-like bonuses and catch-up mechanics.

Race state and rankings must remain synchronized between players.

## Architecture

* Keep game/business logic outside React components.
* Server is authoritative for race state, ranking, score, permissions and persistent stats.
* Never trust client-provided competitive values.
* Keep real-time transport separate from game logic.
* Design race state to survive temporary client/host disconnections.
* Validate untrusted input server-side.
* Never hardcode user-facing strings; use i18n.

## Domain

Race lifecycle should use explicit states such as:
`waiting -> countdown -> racing -> finished -> closed`

Typing logic should support:

* WPM and accuracy
* mistakes per character
* configurable error behavior
* keyboard heatmap statistics

Bots should use the same race model as players and support variable WPM/errors.

Keep bonus mechanics modular because their final behavior is not confirmed.

## Database

PostgreSQL is the source of persistent application data.

* Use migrations for every schema change.
* Avoid destructive migrations unless explicitly requested.
* Preserve existing data unless explicitly asked otherwise.
* Never commit database credentials.

### ORM

use Drizzle as the orm.

## Security

* Hash passwords.
* Authorization is enforced server-side.
* Secrets stay in environment variables.
* Never commit credentials or expose secrets through `NEXT_PUBLIC_*`.

## Development

* Follow the existing architecture and conventions.
* Read relevant existing code before implementing something.
* Keep solutions simple and avoid unnecessary abstractions.
* Make the smallest reasonable change; do not modify or refactor unrelated files.
* Do not add dependencies unless necessary.
* Preserve French and English support.
* Add or update tests when behavior changes, especially business logic.

## Before finishing

For code changes:

1. Run relevant tests.
2. Run lint and typecheck.
3. Check the final diff for accidental changes.
4. Briefly report what changed, assumptions, and any unresolved requirements or remaining issues.

Never claim tests passed unless they were actually run.

## Git

* Never commit directly to `main`. Use dedicated branches for features and fixes.
* Commit frequently with small, focused commits; one logical change per commit.
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
