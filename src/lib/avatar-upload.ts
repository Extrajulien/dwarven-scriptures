import { z } from 'zod';

/**
 * Pure avatar-upload validation (AUTH-04, SEC-01/02).
 *
 * SEC-02 requires uploads to be validated server-side: the real file type and
 * the size. The client's declared MIME type, the file extension and the
 * `File.type` property are all attacker-controlled and are therefore never
 * trusted: the type is decided by the file's **magic bytes**, detected from
 * the buffer the server already received. Size is enforced against the
 * `File.size` metadata **before** the buffer is read, so an oversized upload
 * costs the server no memory copy.
 *
 * Nothing here touches the database or the session — the server action in
 * `src/app/account/actions.ts` orchestrates those steps around these rules.
 */

/** Maximum accepted avatar size (AUTH-04: 2 Mo). */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Content types the app stores and serves. */
export const AVATAR_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];

/** Name of the FormData field carrying the file. */
export const AVATAR_FORM_FIELD = 'avatar';

/** Typed upload failure codes, mapped to localized messages by the UI. */
export type AvatarUploadErrorCode =
  | 'missingFile'
  | 'emptyFile'
  | 'fileTooLarge'
  | 'unsupportedType';

export class AvatarUploadError extends Error {
  constructor(readonly code: AvatarUploadErrorCode) {
    super(`avatar upload rejected: ${code}`);
    this.name = 'AvatarUploadError';
  }
}

/**
 * Zod schema for the raw FormData entry: exactly one value, and that value
 * must be a `File` instance (TECH-07 — every server-side input is validated
 * by a Zod schema before use). Size and real type are checked separately by
 * `assertAvatarFileSize` / `detectAvatarContentType`, on purpose:
 * `.mime()`-style checks would only re-validate the attacker-controlled
 * declared type.
 */
export const avatarFileEntrySchema = z.array(z.instanceof(File)).length(1);

/** Reads the single `avatar` entry from the FormData, or `null` when absent/invalid. */
export function readAvatarFileEntry(formData: FormData): File | null {
  const parsed = avatarFileEntrySchema.safeParse(formData.getAll(AVATAR_FORM_FIELD));
  return parsed.success ? parsed.data[0] : null;
}

/**
 * Enforces the AUTH-04 size constraints from `File.size` metadata only — no
 * buffer is read here, so an oversized upload costs the server no memory
 * copy. The real type is then decided from the decoded bytes by
 * `detectAvatarContentType`, so a renamed `.png` full of HTML is rejected no
 * matter what its name or declared MIME says.
 */
export function assertAvatarFileSize(file: File): void {
  if (file.size === 0) {
    throw new AvatarUploadError('emptyFile');
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new AvatarUploadError('fileTooLarge');
  }
}

/** Detected content type is decided from the decoded bytes, not the name. */
export function detectAvatarContentType(bytes: Uint8Array): AvatarContentType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  // WebP: 'RIFF' + 4-byte little-endian size + 'WEBP'.
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * URL the stored avatar is served and cached under (AUTH-04). The `v`
 * parameter carries the upload instant so re-uploading always yields a fresh
 * URL that bypasses the browser's cached copy, while the route handler still
 * answers with `Cache-Control: private, max-age=300`.
 */
export function buildAvatarUrl(publicId: string, updatedAt: Date): string {
  return `/api/avatar/${publicId}?v=${updatedAt.getTime()}`;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) {
      return false;
    }
  }
  return true;
}
