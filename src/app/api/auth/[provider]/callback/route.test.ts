/**
 * @jest-environment node
 *
 * Unit tests for the OAuth callback route (TECH-05 graceful degradation):
 * when the provider credentials are missing, a valid callback must redirect
 * to /login with the localized notice (not 500), one-time cookies are
 * always cleared, and the configured flow still completes the login.
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

jest.mock('../../../../../db/queries/oauth-accounts', () => ({
  createOrLinkOAuthUser: jest.fn(),
}));

jest.mock('../../../../../lib/session', () => ({
  createSession: jest.fn(),
}));

import { createOrLinkOAuthUser } from '../../../../../db/queries/oauth-accounts';
import { createSession } from '../../../../../lib/session';

const cookiesMock = cookies as jest.Mock;
const redirectMock = redirect as unknown as jest.Mock;
const createOrLinkOAuthUserMock = createOrLinkOAuthUser as jest.Mock;
const createSessionMock = createSession as jest.Mock;

const STATE = 'st-valid';
const originalFetch = global.fetch;

function clearProviderEnv(): void {
  for (const name of [
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
  ]) {
    delete process.env[name];
  }
}

function cookieStore(state = STATE, next = '/rooms') {
  const values = new Map<string, string>([
    ['oauth_state', state],
    ['oauth_next', next],
  ]);
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

function callbackRequest(provider: string, query = `code=abc&state=${STATE}`): NextRequest {
  return new NextRequest(`http://localhost:3000/api/auth/${provider}/callback?${query}`);
}

function paramsOf(provider: string): { params: Promise<{ provider: string }> } {
  return { params: Promise.resolve({ provider }) };
}

/** One fetch mock that answers the token endpoint then the user endpoint. */
function mockGithubFlow(): jest.Mock {
  const fn = jest.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return {
      ok: true,
      text: async () =>
        JSON.stringify(
          url.includes('access_token')
            ? { access_token: 'gh-token' }
            : { id: 12345, login: 'ada', avatar_url: null },
        ),
    };
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  jest.clearAllMocks();
  clearProviderEnv();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('GET /api/auth/[provider]/callback (TECH-05)', () => {
  test.each(['github', 'discord'])(
    'redirects to /login?oauth=unavailable when %s credentials are missing',
    async (provider) => {
      cookiesMock.mockResolvedValue(cookieStore());

      await expect(GET(callbackRequest(provider), paramsOf(provider))).rejects.toThrow(
        'NEXT_REDIRECT to /login?oauth=unavailable',
      );

      expect(redirectMock).toHaveBeenCalledWith('/login?oauth=unavailable');
      expect(createOrLinkOAuthUserMock).not.toHaveBeenCalled();
      expect(createSessionMock).not.toHaveBeenCalled();
    },
  );

  test('still clears the one-time cookies before degrading', async () => {
    const store = cookieStore();
    const deletions: string[] = [];
    store.delete = (name: string) => {
      deletions.push(name);
    };
    cookiesMock.mockResolvedValue(store);

    await expect(GET(callbackRequest('github'), paramsOf('github'))).rejects.toThrow(
      'NEXT_REDIRECT to /login?oauth=unavailable',
    );

    expect(deletions.sort()).toEqual(['oauth_next', 'oauth_state']);
  });

  test('invalid state still redirects to /login without the notice', async () => {
    cookiesMock.mockResolvedValue(cookieStore(STATE));

    await expect(
      GET(callbackRequest('github', 'code=abc&state=st-other'), paramsOf('github')),
    ).rejects.toThrow('NEXT_REDIRECT to /login');

    expect(redirectMock).toHaveBeenCalledWith('/login');
    expect(createOrLinkOAuthUserMock).not.toHaveBeenCalled();
  });

  test('completes the login when credentials are configured', async () => {
    process.env.GITHUB_CLIENT_ID = 'gh-client';
    process.env.GITHUB_CLIENT_SECRET = 'gh-secret';
    cookiesMock.mockResolvedValue(cookieStore());
    mockGithubFlow();
    createOrLinkOAuthUserMock.mockResolvedValue({ publicId: 'pub-1', username: 'ada' });
    createSessionMock.mockResolvedValue(undefined);

    await expect(GET(callbackRequest('github'), paramsOf('github'))).rejects.toThrow(
      'NEXT_REDIRECT to /rooms',
    );

    expect(createOrLinkOAuthUserMock).toHaveBeenCalledWith({
      provider: 'github',
      providerAccountId: '12345',
      username: 'ada',
      pfpUrl: null,
    });
    expect(createSessionMock).toHaveBeenCalledWith(
      { publicId: 'pub-1', username: 'ada' },
      { remember: true },
    );
  });
});
