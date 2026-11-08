import { z } from 'zod';

/**
 * Pure validation for the login form, driven by a Zod schema. It returns the
 * trimmed username and a map of field errors keyed by the form field name; it
 * never touches the database, so credential checking (`invalidCredentials`) is
 * reported by the calling server action after the lookup instead of here.
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

/**
 * The login shape rules. The username is trimmed; the password is deliberately
 * not (it is compared verbatim). Issue messages carry the field error codes
 * the form renders, so callers can map failures without re-implementing the
 * rules.
 */
export const loginInputSchema = z.object({
  username: z.string().trim().min(1, { error: 'required' }),
  password: z.string().min(1, { error: 'required' }),
});

export function validateLogin(input: LoginInput): LoginValidation {
  const username = input.username.trim();
  const parsed = loginInputSchema.safeParse(input);

  return {
    username,
    fieldErrors: parsed.success ? {} : loginFieldErrors(parsed.error.issues),
  };
}

/** Maps schema issues to the field error map the login form renders. */
export function loginFieldErrors(issues: readonly z.ZodIssue[]): LoginFieldErrors {
  const fieldErrors: LoginFieldErrors = {};

  for (const issue of issues) {
    const field = issue.path[0];
    if (field === 'username' || field === 'password') {
      fieldErrors[field] = 'required';
    }
  }

  return fieldErrors;
}
