/**
 * @jest-environment node
 *
 * Unit tests for GET /api/avatar/[publicId] (AUTH-04): the handler streams
 * the stored bytes with the stored content type, answers 404/400/304 and
 * caches privately for 5 minutes. The database query is mocked; the response
 * building is exercised for real.
 */

import { getAvatarByPublicId } from '../../../../db/queries/avatars';
import { avatarResponse, GET } from './route';

jest.mock('../../../../db/queries/avatars', () => ({
  getAvatarByPublicId: jest.fn(),
}));

const getAvatarMock = getAvatarByPublicId as jest.Mock;

const PUBLIC_ID = '11111111-1111-4111-8111-111111111111';
const UPDATED_AT = new Date('2026-11-09T12:34:56.789Z');

const STORED = {
  contentType: 'image/png',
  bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]),
  updatedAt: UPDATED_AT,
};

function requestWith(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/avatar/ignored', { headers });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('avatarResponse', () => {
  test('streams the stored bytes with the stored content type and private cache', async () => {
    const response = avatarResponse(STORED, null);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-length')).toBe(String(STORED.bytes.length));
    expect(response.headers.get('cache-control')).toBe('private, max-age=300');
    expect(response.headers.get('etag')).toBe(`"${UPDATED_AT.getTime()}"`);

    const served = new Uint8Array(await response.arrayBuffer());
    expect([...served]).toEqual([...STORED.bytes]);
  });

  test('answers 404 when there is no stored avatar', () => {
    const response = avatarResponse(null, null);
    expect(response.status).toBe(404);
  });

  test('answers 304 when the If-None-Match ETag matches, without a body', async () => {
    const response = avatarResponse(STORED, `"${UPDATED_AT.getTime()}"`);

    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe(`"${UPDATED_AT.getTime()}"`);
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });

  test('ignores a stale If-None-Match and serves the bytes', async () => {
    const response = avatarResponse(STORED, '"1"');

    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
});

describe('GET /api/avatar/[publicId]', () => {
  test('looks the avatar up by the route publicId', async () => {
    getAvatarMock.mockResolvedValue(STORED);

    const response = await GET(requestWith(), { params: Promise.resolve({ publicId: PUBLIC_ID }) });

    expect(getAvatarMock).toHaveBeenCalledWith(PUBLIC_ID);
    expect(response.status).toBe(200);
  });

  test('rejects a malformed publicId with 400 before touching the database', async () => {
    const response = await GET(requestWith(), {
      params: Promise.resolve({ publicId: 'not-a-uuid' }),
    });

    expect(response.status).toBe(400);
    expect(getAvatarMock).not.toHaveBeenCalled();
  });

  test('maps a missing row to 404', async () => {
    getAvatarMock.mockResolvedValue(null);

    const response = await GET(requestWith(), { params: Promise.resolve({ publicId: PUBLIC_ID }) });
    expect(response.status).toBe(404);
  });

  test('forwards the request If-None-Match header', async () => {
    getAvatarMock.mockResolvedValue(STORED);

    const response = await GET(requestWith({ 'if-none-match': `"${UPDATED_AT.getTime()}"` }), {
      params: Promise.resolve({ publicId: PUBLIC_ID }),
    });

    expect(response.status).toBe(304);
  });
});
