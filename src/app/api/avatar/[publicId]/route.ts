import { z } from 'zod';
import { getAvatarByPublicId, type StoredAvatar } from '../../../../db/queries/avatars';

/**
 * GET /api/avatar/[publicId] — serves an uploaded profile picture from
 * PostgreSQL (AUTH-04). The route is deliberately not authenticated: an
 * avatar is a public image (it renders in race rooms for every participant),
 * and the id space is the unguessable user `publicId` UUID.
 *
 * Caching: `Cache-Control: private, max-age=300` plus an `ETag` derived from
 * the upload instant. `users.pfpUrl` carries `?v=<upload epoch ms>`, so a
 * re-upload always produces a new URL the browser fetches fresh — the
 * `?v` parameter itself is ignored here. A missing row answers 404 (rows are
 * deleted together with their user by `ON DELETE CASCADE`, so 410 is never
 * observable in practice — documented choice).
 */

export const dynamic = 'force-dynamic';

const publicIdSchema = z.string().uuid();

/** Cache the avatar privately for 5 minutes, then revalidate via ETag. */
const CACHE_CONTROL = 'private, max-age=300';

/** Small pure helper extracted so the response building is unit-testable. */
export function avatarResponse(avatar: StoredAvatar | null, ifNoneMatch: string | null): Response {
  if (!avatar) {
    return new Response('Avatar not found', { status: 404 });
  }

  const etag = `"${avatar.updatedAt.getTime()}"`;
  const headers = new Headers({
    'Cache-Control': CACHE_CONTROL,
    ETag: etag,
  });

  if (ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers });
  }

  headers.set('Content-Type', avatar.contentType);
  headers.set('Content-Length', String(avatar.bytes.length));
  // Zero-copy view over the stored Buffer's backing store. node-postgres
  // hands bytea back as a Buffer, whose `buffer` is always a plain
  // ArrayBuffer in practice; the cast only satisfies TS 5.9's
  // `ArrayBufferLike` distinction for the Web `BodyInit` type.
  const bodyBuffer = avatar.bytes.buffer.slice(
    avatar.bytes.byteOffset,
    avatar.bytes.byteOffset + avatar.bytes.byteLength,
  ) as ArrayBuffer;
  return new Response(new Uint8Array(bodyBuffer), { status: 200, headers });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
): Promise<Response> {
  const { publicId } = await context.params;

  const parsed = publicIdSchema.safeParse(publicId);
  if (!parsed.success) {
    return new Response('Invalid avatar id', { status: 400 });
  }

  const avatar = await getAvatarByPublicId(parsed.data);
  return avatarResponse(avatar, request.headers.get('if-none-match'));
}
