import { validateLogin } from './login-validation';

describe('validateLogin', () => {
  test('trims the username and accepts a fully present submission', () => {
    const result = validateLogin({ username: '  Joe Mama  ', password: 'secret' });

    expect(result.username).toBe('Joe Mama');
    expect(result.fieldErrors).toEqual({});
  });

  test('rejects an empty username (including whitespace only)', () => {
    expect(
      validateLogin({ username: '   ', password: 'secret' }).fieldErrors.username,
    ).toBe('required');
  });

  test('rejects an empty password', () => {
    expect(validateLogin({ username: 'ada', password: '' }).fieldErrors.password).toBe(
      'required',
    );
  });

  test('does not trim the password', () => {
    const result = validateLogin({ username: 'ada', password: '  spaced  ' });

    expect(result.fieldErrors).toEqual({});
    expect(result.username).toBe('ada');
  });

  test('reports both field errors at once', () => {
    const result = validateLogin({ username: '  ', password: '' });

    expect(result.fieldErrors.username).toBe('required');
    expect(result.fieldErrors.password).toBe('required');
  });
});
