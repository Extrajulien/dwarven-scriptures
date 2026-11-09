/**
 * @jest-environment node
 *
 * Unit tests for `uploadAvatar` (AUTH-04, SEC-01/02): the action maps every
 * failure to a typed result instead of throwing to the client, requires a
 * session, throttles per user, checks size before reading the buffer and
 * never trusts the client's declared MIME type.
 */

import { uploadAvatar } from './actions';
import { storeUserAvatar } from '../../db/queries/avatars';
import { getUserFullProfile } from '../../db/queries/users';
import { avatarUploadLimiter, RateLimitExceededError } from '../../lib/rate-limit';
import { getSession } from '../../lib/session';

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

jest.mock('../../db/index', () => ({ db: {} }));

jest.mock('../../lib/session', () => ({ getSession: jest.fn(), deleteSession: jest.fn() }));

jest.mock('../../lib/rate-limit', () => {
  const actual = jest.requireActual('../../lib/rate-limit');
  return {
    ...actual,
    avatarUploadLimiter: { check: jest.fn() },
  };
});

jest.mock('../../db/queries/users', () => ({
  getUserFullProfile: jest.fn(),
  updateUserProfile: jest.fn(),
}));

jest.mock('../../db/queries/avatars', () => ({
  storeUserAvatar: jest.fn(),
}));

jest.mock('../../db/queries/oauth-accounts', () => ({
  unlinkOAuthAccount: jest.fn(),
}));

const getSessionMock = getSession as jest.Mock;
const profileMock = getUserFullProfile as jest.Mock;
const storeMock = storeUserAvatar as jest.Mock;
const limiterCheckMock = avatarUploadLimiter.check as jest.Mock;

const SESSION = { publicId: '11111111-1111-4111-8111-111111111111', username: 'ada' };

const PROFILE = {
  id: 7,
  publicId: SESSION.publicId,
  username: 'ada',
  pfpUrl: null,
  createdAt: new Date('2026-11-07T12:00:00Z'),
  racesCompleted: 0,
  totalWords: 0n,
  totalTimeMs: 0n,
  bestWpm: '0.00',
  wins: 0,
  correctKeystrokes: 0n,
  totalKeystrokes: 0n,
  coins: 0n,
  gems: 0,
  avgWpm: 0,
  avgAccuracy: 0,
};

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

function pngFormData(): FormData {
  const formData = new FormData();
  formData.append('avatar', new File([PNG_BYTES], 'avatar.png', { type: 'image/png' }));
  return formData;
}

beforeEach(() => {
  jest.clearAllMocks();
  getSessionMock.mockResolvedValue(SESSION);
  profileMock.mockResolvedValue(PROFILE);
  storeMock.mockResolvedValue({
    pfpUrl: `/api/avatar/${SESSION.publicId}?v=1768170896789`,
    updatedAt: new Date('2026-11-09T12:34:56.789Z'),
  });
  limiterCheckMock.mockImplementation(() => undefined);
});

describe('uploadAvatar (AUTH-04, SEC-01/02)', () => {
  test('refuses guests and anonymous callers (AUTH-04 auth required)', async () => {
    getSessionMock.mockResolvedValue(null);

    await expect(uploadAvatar(pngFormData())).resolves.toEqual({
      ok: false,
      error: 'unauthenticated',
    });
    expect(storeMock).not.toHaveBeenCalled();
  });

  test('stores a magic-byte-valid PNG and returns the new pfpUrl', async () => {
    const result = await uploadAvatar(pngFormData());

    expect(result).toEqual({
      ok: true,
      pfpUrl: `/api/avatar/${SESSION.publicId}?v=1768170896789`,
    });
    expect(storeMock).toHaveBeenCalledWith(
      PROFILE.id,
      SESSION.publicId,
      expect.objectContaining({ contentType: 'image/png' }),
    );
  });

  test('rejects a missing file entry', async () => {
    await expect(uploadAvatar(new FormData())).resolves.toEqual({
      ok: false,
      error: 'missingFile',
    });
    expect(storeMock).not.toHaveBeenCalled();
  });

  test('rejects a non-File entry', async () => {
    const formData = new FormData();
    formData.append('avatar', 'not a file');
    await expect(uploadAvatar(formData)).resolves.toEqual({ ok: false, error: 'missingFile' });
  });

  test('rejects an oversized file before any buffer read (SEC-02)', async () => {
    const formData = new FormData();
    const oversized = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png');
    formData.append('avatar', oversized);

    await expect(uploadAvatar(formData)).resolves.toEqual({ ok: false, error: 'fileTooLarge' });
    expect(storeMock).not.toHaveBeenCalled();
  });

  test('rejects an empty file', async () => {
    const formData = new FormData();
    formData.append('avatar', new File([], 'empty.png'));
    await expect(uploadAvatar(formData)).resolves.toEqual({ ok: false, error: 'emptyFile' });
  });

  test('rejects bytes that are not an image, whatever the declared type', async () => {
    const formData = new FormData();
    formData.append(
      'avatar',
      new File(['<html><body>hi</body></html>'], 'avatar.png', { type: 'image/png' }),
    );

    await expect(uploadAvatar(formData)).resolves.toEqual({
      ok: false,
      error: 'unsupportedType',
    });
    expect(storeMock).not.toHaveBeenCalled();
  });

  test('maps a rate-limit rejection to the typed rateLimited result', async () => {
    limiterCheckMock.mockImplementation(() => {
      throw new RateLimitExceededError(`avatar:${SESSION.publicId}`, 60_000);
    });

    await expect(uploadAvatar(pngFormData())).resolves.toEqual({
      ok: false,
      error: 'rateLimited',
    });
    expect(storeMock).not.toHaveBeenCalled();
  });

  test('keys the limiter by the session user, not by a client value', async () => {
    await uploadAvatar(pngFormData());
    expect(limiterCheckMock).toHaveBeenCalledWith(`avatar:${SESSION.publicId}`);
  });

  test('maps a storage failure to the unexpected result', async () => {
    storeMock.mockRejectedValue(new Error('db down'));
    await expect(uploadAvatar(pngFormData())).resolves.toEqual({
      ok: false,
      error: 'unexpected',
    });
  });

  test('treats a session whose profile no longer exists as unauthenticated', async () => {
    profileMock.mockResolvedValue(null);
    await expect(uploadAvatar(pngFormData())).resolves.toEqual({
      ok: false,
      error: 'unauthenticated',
    });
    expect(storeMock).not.toHaveBeenCalled();
  });
});
