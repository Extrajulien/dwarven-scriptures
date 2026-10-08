'use server';

import { createUserWithProfiles, UsernameTakenError } from '../../db/queries/users';
import { hashPassword } from '../../lib/password';
import { validateRegistration, type RegisterFieldErrors } from '../../lib/register-validation';

/**
 * Server action behind the `/register` form.
 *
 * It is the single, server-authoritative entry point: it validates the raw
 * `FormData` (never trusting the client), hashes the password, and creates the
 * user plus its stats/resources rows in one transaction. It returns a
 * serializable result the client can render directly — no database row ever
 * leaves this function.
 */

export type RegisterResult =
  | { ok: true }
  | { ok: false; fieldErrors: RegisterFieldErrors; formError?: 'unexpected' };

export async function registerUser(
  _prevState: RegisterResult | null,
  formData: FormData,
): Promise<RegisterResult> {
  const username = readField(formData, 'username');
  const password = readField(formData, 'password');
  const confirmPassword = readField(formData, 'confirmPassword');

  const validation = validateRegistration({ username, password, confirmPassword });
  if (Object.keys(validation.fieldErrors).length > 0) {
    return { ok: false, fieldErrors: validation.fieldErrors };
  }

  const passwordHash = await hashPassword(password);

  try {
    await createUserWithProfiles({
      username: validation.username,
      passwordHash,
      pfpUrl: null, // stays NULL until the profile screen lets a user set it
    });
  } catch (error) {
    if (error instanceof UsernameTakenError) {
      return { ok: false, fieldErrors: { username: 'usernameTaken' } };
    }

    console.error('registerUser: failed to create the account', error);
    return { ok: false, fieldErrors: {}, formError: 'unexpected' };
  }

  return { ok: true };
}

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}
