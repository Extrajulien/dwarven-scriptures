'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { unlinkOAuthAccount } from '../../db/queries/oauth-accounts';
import { getUserFullProfile, updateUserProfile, UsernameTakenError } from '../../db/queries/users';
import { oauthProviderSchema } from '../../lib/oauth-validation';
import { avatarUrlSchema, usernameError, usernameSchema } from '../../lib/profile-validation';
import { deleteSession, getSession } from '../../lib/session';

/**
 * Logs the user out by deleting the session cookie, then returns to the login
 * screen. This is the caller `deleteSession` was written for.
 */
export async function logout(): Promise<void> {
  await deleteSession();
  redirect('/login');
}

export type UpdateProfileFieldErrors = {
  username?: 'required' | 'usernameTooLong' | 'usernameTaken';
  pfpUrl?: 'invalidUrl';
};

export type UpdateProfileResult =
  | { ok: true }
  | {
      ok: false;
      fieldErrors: UpdateProfileFieldErrors;
      formError?: 'unauthenticated' | 'unexpected';
    };

/**
 * Persists the editable account fields from the profile modal. The user is
 * re-derived from the session (never a client id) and the username is validated
 * exactly like registration before the write.
 */
export async function updateProfile(
  _prevState: UpdateProfileResult | null,
  formData: FormData,
): Promise<UpdateProfileResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, fieldErrors: {}, formError: 'unauthenticated' };
  }

  const profile = await getUserFullProfile({ publicId: session.publicId }).catch(() => null);
  if (!profile) {
    return { ok: false, fieldErrors: {}, formError: 'unauthenticated' };
  }

  const usernameParsed = usernameSchema.safeParse(readField(formData, 'username'));
  const avatarParsed = avatarUrlSchema.safeParse(readField(formData, 'pfpUrl'));

  if (!usernameParsed.success || !avatarParsed.success) {
    const fieldErrors: UpdateProfileFieldErrors = {};
    if (!usernameParsed.success) {
      fieldErrors.username = usernameError(usernameParsed.error.issues);
    }
    if (!avatarParsed.success) {
      fieldErrors.pfpUrl = 'invalidUrl';
    }
    return { ok: false, fieldErrors };
  }

  try {
    await updateUserProfile(profile.id, {
      username: usernameParsed.data,
      pfpUrl: avatarParsed.data,
    });
  } catch (error) {
    if (error instanceof UsernameTakenError) {
      return { ok: false, fieldErrors: { username: 'usernameTaken' } };
    }
    console.error('updateProfile: failed to update the account', error);
    return { ok: false, fieldErrors: {}, formError: 'unexpected' };
  }

  revalidatePath('/account');
  return { ok: true };
}

/**
 * Removes a linked OAuth provider. Called from the modal's disconnect button;
 * the provider is asserted against the known set before the delete.
 */
export async function unlinkAccount(provider: string): Promise<void> {
  const providerParsed = oauthProviderSchema.safeParse(provider);
  if (!providerParsed.success) {
    return;
  }

  const session = await getSession();
  if (!session) {
    return;
  }

  const profile = await getUserFullProfile({ publicId: session.publicId }).catch(() => null);
  if (!profile) {
    return;
  }

  await unlinkOAuthAccount(profile.id, providerParsed.data);
  revalidatePath('/account');
}

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}
