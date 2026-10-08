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
