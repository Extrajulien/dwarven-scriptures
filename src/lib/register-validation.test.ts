import { validateRegistration } from './register-validation';

const strongPassword = 'Tr0ub4dor&3x!';

describe('validateRegistration', () => {
  test('trims the name and accepts a fully valid submission', () => {
    const result = validateRegistration({
      username: '  Joe Mama  ',
      password: strongPassword,
      confirmPassword: strongPassword,
    });

    expect(result.username).toBe('Joe Mama');
    expect(result.fieldErrors).toEqual({});
  });

  test('rejects an empty name (including whitespace only)', () => {
    expect(
      validateRegistration({
        username: '   ',
        password: strongPassword,
        confirmPassword: strongPassword,
      }).fieldErrors.username,
    ).toBe('required');
  });

  test('rejects a name longer than 32 characters after trimming', () => {
    expect(
      validateRegistration({
        username: 'a'.repeat(33),
        password: strongPassword,
        confirmPassword: strongPassword,
      }).fieldErrors.username,
    ).toBe('usernameTooLong');
  });

  test('accepts a name with internal spaces and trims the ends', () => {
    const result = validateRegistration({
      username: '  Ada Lovelace  ',
      password: strongPassword,
      confirmPassword: strongPassword,
    });

    expect(result.username).toBe('Ada Lovelace');
    expect(result.fieldErrors).toEqual({});
  });

  test('requires a password', () => {
    expect(
      validateRegistration({ username: 'x', password: '', confirmPassword: '' }).fieldErrors
        .password,
    ).toBe('required');
  });

  test('flags a too-short password', () => {
    expect(
      validateRegistration({ username: 'x', password: 'short', confirmPassword: 'short' })
        .fieldErrors.password,
    ).toBe('passwordTooShort');
  });

  test('flags a weak password', () => {
    expect(
      validateRegistration({
        username: 'x',
        password: 'a1a1a1a1a1a1',
        confirmPassword: 'a1a1a1a1a1a1',
      }).fieldErrors.password,
    ).toBe('passwordWeak');
  });

  test('requires a confirmation', () => {
    expect(
      validateRegistration({ username: 'x', password: strongPassword, confirmPassword: '' })
        .fieldErrors.confirmPassword,
    ).toBe('required');
  });

  test('flags a mismatched confirmation', () => {
    expect(
      validateRegistration({
        username: 'x',
        password: strongPassword,
        confirmPassword: 'Different!1',
      }).fieldErrors.confirmPassword,
    ).toBe('passwordsDoNotMatch');
  });

  test('does not flag a mismatch when the password itself is empty', () => {
    const result = validateRegistration({ username: 'x', password: '', confirmPassword: 'abc' });

    expect(result.fieldErrors.password).toBe('required');
    expect(result.fieldErrors.confirmPassword).toBeUndefined();
  });

  test('reports several field errors at once', () => {
    const result = validateRegistration({ username: '   ', password: 'short', confirmPassword: 'x' });

    expect(result.fieldErrors.username).toBe('required');
    expect(result.fieldErrors.password).toBe('passwordTooShort');
    expect(result.fieldErrors.confirmPassword).toBe('passwordsDoNotMatch');
  });
});
