# Authentication & Registration

Status: **registration is implemented end-to-end**; login is still a mock form
(no session/verification yet). This document records the decisions a future
agent must preserve or consciously change when adding login and sessions.

## Registration flow

The `/register` form posts to a single server action,
[`src/app/register/actions.ts`](../src/app/register/actions.ts) — the only
authoritative entry point. It never trusts the client:

1. Reads `username`, `password`, `confirmPassword` from the raw `FormData`.
2. Validates them with the pure function `validateRegistration`
   ([`src/lib/register-validation.ts`](../src/lib/register-validation.ts)),
   which returns the trimmed name plus a map of field errors.
3. Hashes the password (see below).
4. Calls `createUserWithProfiles` in one transaction (user + stats + resources),
   with `pfpUrl: null` — the profile picture stays `NULL` until a future
   profile screen lets the user set it.
5. Maps a database unique-violation on `username` to a friendly "name taken"
   field error, and anything unexpected to a generic form error.

The action returns a serializable `RegisterResult`
(`{ ok: true }` or `{ ok: false, fieldErrors, formError? }`); no database row
ever leaves the function. The client (`RegisterForm.jsx`) renders each field
error under its input and redirects to `/login` on success.

## Name rules

The `username` column stores the **display name**, not a URL slug (this was the
original intent and is now outdated — see [`doc/database.md`](database.md)):

* Leading/trailing whitespace is trimmed.
* It may contain internal spaces, but must not be empty or all whitespace.
* It must be at most 32 characters (a database `varchar(32)`).
* It must be unique. Uniqueness is enforced by the `users_username_unique`
  database constraint; `createUserWithProfiles` catches PostgreSQL error
  `23505` and rethrows it as `UsernameTakenError`.

## Password hashing — scrypt (decision for future agents)

Passwords are hashed with **scrypt** (RFC 7914) via Node's built-in
`crypto.scrypt` — see [`src/lib/password.ts`](../src/lib/password.ts).

**Why scrypt over bcrypt or Argon2id:**

* scrypt is deliberately **memory-hard** (`128 * N * r` bytes of scratch
  memory), so GPU/ASIC cracking stays expensive, the same property Argon2id is
  praised for.
* It ships **inside Node.js** (`node:crypto`), so there is **no native
  dependency** and no build fragility. Argon2id would require a native addon
  (`argon2` / `@node-rs/argon2`); for a typing game that marginal gain does not
  justify the extra dependency ([AGENTS.md](../AGENTS.md): avoid unnecessary
  dependencies).
* scrypt is approved by NIST (SP 800-132) and listed as acceptable by OWASP.

**Parameters:**

| Parameter | Value | Notes |
| --------- | ----- | ----- |
| `N`       | `2^15` (32768) | CPU/memory cost → 32 MiB scratch |
| `r`       | `8` | block size |
| `p`       | `1` | kept at 1 (parallel hashing multiplies memory) |
| `keylen`  | `64` bytes | |
| salt      | `16` random bytes per password | `crypto.randomBytes` |
| `maxmem`  | `64 MiB` | headroom above the 32 MiB actually needed |

**Storage format** (self-describing, so parameters can be raised later without
breaking existing hashes):

```
scrypt$N$r$p$<salt base64>$<hash base64>
```

`verifyPassword` (already written for the future login flow) re-derives with the
recorded parameters and compares with `timingSafeEqual`. **To migrate to
Argon2id later**, only `deriveKey` and the format prefix need to change; the
`$`-delimited envelope stays.

## Password policy ("good entropy")

A password is accepted only when, per `passwordIssues`:

* length is **12–128** characters;
* it uses at least **2 of 4** character classes (lowercase, uppercase, digit,
  other — the "other" class includes spaces and symbols); and
* its **Shannon entropy is ≥ 40 bits** over its character distribution.

The 2-class floor rejects single-class strings (e.g. `abcdefghijkl`) without
penalising long passphrases like `correct horse battery staple`. The entropy
floor rejects repeated/low-variety strings (e.g. `a1a1a1a1a1a1`).

**Known limitation:** Shannon entropy is a distribution proxy, not a
guessability model — it cannot tell `password123!` is a common password. The
natural upgrade is a common-password blocklist (Have I Been Pwned) or `zxcvbn`,
deliberately omitted now to avoid a dependency. A future agent adding login
should add this.

## Field error codes

`validateRegistration` and the action use these stable codes; the client maps
them to display strings in
[`src/data/registerData.js`](../src/data/registerData.js) (English only — the
i18n layer referenced in AGENTS.md is not built yet).

| Field | Codes |
| ----- | ----- |
| `username` | `required`, `usernameTooLong`, `usernameTaken` |
| `password` | `required`, `passwordTooShort`, `passwordTooLong`, `passwordWeak` |
| `confirmPassword` | `required`, `passwordsDoNotMatch` |
| form-level | `unexpected` |

## Tests

* [`src/lib/password.test.ts`](../src/lib/password.test.ts) — real scrypt
  hash/verify round-trips and the policy rules.
* [`src/lib/register-validation.test.ts`](../src/lib/register-validation.test.ts)
  — trimming, length, mismatch and policy mapping.
* [`src/db/queries/users.test.ts`](../src/db/queries/users.test.ts) — the
  `23505` → `UsernameTakenError` mapping.
* [`src/components/register/RegisterForm.test.jsx`](../src/components/register/RegisterForm.test.jsx)
  — the client renders each field error under its input (action is mocked).
