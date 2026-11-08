# Authentication & Registration

Status: **registration, login and GitHub/Discord OAuth are implemented
end-to-end** with a stateless signed session cookie. This document records the
decisions a future agent must preserve or consciously change when extending
authentication.

`/login` and `/register` share one route-group layout
([`src/app/(auth)/layout.tsx`](../src/app/(auth)/layout.tsx)) that renders the
cave shell and a single lean navbar (site name linking home); there is no
footer.

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

## Login flow

The `/login` form posts to a single server action,
[`src/app/login/actions.ts`](../src/app/login/actions.ts) — the only
authoritative entry point. It never trusts the client:

1. Reads `username`, `password` and `remember_scribe` from the raw `FormData`.
2. Validates them with the pure function `validateLogin`
   ([`src/lib/login-validation.ts`](../src/lib/login-validation.ts)), which
   trims the username and only requires both fields to be non-empty. The
   registration password policy is **not** re-applied: an existing password was
   already checked when the account was created.
3. Looks up the stored hash with `getUserCredentialsByUsername`
   ([`src/db/queries/users.ts`](../src/db/queries/users.ts)) and verifies it
   with `verifyPassword`.
4. On success, writes a signed session cookie (see below) and returns
   `{ ok: true }`; the client redirects to `/`.

A **wrong username and a wrong password both return the same**
`invalidCredentials` form error, so the response never reveals whether an
account exists. A database or hashing failure maps to a generic `unexpected`
form error.

## OAuth login & registration (GitHub and Discord)

GitHub and Discord sign-in is implemented end-to-end with a hand-rolled
authorization-code flow (no auth dependency), reusing the same stateless
session cookie as password login. The OAuth buttons on both `/login` and
`/register` link to `GET /api/auth/<provider>`.

The flow:

1. `GET /api/auth/<provider>` generates a CSRF `state`, stores it (plus the
   sanitized post-login `next` destination) in short-lived HttpOnly cookies
   (`oauth_state`, `oauth_next`), and redirects to the provider's authorize
   page.
2. The provider redirects back to `GET /api/auth/<provider>/callback` with
   `code` and `state`. The callback verifies the `state` (timing-safe), then
   exchanges the code for an access token and fetches the provider profile.
3. The profile is passed to `createOrLinkOAuthUser`
   ([`src/db/queries/oauth-accounts.ts`](../src/db/queries/oauth-accounts.ts)),
   which returns the existing user for a returning identity or creates one on
   first sign-in. The callback writes the session and redirects to `next`
   (default `/`).

Key decisions:

| Aspect | Value |
| ------ | ----- |
| Flow | Authorization code + CSRF `state` (no PKCE: confidential server client with a secret) |
| Scopes | GitHub `read:user`; Discord `identify` (no email) |
| Username | GitHub `login`; Discord `global_name` (fallback `username`); trimmed/truncated to 32 chars, random-suffixed on collision |
| Avatar | GitHub `avatar_url`; Discord assembled from `id` + `avatar` hash, stored as `pfpUrl` |
| Session | `createSession(..., { remember: true })` → 30-day cookie (no checkbox in the flow) |
| Failure | Any exchange/profile/db error → redirect `/login`; `state` mismatch or provider `error` → `/login` |
| Credentials | `GITHUB_CLIENT_ID/SECRET` and `DISCORD_CLIENT_ID/SECRET` environment variables (server-only) |

Provider logic lives in [`src/lib/oauth.ts`](../src/lib/oauth.ts); the route
handlers are
[`src/app/api/auth/[provider]/route.ts`](../src/app/api/auth/[provider]/route.ts)
and
[`src/app/api/auth/[provider]/callback/route.ts`](../src/app/api/auth/[provider]/callback/route.ts).

### Password-less accounts

An account created through OAuth has `passwordHash = NULL` (see
[`doc/database.md`](database.md)). Password login for such an account returns
the same `invalidCredentials` form error as a wrong password, so the response
never reveals how the account was created.

## Sessions (stateless, signed cookie)

There is no session table and no auth dependency. A session is a
`body.signature` token stored in an HttpOnly cookie, built with Node's built-in
`crypto` HMAC-SHA256 in [`src/lib/session.ts`](../src/lib/session.ts).

| Aspect | Value |
| ------ | ----- |
| Cookie name | `session` |
| Payload | `{ publicId, username, exp }` — public identifiers plus an absolute expiry in Unix seconds |
| Signature | HMAC-SHA256 over the base64url body, verified with `timingSafeEqual` |
| Lifetime | 30 days (`SESSION_TTL_SECONDS`) |
| Options | `httpOnly`, `secure` in production, `sameSite: 'lax'`, `path: '/'` |
| Remember me | checked → `maxAge` 30 days; unchecked → browser-session cookie |
| Secret | `SESSION_SECRET` environment variable (required; `openssl rand -base64 32`) |

`getSession()` reads and verifies the cookie and returns `{ publicId, username }`
or `null`; a tampered or expired token is treated as logged out. The homepage
reads the session in `src/app/page.tsx` and passes the username down to the
navbar. `deleteSession()` exists for a future logout action; it has no caller
yet.

This stateless design means sessions cannot be individually revoked server-side.
If that becomes a requirement (for example "log out all devices"), replace the
cookie with a database-backed session table (see
[`doc/database.md`](database.md)) without changing the login action's result
contract.

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

### Strength bar (client-side, advisory only)

The registration form renders a live strength meter under the password field
([`src/components/register/PasswordStrengthBar.jsx`](../src/components/register/PasswordStrengthBar.jsx))
from two pure helpers in
[`src/lib/password.ts`](../src/lib/password.ts): `passwordStrength` (the
semantic tier) and `passwordStrengthScore` (a continuous 0–100 fill width). Both
mirror the server policy and layer a stricter "super safe" tier on top.

| Tier        | Bar    | Score   | Rule |
| ----------- | ------ | ------- | ---- |
| `empty`     | dark   | 0%      | no input |
| `weak`      | red    | 1–49%   | does not yet satisfy the minimum policy (too short, too long, or too little variety) |
| `acceptable`| yellow | 50–79%  | satisfies the minimum policy (12–128 chars, 2+ classes, ≥ 40 bits) |
| `strong`    | green  | 80–100% | 16+ chars across 3+ classes with ≥ 60 bits, **or** a 24+ char passphrase with ≥ 80 bits |

The passphrase clause keeps long lowercase + spaces phrases (which the minimum
policy accepts on purpose) from being stuck at "acceptable". The fill width
interpolates continuously inside each band, so the bar grows left-to-right
without jumping at the colour changes. This meter is **advisory only** — the
server action still re-validates with `validateRegistration` and never trusts
the client's assessment. Labels live in
[`src/data/registerData.ts`](../src/data/registerData.ts) (`REGISTER_FORM.strength`),
following the same English-only placeholder convention as the field errors.

## Field error codes

`validateRegistration` and the action use these stable codes; the client maps
them to display strings in
[`src/data/registerData.ts`](../src/data/registerData.ts) (English only — the
i18n layer referenced in AGENTS.md is not built yet).

| Field | Codes |
| ----- | ----- |
| `username` | `required`, `usernameTooLong`, `usernameTaken` |
| `password` | `required`, `passwordTooShort`, `passwordTooLong`, `passwordWeak` |
| `confirmPassword` | `required`, `passwordsDoNotMatch` |
| form-level | `unexpected` |

`validateLogin` and the login action use these codes; the client maps them in
[`src/data/loginData.ts`](../src/data/loginData.ts):

| Field | Codes |
| ----- | ----- |
| `username` | `required` |
| `password` | `required` |
| form-level | `invalidCredentials`, `unexpected` |

## Tests

* [`src/lib/password.test.ts`](../src/lib/password.test.ts) — real scrypt
  hash/verify round-trips, the policy rules, and the `passwordStrength` /
  `passwordStrengthScore` tiers and bands.
* [`src/lib/register-validation.test.ts`](../src/lib/register-validation.test.ts)
  — trimming, length, mismatch and policy mapping.
* [`src/db/queries/users.test.ts`](../src/db/queries/users.test.ts) — the
  `23505` → `UsernameTakenError` mapping.
* [`src/components/register/RegisterForm.test.jsx`](../src/components/register/RegisterForm.test.jsx)
  — the client renders each field error under its input (action is mocked) and
  the strength bar turns red, then yellow, then green as the password grows
  stronger.
* [`src/lib/session.test.ts`](../src/lib/session.test.ts) — token round-trips,
  tamper/expiry/malformed/wrong-secret rejection.
* [`src/lib/login-validation.test.ts`](../src/lib/login-validation.test.ts) —
  trimming and the `required` rules.
* [`src/components/login/LoginForm.test.jsx`](../src/components/login/LoginForm.test.jsx)
  — the client renders field errors, form errors, and redirects on success.
