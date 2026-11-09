'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { storeUserAvatar } from '../../db/queries/avatars';
import { unlinkOAuthAccount } from '../../db/queries/oauth-accounts';
import { getUserFullProfile, updateUserProfile, UsernameTakenError } from '../../db/queries/users';
import {
  assertAvatarFileSize,
  AvatarUploadError,
  detectAvatarContentType,
  readAvatarFileEntry,
  type AvatarUploadErrorCode,
} from '../../lib/avatar-upload';
import { oauthProviderSchema } from '../../lib/oauth-validation';
import { avatarUrlSchema, usernameError, usernameSchema } from '../../lib/profile-validation';
import { avatarUploadLimiter, RateLimitExceededError } from '../../lib/rate-limit';
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

export type UploadAvatarResult =
  | { ok: true; pfpUrl: string }
  | { ok: false; error: AvatarUploadErrorCode | 'unauthenticated' | 'rateLimited' | 'unexpected' };

/**
 * Stores an uploaded profile picture (AUTH-04, SEC-01/02).
 *
 * Order of the server-side checks, deliberately:
 * 1. session required — guests have a generated rune avatar instead (AUTH-03);
 * 2. rate limit, keyed by the session `publicId` (5/min, SEC-01);
 * 3. Zod: exactly one `avatar` FormData entry and it is a `File`;
 * 4. size ≤ 2 MB checked from `File.size` **before** the buffer is read;
 * 5. real type decided by magic bytes from the buffer — the client's MIME
 *    type, `File.type` and the file extension are never trusted (SEC-02).
 *
 * Only then are the bytes upserted (transactionally, together with the
 * `users.pfpUrl` pointer) into PostgreSQL — the Railway filesystem is
 * ephemeral, so the binary belongs in the database (TECH-08).
 */
export async function uploadAvatar(formData: FormData): Promise<UploadAvatarResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, error: 'unauthenticated' };
  }

  try {
    avatarUploadLimiter.check(`avatar:${session.publicId}`);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return { ok: false, error: 'rateLimited' };
    }
    throw error;
  }

  const file = readAvatarFileEntry(formData);
  if (!file) {
    return { ok: false, error: 'missingFile' };
  }

  try {
    assertAvatarFileSize(file);
  } catch (error) {
    if (error instanceof AvatarUploadError) {
      return { ok: false, error: error.code };
    }
    throw error;
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    console.error('uploadAvatar: failed to read the file buffer', error);
    return { ok: false, error: 'unexpected' };
  }

  const contentType = detectAvatarContentType(bytes);
  if (!contentType) {
    return { ok: false, error: 'unsupportedType' };
  }

  const profile = await getUserFullProfile({ publicId: session.publicId }).catch(() => null);
  if (!profile) {
    return { ok: false, error: 'unauthenticated' };
  }

  try {
    const { pfpUrl } = await storeUserAvatar(profile.id, profile.publicId, {
      contentType,
      bytes,
    });
    revalidatePath('/account');
    return { ok: true, pfpUrl };
  } catch (error) {
    console.error('uploadAvatar: failed to store the avatar', error);
    return { ok: false, error: 'unexpected' };
  }
}
