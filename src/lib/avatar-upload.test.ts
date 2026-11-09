/**
 * @jest-environment node
 *
 * Unit tests for the pure avatar-upload rules (AUTH-04, SEC-02): the real
 * image type is decided by magic bytes — never by extension or declared
 * MIME — and the size is capped at 2 MB before any buffer is read.
 */

import {
  assertAvatarFileSize,
  AVATAR_MAX_BYTES,
  avatarFileEntrySchema,
  AvatarUploadError,
  buildAvatarUrl,
  detectAvatarContentType,
  readAvatarFileEntry,
} from './avatar-upload';

/** Signature-prefixed fixture for each supported format. */
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const WEBP = bytes([
  0x52, 0x49, 0x46, 0x46, // "RIFF"
  0x24, 0x00, 0x00, 0x00, // size
  0x57, 0x45, 0x42, 0x50, // "WEBP"
  0x56, 0x50, 0x38, 0x20,
]);

function bytes(values: number[]): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(values);
}

function fileOf(data: Uint8Array<ArrayBuffer> | string, name: string, type = ''): File {
  return new File([data], name, { type });
}

describe('detectAvatarContentType (magic bytes, SEC-02)', () => {
  test('accepts a JPEG by its FF D8 FF signature', () => {
    expect(detectAvatarContentType(JPEG)).toBe('image/jpeg');
  });

  test('accepts a PNG by its 89 50 4E 47 0D 0A 1A 0A signature', () => {
    expect(detectAvatarContentType(PNG)).toBe('image/png');
  });

  test('accepts a WebP by its RIFF....WEBP signature', () => {
    expect(detectAvatarContentType(WEBP)).toBe('image/webp');
  });

  test('rejects a tampered file: .png name and MIME around HTML bytes', async () => {
    const html = fileOf('<html><body>not an image</body></html>', 'avatar.png', 'image/png');
    expect(detectAvatarContentType(new Uint8Array(await html.arrayBuffer()))).toBeNull();
  });

  test('rejects a tampered extension: real JPEG bytes with a .gif name', async () => {
    // The name is never consulted — the bytes win (and gif is unsupported).
    const gifNamed = fileOf(JPEG, 'avatar.gif', 'image/gif');
    expect(detectAvatarContentType(new Uint8Array(await gifNamed.arrayBuffer()))).toBe(
      'image/jpeg',
    );
  });

  test('rejects a RIFF file that is not WEBP', () => {
    // "RIFF" + size + "WAVE" — a WAV file must not pass as a WebP.
    const wav = bytes([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
    expect(detectAvatarContentType(wav)).toBeNull();
  });

  test('rejects bytes too short to carry a signature', () => {
    expect(detectAvatarContentType(bytes([0x89, 0x50]))).toBeNull();
    expect(detectAvatarContentType(bytes([]))).toBeNull();
  });
});

describe('assertAvatarFileSize (AUTH-04: 2 MB max)', () => {
  test('accepts a file at exactly the 2 MB cap', () => {
    const atCap = fileOf(new Uint8Array(AVATAR_MAX_BYTES), 'avatar.png');
    expect(() => assertAvatarFileSize(atCap)).not.toThrow();
  });

  test('rejects an oversized file without reading its buffer', () => {
    const oversized = fileOf(new Uint8Array(AVATAR_MAX_BYTES + 1), 'avatar.png');
    expect(() => assertAvatarFileSize(oversized)).toThrow(AvatarUploadError);
    try {
      assertAvatarFileSize(oversized);
    } catch (error) {
      expect((error as AvatarUploadError).code).toBe('fileTooLarge');
    }
  });

  test('rejects an empty file', () => {
    const empty = fileOf(new Uint8Array(0), 'avatar.png');
    try {
      assertAvatarFileSize(empty);
      throw new Error('expected assertAvatarFileSize to throw');
    } catch (error) {
      expect((error as AvatarUploadError).code).toBe('emptyFile');
    }
  });
});

describe('avatarFileEntrySchema / readAvatarFileEntry (TECH-07)', () => {
  test('accepts exactly one File entry', () => {
    const formData = new FormData();
    formData.append('avatar', fileOf(PNG, 'avatar.png', 'image/png'));

    const file = readAvatarFileEntry(formData);
    expect(file).toBeInstanceOf(File);
    expect(file?.size).toBe(PNG.length);
  });

  test('rejects a missing entry', () => {
    expect(readAvatarFileEntry(new FormData())).toBeNull();
  });

  test('rejects a non-File entry', () => {
    const formData = new FormData();
    formData.append('avatar', 'not a file');
    expect(readAvatarFileEntry(formData)).toBeNull();
  });

  test('rejects multiple entries', () => {
    const formData = new FormData();
    formData.append('avatar', fileOf(PNG, 'a.png'));
    formData.append('avatar', fileOf(JPEG, 'b.jpg'));
    expect(readAvatarFileEntry(formData)).toBeNull();
    expect(avatarFileEntrySchema.safeParse(formData.getAll('avatar')).success).toBe(false);
  });
});

describe('buildAvatarUrl (cache busting)', () => {
  test('builds the serving route with the upload instant as version', () => {
    const instant = new Date('2026-11-09T12:34:56.789Z');
    expect(buildAvatarUrl('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', instant)).toBe(
      '/api/avatar/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee?v=1794227696789',
    );
  });

  test('produces a different URL for each upload instant', () => {
    const first = new Date('2026-11-09T12:00:00.000Z');
    const second = new Date('2026-11-09T12:00:00.001Z');
    expect(buildAvatarUrl('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', second)).not.toBe(
      buildAvatarUrl('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', first),
    );
  });
});
