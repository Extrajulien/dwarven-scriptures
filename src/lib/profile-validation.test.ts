/**
 * @jest-environment node
 */

import { validateAvatarUrl, validateUsername } from './profile-validation';

describe('validateUsername', () => {
  test('trims and accepts a valid name', () => {
    expect(validateUsername('  ada  ')).toEqual({ username: 'ada' });
  });

  test('rejects an empty or whitespace-only name', () => {
    expect(validateUsername('   ')).toEqual({ username: '', error: 'required' });
  });

  test('rejects a name longer than 32 characters', () => {
    expect(validateUsername('a'.repeat(33))).toEqual({
      username: 'a'.repeat(33),
      error: 'usernameTooLong',
    });
  });

  test('accepts a 32-character name', () => {
    expect(validateUsername('a'.repeat(32))).toEqual({ username: 'a'.repeat(32) });
  });
});

describe('validateAvatarUrl', () => {
  test('treats an empty value as clearing the avatar', () => {
    expect(validateAvatarUrl('   ')).toEqual({ pfpUrl: null });
  });

  test('accepts an http(s) URL', () => {
    expect(validateAvatarUrl(' https://example.com/a.png ')).toEqual({
      pfpUrl: 'https://example.com/a.png',
    });
  });

  test('rejects a non-URL value', () => {
    expect(validateAvatarUrl('not a url')).toEqual({ pfpUrl: null, error: 'invalidUrl' });
  });

  test('rejects a non-http scheme', () => {
    expect(validateAvatarUrl('javascript:alert(1)')).toEqual({
      pfpUrl: null,
      error: 'invalidUrl',
    });
  });
});
