import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'crypto';

/**
 * Password hashing and policy.
 *
 * ## Hashing algorithm — why scrypt
 *
 * Passwords are hashed with **scrypt** (RFC 7914) through Node's built-in
 * `crypto.scrypt`, not bcrypt or Argon2id. scrypt is a deliberately
 * memory-hard key-derivation function: it requires `128 * N * r` bytes of
 * scratch memory, which keeps GPU/ASIC cracking expensive in the same way
 * Argon2id does, while requiring **no native dependency** (`crypto` ships with
 * Node). Argon2id is the only strictly "stronger" choice for this use case, but
 * it would force a native addon (`argon2` / `@node-rs/argon2`); for a typing
 * game the extra dependency is not justified by the marginal gain. scrypt is
 * approved by NIST (SP 800-132) and listed as acceptable by OWASP, so it is a
 * secure, defensible default. If we later want Argon2id, swap the `deriveKey`
 * call and keep this `$`-delimited storage format.
 *
 * Parameters (OWASP-aligned):
 * - `N = 2^15` (32768) — CPU/memory cost factor (32 MiB of scratch memory).
 * - `r = 8` — block size.
 * - `p = 1` — parallelization (kept at 1: parallel hashing multiplies memory).
 * - `keylen = 64` bytes, `salt = 16` random bytes per password.
 * - `maxmem = 64 MiB` headroom above the 32 MiB the derivation actually needs.
 *
 * The stored value is a self-describing string so parameters can be raised
 * later without breaking existing hashes:
 *
 *     scrypt$N$r$p$<salt base64>$<hash base64>
 *
 * Verification recomputes the hash with the recorded parameters and compares
 * with `timingSafeEqual`, so it leaks no timing information.
 *
 * ## Password policy ("good entropy")
 *
 * A password is accepted only when it is 12–128 characters, uses at least 2 of
 * 4 character classes (lowercase, uppercase, digit, other) **and** reaches at
 * least 40 bits of Shannon entropy over its character distribution. The
 * two-class floor rejects single-class strings without penalising long
 * passphrases (which are "good entropy" despite often being lowercase + spaces),
 * while the entropy floor rejects repeated and low-variety strings. Shannon
 * entropy is a proxy, not a guessability model — it cannot flag "password123!"
 * as a common word. A common-password blocklist (or zxcvbn) is the natural
 * future upgrade and is deliberately left out to avoid a dependency today.
 */

const SCRYPT_N = 32768; // 2^15
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCRYPT_MAX_MEM = 64 * 1024 * 1024; // 64 MiB

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
const MIN_CHARACTER_TYPES = 2;
const MIN_ENTROPY_BITS = 40;

const SCRYPT_PREFIX = 'scrypt';

function deriveKey(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

function scryptOptions(): ScryptOptions {
  return { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAX_MEM };
}

/** Hashes a plaintext password into a self-describing scrypt string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await deriveKey(password, salt, KEY_LENGTH, scryptOptions());

  return [
    SCRYPT_PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

type ParsedHash = {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  expected: Buffer;
};

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== SCRYPT_PREFIX) {
    return null;
  }

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);

  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) {
    return null;
  }
  if (N <= 1 || r <= 0 || p <= 0) {
    return null;
  }

  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (salt.length === 0 || expected.length === 0) {
    return null;
  }

  return { N, r, p, salt, expected };
}

/** Verifies a plaintext password against a stored scrypt hash string. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) {
    return false;
  }

  const options: ScryptOptions = {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
    maxmem: SCRYPT_MAX_MEM,
  };
  const actual = await deriveKey(password, parsed.salt, KEY_LENGTH, options);

  return actual.length === parsed.expected.length && timingSafeEqual(actual, parsed.expected);
}

/** The Shannon entropy of a string, in bits, over its character frequencies. */
export function shannonEntropyBits(value: string): number {
  if (value.length === 0) {
    return 0;
  }

  const frequencies = new Map<string, number>();
  for (const character of value) {
    frequencies.set(character, (frequencies.get(character) ?? 0) + 1);
  }

  let bitsPerCharacter = 0;
  for (const count of frequencies.values()) {
    const probability = count / value.length;
    bitsPerCharacter -= probability * Math.log2(probability);
  }

  return bitsPerCharacter * value.length;
}

function characterTypeCount(value: string): number {
  let types = 0;
  if (/[a-z]/.test(value)) types += 1;
  if (/[A-Z]/.test(value)) types += 1;
  if (/[0-9]/.test(value)) types += 1;
  if (/[^A-Za-z0-9]/.test(value)) types += 1;
  return types;
}

export type PasswordIssue = 'tooShort' | 'tooLong' | 'tooWeak';

/**
 * Returns every policy rule the password breaks (possibly several at once).
 * Callers surface at most one — see `validateRegistration`.
 */
export function passwordIssues(password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push('tooShort');
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    issues.push('tooLong');
  }
  if (
    characterTypeCount(password) < MIN_CHARACTER_TYPES ||
    shannonEntropyBits(password) < MIN_ENTROPY_BITS
  ) {
    issues.push('tooWeak');
  }

  return issues;
}

export type PasswordStrength = 'empty' | 'weak' | 'acceptable' | 'strong';

/**
 * The "super safe" tier sits above the minimum policy (`passwordIssues`). A
 * password is strong when it is either:
 *
 * - at least 16 characters spanning 3+ classes with ≥ 60 bits of entropy, or
 * - a long passphrase of at least 24 characters with ≥ 80 bits of entropy
 *   (which stays strong even across only two classes, e.g. lowercase + spaces).
 *
 * The passphrase clause keeps the bar from punishing long phrase-style
 * passwords that the minimum policy already accepts on purpose.
 */
const STRONG_MIN_LENGTH = 16;
const STRONG_MIN_CHARACTER_TYPES = 3;
const STRONG_MIN_ENTROPY_BITS = 60;
const STRONG_PASSPHRASE_MIN_LENGTH = 24;
const STRONG_PASSPHRASE_MIN_ENTROPY_BITS = 80;

// The "excellent" ceiling the score normalizes against: a password at these
// thresholds scores 100.
const EXCELLENT_MAX_LENGTH = STRONG_PASSPHRASE_MIN_LENGTH; // 24
const EXCELLENT_MAX_TYPES = 4;
const EXCELLENT_MAX_ENTROPY = STRONG_PASSPHRASE_MIN_ENTROPY_BITS; // 80

function isStrongPassword(password: string): boolean {
  const length = password.length;
  const types = characterTypeCount(password);
  const entropy = shannonEntropyBits(password);

  if (
    length >= STRONG_MIN_LENGTH &&
    types >= STRONG_MIN_CHARACTER_TYPES &&
    entropy >= STRONG_MIN_ENTROPY_BITS
  ) {
    return true;
  }

  return (
    length >= STRONG_PASSPHRASE_MIN_LENGTH &&
    types >= MIN_CHARACTER_TYPES &&
    entropy >= STRONG_PASSPHRASE_MIN_ENTROPY_BITS
  );
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

/** Geometric mean of three progress ratios, each already in [0, 1]. */
function geometricMean(values: readonly number[]): number {
  return Math.cbrt(values.reduce((product, value) => product * value, 1));
}

function minimumRatios(
  length: number,
  types: number,
  entropy: number,
): [number, number, number] {
  return [
    length <= PASSWORD_MAX_LENGTH ? clamp01(length / PASSWORD_MIN_LENGTH) : 0,
    clamp01(types / MIN_CHARACTER_TYPES),
    clamp01(entropy / MIN_ENTROPY_BITS),
  ];
}

function strongRatios(
  length: number,
  types: number,
  entropy: number,
): [number, number, number] {
  return [
    clamp01(length / STRONG_MIN_LENGTH),
    clamp01(types / STRONG_MIN_CHARACTER_TYPES),
    clamp01(entropy / STRONG_MIN_ENTROPY_BITS),
  ];
}

function excellentRatios(
  length: number,
  types: number,
  entropy: number,
): [number, number, number] {
  return [
    clamp01(length / EXCELLENT_MAX_LENGTH),
    clamp01(types / EXCELLENT_MAX_TYPES),
    clamp01(entropy / EXCELLENT_MAX_ENTROPY),
  ];
}

// The geometric-mean value each band starts at, so the fill width is continuous
// across the red → yellow → green colour changes.
const STRONG_GEOM_AT_MINIMUM = geometricMean([
  PASSWORD_MIN_LENGTH / STRONG_MIN_LENGTH,
  MIN_CHARACTER_TYPES / STRONG_MIN_CHARACTER_TYPES,
  MIN_ENTROPY_BITS / STRONG_MIN_ENTROPY_BITS,
]);

const EXCELLENCE_GEOM_AT_STRONG = geometricMean([
  STRONG_MIN_LENGTH / EXCELLENT_MAX_LENGTH,
  STRONG_MIN_CHARACTER_TYPES / EXCELLENT_MAX_TYPES,
  STRONG_MIN_ENTROPY_BITS / EXCELLENT_MAX_ENTROPY,
]);

/**
 * The semantic tier used by the strength bar's colour and label. It mirrors the
 * server policy exactly (via `passwordIssues` and `isStrongPassword`):
 *
 * - `empty`: no input yet.
 * - `weak`: non-empty but does not yet satisfy the minimum policy.
 * - `acceptable`: satisfies the minimum policy but not the strong tier.
 * - `strong`: satisfies the stricter "super safe" tier.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length === 0) {
    return 'empty';
  }
  if (passwordIssues(password).length > 0) {
    return 'weak';
  }
  return isStrongPassword(password) ? 'strong' : 'acceptable';
}

/**
 * A continuous 0–100 score for the strength bar's fill width. The colour bands
 * line up exactly with `passwordStrength`:
 *
 * - `0`      → empty (dark)
 * - `1–49`   → weak (red)
 * - `50–79`  → acceptable (yellow)
 * - `80–100` → strong (green)
 *
 * Within each band the score interpolates continuously, so the fill grows
 * left-to-right without jumping at the colour changes.
 */
export function passwordStrengthScore(password: string): number {
  if (password.length === 0) {
    return 0;
  }

  const length = password.length;
  const types = characterTypeCount(password);
  const entropy = shannonEntropyBits(password);

  if (passwordIssues(password).length > 0) {
    const compliance = geometricMean(minimumRatios(length, types, entropy));
    return Math.max(1, Math.round(compliance * 49));
  }

  if (isStrongPassword(password)) {
    const excellence = geometricMean(excellentRatios(length, types, entropy));
    const normalized = (excellence - EXCELLENCE_GEOM_AT_STRONG) / (1 - EXCELLENCE_GEOM_AT_STRONG);
    return 80 + Math.round(clamp01(normalized) * 20);
  }

  const progress = geometricMean(strongRatios(length, types, entropy));
  const normalized = (progress - STRONG_GEOM_AT_MINIMUM) / (1 - STRONG_GEOM_AT_MINIMUM);
  return 50 + Math.round(clamp01(normalized) * 29);
}
