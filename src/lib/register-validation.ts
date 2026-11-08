import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordIssues } from './password';

/**
 * Pure validation for the registration form, driven by Zod schemas. It returns
 * the trimmed name and a map of field errors keyed by the form field name; it
 * never touches the database, so uniqueness (`usernameTaken`) is reported by
 * the calling server action after the insert instead of here.
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

/**
 * The username rules shared by registration and the profile editor: trimmed,
 * non-empty and at most `NAME_MAX_LENGTH` characters.
 */
export const usernameSchema = z
  .string()
  .trim()
  .min(1, { error: 'required' })
  .max(NAME_MAX_LENGTH, { error: 'usernameTooLong' });

/**
 * The registration shape rules. The password checks run in the exact priority
 * the form renders (`required` → too short → too long → weak); the weak check
 * reuses the pure policy in `passwordIssues` so the schema can never drift
 * from the strength meter. Issue messages carry the field error codes the
 * form renders.
 */
export const registerInputSchema = z
  .object({
    username: usernameSchema,
    password: z
      .string()
      .min(1, { error: 'required' })
      .min(PASSWORD_MIN_LENGTH, { error: 'passwordTooShort' })
      .max(PASSWORD_MAX_LENGTH, { error: 'passwordTooLong' })
      .refine((value) => passwordIssues(value).length === 0, { error: 'passwordWeak' }),
    confirmPassword: z.string().min(1, { error: 'required' }),
  })
  .refine(
    (data) => data.password.length === 0 || data.confirmPassword === data.password,
    { path: ['confirmPassword'], error: 'passwordsDoNotMatch' },
  );

const REGISTER_FIELD_ERROR_CODES: readonly RegisterFieldErrorCode[] = [
  'required',
  'usernameTooLong',
  'usernameTaken',
  'passwordTooShort',
  'passwordTooLong',
  'passwordWeak',
  'passwordsDoNotMatch',
];

function isRegisterFieldErrorCode(value: string): value is RegisterFieldErrorCode {
  return (REGISTER_FIELD_ERROR_CODES as readonly string[]).includes(value);
}

export function validateRegistration(input: RegisterInput): RegisterValidation {
  const username = input.username.trim();
  const parsed = registerInputSchema.safeParse(input);

  return {
    username,
    fieldErrors: parsed.success ? {} : registerFieldErrors(parsed.error.issues),
  };
}

/** Maps schema issues to the field error map the registration form renders. */
export function registerFieldErrors(issues: readonly z.ZodIssue[]): RegisterFieldErrors {
  const fieldErrors: RegisterFieldErrors = {};

  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field !== 'string') {
      continue;
    }
    if (field !== 'username' && field !== 'password' && field !== 'confirmPassword') {
      continue;
    }
    // One code per field, first issue wins: the schema's checks already stop
    // at the first failure per field, so the first issue is the priority error.
    if (fieldErrors[field] !== undefined) {
      continue;
    }
    if (isRegisterFieldErrorCode(issue.message)) {
      fieldErrors[field] = issue.message;
    }
  }

  return fieldErrors;
}
