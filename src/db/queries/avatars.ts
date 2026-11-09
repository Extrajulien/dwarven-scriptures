import { eq } from 'drizzle-orm';
import { db } from '..';
import { userAvatars, users } from '../schema';
import { buildAvatarUrl, type AvatarContentType } from '../../lib/avatar-upload';

/**
 * Data access for uploaded avatars (AUTH-04). The binary lives in
 * `user_avatars` while `users.pfpUrl` only ever holds the serving route, so
 * the write is one transaction: a new avatar row and the matching `pfpUrl`
 * commit together — the app can never point at a route that has no bytes
 * (and the `v` query carries the exact upload instant).
 */

export class InvalidAvatarInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAvatarInputError';
  }
}

const MAX_STORED_BYTES = 2 * 1024 * 1024;

export type StoredAvatar = {
  contentType: string;
  bytes: Buffer;
  updatedAt: Date;
};

/**
 * Replaces (or creates) the avatar row for a user and points `users.pfpUrl`
 * at the serving route, atomically. Returns the URL the account page must
 * render; the same `now` seeds `updatedAt` and the `v` parameter, so the
 * route's ETag and the URL version always agree.
 */
export async function storeUserAvatar(
  internalUserId: number,
  publicId: string,
  data: { contentType: AvatarContentType; bytes: Uint8Array },
): Promise<{ pfpUrl: string; updatedAt: Date }> {
  if (!Number.isSafeInteger(internalUserId) || internalUserId <= 0) {
    throw new InvalidAvatarInputError('internalUserId must be a positive integer');
  }
  if (typeof publicId !== 'string' || publicId.length === 0) {
    throw new InvalidAvatarInputError('publicId must be a non-empty string');
  }
  if (data.bytes.length === 0) {
    throw new InvalidAvatarInputError('bytes must not be empty');
  }
  if (data.bytes.length > MAX_STORED_BYTES) {
    throw new InvalidAvatarInputError(`bytes must not exceed ${MAX_STORED_BYTES} bytes`);
  }

  const now = new Date();
  const pfpUrl = buildAvatarUrl(publicId, now);

  await db.transaction(async (tx) => {
    await tx
      .insert(userAvatars)
      .values({
        userId: internalUserId,
        contentType: data.contentType,
        bytes: Buffer.from(data.bytes),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userAvatars.userId,
        set: {
          contentType: data.contentType,
          bytes: Buffer.from(data.bytes),
          updatedAt: now,
        },
      });

    await tx.update(users).set({ pfpUrl }).where(eq(users.id, internalUserId));
  });

  return { pfpUrl, updatedAt: now };
}

/**
 * Loads the stored avatar for a user **by public id** — the route handler
 * receives the id from the URL, and internal ids must never reach a route
 * (AGENTS.md). Returns `null` when the user has no avatar row, so the
 * handler can answer 404.
 */
export async function getAvatarByPublicId(publicId: string): Promise<StoredAvatar | null> {
  const rows = await db
    .select({
      contentType: userAvatars.contentType,
      bytes: userAvatars.bytes,
      updatedAt: userAvatars.updatedAt,
    })
    .from(userAvatars)
    .innerJoin(users, eq(users.id, userAvatars.userId))
    .where(eq(users.publicId, publicId))
    .limit(1);

  return rows[0] ?? null;
}
