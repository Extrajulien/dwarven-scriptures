/**
 * Pure validation for the login form. It returns the trimmed username and a map
 * of field errors keyed by the form field name; it never touches the database,
 * so credential checking (`invalidCredentials`) is reported by the calling
 * server action after the lookup instead of here.
 *
 * Unlike registration, login does not re-apply the password policy: an existing
 * password was already validated when the account was created, so the only rule
 * here is that both fields are present.
 */

export type LoginField = 'username' | 'password';

export type LoginFieldErrorCode = 'required';

export type LoginFieldErrors = Partial<Record<LoginField, LoginFieldErrorCode>>;

export type LoginInput = {
  username: string;
  password: string;
};

export type LoginValidation = {
  /** The username with leading/trailing whitespace trimmed. */
  username: string;
  fieldErrors: LoginFieldErrors;
};

export function validateLogin(input: LoginInput): LoginValidation {
  const username = input.username.trim();
  const fieldErrors: LoginFieldErrors = {};

  if (username.length === 0) {
    fieldErrors.username = 'required';
  }

  // The password is deliberately not trimmed: it is compared verbatim.
  if (input.password.length === 0) {
    fieldErrors.password = 'required';
  }

  return { username, fieldErrors };
}
