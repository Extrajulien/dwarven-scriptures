import { passwordIssues } from './password';

/**
 * Pure validation for the registration form. It returns the trimmed name and a
 * map of field errors keyed by the form field name; it never touches the
 * database, so uniqueness (`usernameTaken`) is reported by the calling server
 * action after the insert instead of here.
 */

export const NAME_MAX_LENGTH = 32;

export type RegisterField = 'username' | 'password' | 'confirmPassword';

export type RegisterFieldErrorCode =
  | 'required'
  | 'usernameTooLong'
  | 'usernameTaken'
  | 'passwordTooShort'
  | 'passwordTooLong'
  | 'passwordWeak'
  | 'passwordsDoNotMatch';

export type RegisterFieldErrors = Partial<Record<RegisterField, RegisterFieldErrorCode>>;

export type RegisterInput = {
  username: string;
  password: string;
  confirmPassword: string;
};

export type RegisterValidation = {
  /** The name with leading/trailing whitespace trimmed. */
  username: string;
  fieldErrors: RegisterFieldErrors;
};

export function validateRegistration(input: RegisterInput): RegisterValidation {
  const username = input.username.trim();
  const fieldErrors: RegisterFieldErrors = {};

  if (username.length === 0) {
    fieldErrors.username = 'required';
  } else if (username.length > NAME_MAX_LENGTH) {
    fieldErrors.username = 'usernameTooLong';
  }

  if (input.password.length === 0) {
    fieldErrors.password = 'required';
  } else {
    const issues = passwordIssues(input.password);
    if (issues.includes('tooShort')) {
      fieldErrors.password = 'passwordTooShort';
    } else if (issues.includes('tooLong')) {
      fieldErrors.password = 'passwordTooLong';
    } else if (issues.includes('tooWeak')) {
      fieldErrors.password = 'passwordWeak';
    }
  }

  // The confirmation mirrors the password: it must be non-empty and equal.
  // When the password itself is empty, its own error covers the field, so we
  // do not also flag a mismatch here.
  if (input.confirmPassword.length === 0) {
    fieldErrors.confirmPassword = 'required';
  } else if (input.password.length > 0 && input.confirmPassword !== input.password) {
    fieldErrors.confirmPassword = 'passwordsDoNotMatch';
  }

  return { username, fieldErrors };
}
