'use server';

import { getUserCredentialsByUsername } from '../../db/queries/users';
import { validateLogin, type LoginFieldErrors } from '../../lib/login-validation';
import { verifyPassword } from '../../lib/password';
import { createSession } from '../../lib/session';

/**
 * Server action behind the `/login` form.
 *
 * It is the single, server-authoritative entry point: it validates the raw
 * `FormData` (never trusting the client), looks up the stored hash, verifies the
 * password, and writes a signed session cookie. It returns a serializable result
 * the client can render directly — no password hash or database row ever leaves
 * this function.
 *
 * A wrong username and a wrong password both report `invalidCredentials`, so the
 * response never reveals whether an account exists.
 */

export type LoginFormError = 'invalidCredentials' | 'unexpected';

export type LoginResult =
  | { ok: true }
  | { ok: false; fieldErrors: LoginFieldErrors; formError?: LoginFormError };

export async function loginUser(
  _prevState: LoginResult | null,
  formData: FormData,
): Promise<LoginResult> {
  const username = readField(formData, 'username');
  const password = readField(formData, 'password');
  const remember = formData.get('remember_scribe') === 'on';

  const validation = validateLogin({ username, password });
  if (Object.keys(validation.fieldErrors).length > 0) {
    return { ok: false, fieldErrors: validation.fieldErrors };
  }

  let credentials;
  try {
    credentials = await getUserCredentialsByUsername(validation.username);
  } catch (error) {
    console.error('loginUser: failed to look up the account', error);
    return { ok: false, fieldErrors: {}, formError: 'unexpected' };
  }

  if (!credentials) {
    return { ok: false, fieldErrors: {}, formError: 'invalidCredentials' };
  }

  // OAuth-only accounts have no password; report the same error as a wrong
  // password so the response never reveals how the account was created.
  if (credentials.passwordHash === null) {
    return { ok: false, fieldErrors: {}, formError: 'invalidCredentials' };
  }

  let passwordMatches;
  try {
    passwordMatches = await verifyPassword(password, credentials.passwordHash);
  } catch (error) {
    console.error('loginUser: failed to verify the password', error);
    return { ok: false, fieldErrors: {}, formError: 'unexpected' };
  }

  if (!passwordMatches) {
    return { ok: false, fieldErrors: {}, formError: 'invalidCredentials' };
  }

  try {
    await createSession(
      { publicId: credentials.publicId, username: credentials.username },
      { remember },
    );
  } catch (error) {
    console.error('loginUser: failed to create the session', error);
    return { ok: false, fieldErrors: {}, formError: 'unexpected' };
  }

  return { ok: true };
}

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}
