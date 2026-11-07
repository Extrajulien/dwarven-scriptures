/**
 * @jest-environment node
 *
 * Unit tests for the OAuth client. The pure helpers are tested directly; the
 * network calls are exercised with a mocked global `fetch` so the provider
 * response mapping (the riskiest part) is covered without hitting the network.
 */

import {
  buildAuthorizeUrl,
  buildDiscordAvatarUrl,
  deriveUsername,
  exchangeCodeForToken,
  fetchProfile,
  isOAuthProvider,
  sanitizeRedirectPath,
} from './oauth';

const originalFetch = global.fetch;

function mockFetch(json: Record<string, unknown>, ok = true): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok,
    text: async () => JSON.stringify(json),
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  process.env.GITHUB_CLIENT_ID = 'gh-client';
  process.env.GITHUB_CLIENT_SECRET = 'gh-secret';
  process.env.DISCORD_CLIENT_ID = 'discord-client';
  process.env.DISCORD_CLIENT_SECRET = 'discord-secret';
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('isOAuthProvider', () => {
  test.each(['github', 'discord'])('accepts %s', (provider) => {
    expect(isOAuthProvider(provider)).toBe(true);
  });

  test.each(['google', '', null, 42])('rejects %p', (value) => {
    expect(isOAuthProvider(value)).toBe(false);
  });
});

describe('deriveUsername', () => {
  test('trims surrounding whitespace', () => {
    expect(deriveUsername('  Ada Lovelace  ')).toBe('Ada Lovelace');
  });

  test('truncates to 32 characters', () => {
    expect(deriveUsername('a'.repeat(40))).toBe('a'.repeat(32));
  });

  test.each([[''], [null], [undefined]])('falls back for %p', (value) => {
    expect(deriveUsername(value as never)).toBe('scribe');
  });
});

describe('buildDiscordAvatarUrl', () => {
  test('assembles the CDN URL from id and avatar hash', () => {
    expect(buildDiscordAvatarUrl('9988', 'abc123')).toBe(
      'https://cdn.discordapp.com/avatars/9988/abc123.png',
    );
  });

  test('returns null when there is no custom avatar', () => {
    expect(buildDiscordAvatarUrl('9988', null)).toBeNull();
  });

  test('returns null when the id is missing', () => {
    expect(buildDiscordAvatarUrl('', 'abc123')).toBeNull();
  });
});

describe('sanitizeRedirectPath', () => {
  test('keeps a same-origin absolute path', () => {
    expect(sanitizeRedirectPath('/profile')).toBe('/profile');
  });

  test.each(['//evil.com', 'https://evil.com', null, undefined, 'not-a-path'])(
    'falls back to / for %p',
    (value) => {
      expect(sanitizeRedirectPath(value as never)).toBe('/');
    },
  );
});

describe('buildAuthorizeUrl', () => {
  test('builds the GitHub authorize URL with the expected parameters', () => {
    const url = buildAuthorizeUrl('github', 'state-abc', 'http://localhost/api/auth/github/callback');

    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('gh-client');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost/api/auth/github/callback');
    expect(url.searchParams.get('scope')).toBe('read:user');
    expect(url.searchParams.get('state')).toBe('state-abc');
  });

  test('builds the Discord authorize URL with the expected parameters', () => {
    const url = buildAuthorizeUrl('discord', 'state-xyz', 'http://localhost/api/auth/discord/callback');

    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(url.searchParams.get('scope')).toBe('identify');
    expect(url.searchParams.get('state')).toBe('state-xyz');
  });
});

describe('exchangeCodeForToken', () => {
  test('exchanges the code with GitHub using a JSON body', async () => {
    const fetchMock = mockFetch({ access_token: 'gh-token' });

    await expect(
      exchangeCodeForToken('github', 'code', 'http://localhost/api/auth/github/callback'),
    ).resolves.toBe('gh-token');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://github.com/login/oauth/access_token');
    expect(init.headers).toMatchObject({ Accept: 'application/json' });
  });

  test('exchanges the code with Discord using a form body', async () => {
    const fetchMock = mockFetch({ access_token: 'discord-token' });

    await expect(
      exchangeCodeForToken('discord', 'code', 'http://localhost/api/auth/discord/callback'),
    ).resolves.toBe('discord-token');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.com/api/oauth2/token');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
  });

  test('throws when the provider rejects the exchange', async () => {
    mockFetch({ error: 'bad_verification_code' }, false);

    await expect(
      exchangeCodeForToken('github', 'bad', 'http://localhost/api/auth/github/callback'),
    ).rejects.toThrow('GitHub token exchange failed');
  });
});

describe('fetchProfile', () => {
  test('maps a GitHub user to a normalized profile', async () => {
    mockFetch({ id: 12345, login: 'ada', avatar_url: 'https://avatars.example/ada.png' });

    await expect(fetchProfile('github', 'gh-token')).resolves.toEqual({
      provider: 'github',
      providerAccountId: '12345',
      username: 'ada',
      pfpUrl: 'https://avatars.example/ada.png',
    });
  });

  test('maps a Discord user to a normalized profile with the avatar URL', async () => {
    mockFetch({
      id: '998877665544332211',
      username: 'frodo',
      global_name: 'Frodo Baggins',
      avatar: 'abc123',
    });

    await expect(fetchProfile('discord', 'discord-token')).resolves.toEqual({
      provider: 'discord',
      providerAccountId: '998877665544332211',
      username: 'Frodo Baggins',
      pfpUrl: 'https://cdn.discordapp.com/avatars/998877665544332211/abc123.png',
    });
  });

  test('throws when the user info request fails', async () => {
    mockFetch({}, false);

    await expect(fetchProfile('github', 'gh-token')).rejects.toThrow(
      'github user info request failed',
    );
  });
});
