import { randomBytes } from 'crypto';

/**
 * OAuth 2.0 client for GitHub and Discord.
 *
 * Implements the authorization-code flow by hand (no auth dependency) using
 * Node's built-in `crypto` and `fetch`. The client secret is read from
 * server-side environment variables and never reaches the client. A `state`
 * parameter (see `generateState`) protects the callback from CSRF.
 *
 * The pure helpers (`deriveUsername`, `buildDiscordAvatarUrl`,
 * `sanitizeRedirectPath`, `isOAuthProvider`) are exported so they can be unit
 * tested without a network. This module is server-only by convention: it reads
 * `process.env` and performs outbound requests, so never import it from a
 * client component.
 */

export const OAUTH_PROVIDER_IDS = ['github', 'discord'] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDER_IDS)[number];

export type OAuthProfile = {
  provider: OAuthProviderId;
  providerAccountId: string;
  username: string;
  pfpUrl: string | null;
};

const USERNAME_MAX_LENGTH = 32;
const USERNAME_FALLBACK = 'scribe';

type ProviderConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
};

const PROVIDERS: Record<OAuthProviderId, ProviderConfig> = {
  github: {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scope: 'read:user',
    clientIdEnv: 'GITHUB_CLIENT_ID',
    clientSecretEnv: 'GITHUB_CLIENT_SECRET',
  },
  discord: {
    authorizeUrl: 'https://discord.com/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    userInfoUrl: 'https://discord.com/api/users/@me',
    scope: 'identify',
    clientIdEnv: 'DISCORD_CLIENT_ID',
    clientSecretEnv: 'DISCORD_CLIENT_SECRET',
  },
};

export function isOAuthProvider(value: unknown): value is OAuthProviderId {
  return (
    typeof value === 'string' &&
    (OAUTH_PROVIDER_IDS as readonly string[]).includes(value)
  );
}

/**
 * True when the provider's client credentials are both present in the
 * environment. The auth routes use this to degrade gracefully (TECH-05):
 * without credentials they redirect back to `/login` with a localized
 * notice instead of letting `getClientCredentials` throw a 500. The login
 * buttons stay visible either way — the redirect loop carries the notice.
 */
export function isProviderConfigured(provider: OAuthProviderId): boolean {
  const config = PROVIDERS[provider];
  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  return (
    typeof clientId === 'string' &&
    clientId.length > 0 &&
    typeof clientSecret === 'string' &&
    clientSecret.length > 0
  );
}

/** Random CSRF token echoed back by the provider on the callback. */
export function generateState(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Builds the provider's authorize URL. The caller must first generate a `state`
 * and store it (e.g. in a cookie) so the callback can verify it.
 */
export function buildAuthorizeUrl(
  provider: OAuthProviderId,
  state: string,
  redirectUri: string,
): URL {
  const config = PROVIDERS[provider];
  const { clientId } = getClientCredentials(provider);

  const url = new URL(config.authorizeUrl);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', config.scope);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  return url;
}

/** Exchanges the authorization code for an access token. */
export async function exchangeCodeForToken(
  provider: OAuthProviderId,
  code: string,
  redirectUri: string,
): Promise<string> {
  const config = PROVIDERS[provider];
  const { clientId, clientSecret } = getClientCredentials(provider);

  if (provider === 'github') {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const data = await readJson(response);
    if (!response.ok || typeof data.access_token !== 'string') {
      throw new Error('GitHub token exchange failed');
    }
    return data.access_token;
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = await readJson(response);
  if (!response.ok || typeof data.access_token !== 'string') {
    throw new Error('Discord token exchange failed');
  }
  return data.access_token;
}

/** Fetches and normalises the provider profile for the given access token. */
export async function fetchProfile(
  provider: OAuthProviderId,
  accessToken: string,
): Promise<OAuthProfile> {
  const config = PROVIDERS[provider];
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (provider === 'github') {
    headers.Accept = 'application/vnd.github+json';
    headers['User-Agent'] = 'dwarven-scriptures';
  }

  const response = await fetch(config.userInfoUrl, { headers });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(`${provider} user info request failed`);
  }

  return provider === 'github' ? parseGitHubProfile(data) : parseDiscordProfile(data);
}

/**
 * Derives a display name from a provider value: trimmed, at most 32 characters
 * and never empty (falling back to a neutral name when the provider sends
 * nothing usable).
 */
export function deriveUsername(preferred: string | null | undefined): string {
  const trimmed = typeof preferred === 'string' ? preferred.trim() : '';
  if (trimmed.length === 0) {
    return USERNAME_FALLBACK;
  }
  return trimmed.slice(0, USERNAME_MAX_LENGTH);
}

/**
 * Discord does not return a ready-made avatar URL: it must be assembled from
 * the user id and avatar hash. Returns `null` when there is no custom avatar.
 */
export function buildDiscordAvatarUrl(id: string, avatar: string | null): string | null {
  if (!id || !avatar) {
    return null;
  }
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`;
}

/**
 * Sanitizes the post-login destination. Only same-origin absolute paths are
 * allowed; anything else (absolute URL, protocol-relative `//`) falls back to
 * `/` to prevent an open redirect.
 */
export function sanitizeRedirectPath(value: string | null | undefined): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  return value;
}

function getClientCredentials(provider: OAuthProviderId): {
  clientId: string;
  clientSecret: string;
} {
  const config = PROVIDERS[provider];
  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];

  if (!clientId || !clientSecret) {
    throw new Error(`${config.clientIdEnv} and ${config.clientSecretEnv} must be set`);
  }

  return { clientId, clientSecret };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseGitHubProfile(data: Record<string, unknown>): OAuthProfile {
  const id = data.id;
  if (typeof id !== 'number' && typeof id !== 'string') {
    throw new Error('GitHub profile is missing an id');
  }

  return {
    provider: 'github',
    providerAccountId: String(id),
    username: deriveUsername(typeof data.login === 'string' ? data.login : ''),
    pfpUrl: typeof data.avatar_url === 'string' ? data.avatar_url : null,
  };
}

function parseDiscordProfile(data: Record<string, unknown>): OAuthProfile {
  const id = typeof data.id === 'string' ? data.id : '';
  if (!id) {
    throw new Error('Discord profile is missing an id');
  }

  // `global_name` is the human display name; `username` is the unique handle.
  const displayName =
    typeof data.global_name === 'string' && data.global_name.trim() !== ''
      ? data.global_name
      : typeof data.username === 'string'
        ? data.username
        : '';

  return {
    provider: 'discord',
    providerAccountId: id,
    username: deriveUsername(displayName),
    pfpUrl: buildDiscordAvatarUrl(
      id,
      typeof data.avatar === 'string' ? data.avatar : null,
    ),
  };
}
