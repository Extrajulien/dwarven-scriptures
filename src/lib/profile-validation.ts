import { NAME_MAX_LENGTH } from './register-validation';

/**
 * Pure validation for the profile edit modal. It mirrors the username rules the
 * registration form enforces (trimmed, non-empty, ≤ 32 chars) but is scoped to
 * the account-edit fields; uniqueness is reported by the server action after
 * the update, exactly like registration.
 */

export type UsernameFieldError = 'required' | 'usernameTooLong';
export type AvatarUrlFieldError = 'invalidUrl';

export function validateUsername(
  value: string,
): { username: string; error?: UsernameFieldError } {
  const username = value.trim();

  if (username.length === 0) {
    return { username, error: 'required' };
  }
  if (username.length > NAME_MAX_LENGTH) {
    return { username, error: 'usernameTooLong' };
  }
  return { username };
}

/**
 * An avatar is either empty (clears `pfpUrl` back to `NULL`, restoring the
 * fallback icon) or a valid http(s) URL.
 */
export function validateAvatarUrl(
  value: string,
): { pfpUrl: string | null; error?: AvatarUrlFieldError } {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { pfpUrl: null };
  }
  if (!isHttpUrl(trimmed)) {
    return { pfpUrl: null, error: 'invalidUrl' };
  }
  return { pfpUrl: trimmed };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
