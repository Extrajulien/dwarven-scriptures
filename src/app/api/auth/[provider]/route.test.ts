/**
 * @jest-environment node
 *
 * Unit tests for the OAuth authorize route (TECH-05 graceful degradation):
 * without provider credentials the route must redirect back to /login with
 * the localized notice instead of throwing a 500, unknown providers answer
 * 404, and the configured flow still builds the provider redirect.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';
import { GET } from './route';

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    // Mirrors the real control-flow throw of next/navigation's redirect().
    const error = new Error(`NEXT_REDIRECT to ${path}`) as Error & { digest: string };
    error.digest = `NEXT_REDIRECT;replace;${path};307;`;
    throw error;
  }),
}));

const cookiesMock = cookies as jest.Mock;
const redirectMock = redirect as unknown as jest.Mock;

const GITHUB_ENV = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'] as const;
const DISCORD_ENV = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'] as const;

function clearProviderEnv(): void {
  for (const name of [...GITHUB_ENV, ...DISCORD_ENV]) {
    delete process.env[name];
  }
}

function storeStub() {
  const values = new Map<string, string>();
  return {
    get: (name: string) => (values.has(name) ? { value: values.get(name) } : undefined),
    set: (name: string, value: string) => {
      values.set(name, value);
    },
    delete: (name: string) => {
      values.delete(name);
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearProviderEnv();
});

describe('GET /api/auth/[provider] (TECH-05)', () => {
  test.each(['github', 'discord'])(
    'redirects to /login?oauth=unavailable when %s credentials are missing',
    async (provider) => {
      await expect(
        GET(new NextRequest(`http://localhost:3000/api/auth/${provider}`), {
          params: Promise.resolve({ provider }),
        }),
      ).rejects.toThrow(`NEXT_REDIRECT to /login?oauth=unavailable`);

      expect(redirectMock).toHaveBeenCalledWith('/login?oauth=unavailable');
      expect(cookiesMock).not.toHaveBeenCalled();
    },
  );

  test('answers 404 for an unknown provider without redirecting', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/auth/google'), {
      params: Promise.resolve({ provider: 'google' }),
    });
    expect(response.status).toBe(404);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  test('still builds the provider redirect when credentials are configured', async () => {
    process.env.GITHUB_CLIENT_ID = 'gh-client';
    process.env.GITHUB_CLIENT_SECRET = 'gh-secret';
    cookiesMock.mockResolvedValue(storeStub());

    await expect(
      GET(new NextRequest('http://localhost:3000/api/auth/github?next=/rooms'), {
        params: Promise.resolve({ provider: 'github' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT to https://github.com/login/oauth/authorize');

    const target = redirectMock.mock.calls[0]?.[0] as string;
    const url = new URL(target);
    expect(url.searchParams.get('client_id')).toBe('gh-client');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/github/callback',
    );
    expect(url.searchParams.get('state')).toBeTruthy();
  });
});
