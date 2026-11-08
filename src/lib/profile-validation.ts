import { z } from 'zod';
import { usernameSchema } from './register-validation';

/**
 * Pure validation for the profile edit modal, driven by Zod schemas. It mirrors
 * the username rules the registration form enforces (trimmed, non-empty,
 * ≤ 32 chars) but is scoped to the account-edit fields; uniqueness is reported
 * by the server action after the update, exactly like registration.
 */

export type UsernameFieldError = 'required' | 'usernameTooLong';
export type AvatarUrlFieldError = 'invalidUrl';

const USERNAME_FIELD_ERRORS: readonly UsernameFieldError[] = ['required', 'usernameTooLong'];

/**
 * An avatar is either empty (clears `pfpUrl` back to `NULL`, restoring the
 * fallback icon) or a valid http(s) URL. The schema trims the input and
 * produces `null` for the empty case, so callers can persist the value as-is.
 */
export const avatarUrlSchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .pipe(z.union([z.null(), z.url({ protocol: /^https?$/ })]));

export function validateUsername(
  value: string,
): { username: string; error?: UsernameFieldError } {
  const username = value.trim();
  const parsed = usernameSchema.safeParse(value);

  if (parsed.success) {
    return { username };
  }

  const error = parsed.error.issues
    .map((issue) => issue.message)
    .find(isUsernameFieldError);
  return { username, error: error ?? 'required' };
}

function isUsernameFieldError(value: string): value is UsernameFieldError {
  return (USERNAME_FIELD_ERRORS as readonly string[]).includes(value);
}

/**
 * An avatar is either empty (clears `pfpUrl` back to `NULL`, restoring the
 * fallback icon) or a valid http(s) URL.
 */
export function validateAvatarUrl(
  value: string,
): { pfpUrl: string | null; error?: AvatarUrlFieldError } {
  const parsed = avatarUrlSchema.safeParse(value);

  if (parsed.success) {
    return { pfpUrl: parsed.data };
  }
  return { pfpUrl: null, error: 'invalidUrl' };
}
