/**
 * @jest-environment node
 *
 * Unit tests for password hashing and the entropy policy. Hashing runs the real
 * Node `crypto.scrypt` implementation so the tests exercise the actual
 * derivation, not a mock.
 */

import {
  hashPassword,
  passwordIssues,
  passwordStrength,
  passwordStrengthScore,
  shannonEntropyBits,
  verifyPassword,
} from './password';

describe('hashPassword / verifyPassword', () => {
  test('hashes a password into a self-describing scrypt string', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(hash).not.toContain('correct horse battery staple');
  });

  test('verifies the correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');

    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  test('uses a fresh random salt per call', async () => {
    const first = await hashPassword('same password');
    const second = await hashPassword('same password');

    expect(first).not.toBe(second);
    await expect(verifyPassword('same password', first)).resolves.toBe(true);
    await expect(verifyPassword('same password', second)).resolves.toBe(true);
  });

  test('rejects malformed stored hashes', async () => {
    await expect(verifyPassword('anything', 'plaintext')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'scrypt$bad$r$p$salt$hash')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'scrypt$32768$8$1$not-base64$hash')).resolves.toBe(false);
  });
});

describe('shannonEntropyBits', () => {
  test('is zero for a single repeated character', () => {
    expect(shannonEntropyBits('aaaaaaaaaaaa')).toBe(0);
  });

  test('grows with the number of distinct characters', () => {
    const uniform = shannonEntropyBits('abcdefghijklmnopqrstuvwxyz');
    expect(uniform).toBeCloseTo(26 * Math.log2(26), 5);
  });
});

describe('passwordIssues', () => {
  test('accepts a strong password', () => {
    expect(passwordIssues('Tr0ub4dor&3x!')).toEqual([]);
    expect(passwordIssues('correct horse battery staple')).toEqual([]);
  });

  test('flags a too-short password', () => {
    expect(passwordIssues('a'.repeat(11))).toEqual(['tooShort', 'tooWeak']);
  });

  test('flags a single-class password even at a valid length', () => {
    // 12 lowercase letters: entropy is fine but character variety is not.
    expect(passwordIssues('abcdefghijkl')).toEqual(['tooWeak']);
  });

  test('flags a repetitive password even with mixed classes', () => {
    expect(passwordIssues('aA1!aA1!aA1!')).toEqual(['tooWeak']);
  });

  test('flags a too-long password', () => {
    const long = 'aA1!'.repeat(32) + 'a';
    expect(long.length).toBeGreaterThan(128);
    expect(passwordIssues(long)).toEqual(['tooLong']);
  });
});

describe('passwordStrength', () => {
  test('is empty when there is no input', () => {
    expect(passwordStrength('')).toBe('empty');
  });

  test('is weak before the minimum policy is met', () => {
    expect(passwordStrength('short')).toBe('weak');
    expect(passwordStrength('abcdefghijkl')).toBe('weak'); // single class
    expect(passwordStrength('aA1!aA1!aA1!')).toBe('weak'); // repetitive
  });

  test('is acceptable once the minimum policy is met', () => {
    expect(passwordStrength('Tr0ub4dor&3x!')).toBe('acceptable');
    // Two classes and long enough to be valid, but not the "super safe" tier.
    expect(passwordStrength('abcdefgh12345678')).toBe('acceptable');
  });

  test('is strong for a shorter but richly varied password', () => {
    expect(passwordStrength('Ab3!Cd4@Ef5#Gh6$')).toBe('strong');
  });

  test('is strong for a long, varied passphrase', () => {
    expect(passwordStrength('correct horse battery staple')).toBe('strong');
  });
});

describe('passwordStrengthScore', () => {
  test('is zero for empty input', () => {
    expect(passwordStrengthScore('')).toBe(0);
  });

  test('stays in the red band (1–49) while non-compliant', () => {
    expect(passwordStrengthScore('short')).toBeGreaterThan(0);
    expect(passwordStrengthScore('short')).toBeLessThan(50);
    expect(passwordStrengthScore('abcdefghijkl')).toBeLessThan(50);
    expect(passwordStrengthScore('aA1!aA1!aA1!')).toBeLessThan(50);
  });

  test('lands in the yellow band (50–79) once compliant', () => {
    const score = passwordStrengthScore('Tr0ub4dor&3x!');
    expect(score).toBeGreaterThanOrEqual(50);
    expect(score).toBeLessThan(80);
  });

  test('lands in the green band (80–100) once strong', () => {
    expect(passwordStrengthScore('Ab3!Cd4@Ef5#Gh6$')).toBeGreaterThanOrEqual(80);
    expect(passwordStrengthScore('correct horse battery staple')).toBeGreaterThanOrEqual(80);
  });

  test('reaches 100 for a maximally varied password', () => {
    expect(passwordStrengthScore('Ab1!Cd2@Ef3#Gh4$Ij5%Kl6^Mn7&Op8*')).toBe(100);
  });
});
