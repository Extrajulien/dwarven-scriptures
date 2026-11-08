import { timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { createOrLinkOAuthUser } from '../../../../../db/queries/oauth-accounts';
import { createSession } from '../../../../../lib/session';
import {
  exchangeCodeForToken,
  fetchProfile,
  isOAuthProvider,
  sanitizeRedirectPath,
} from '../../../../../lib/oauth';

const STATE_COOKIE = 'oauth_state';
const NEXT_COOKIE = 'oauth_next';

/**
 * Handles the provider redirect back to `/api/auth/<provider>/callback`.
 *
 * Verifies the CSRF `state`, exchanges the authorization code for an access
 * token, fetches the provider profile, find-or-creates the local user and
 * writes the session. Any failure redirects to `/login`; nothing sensitive is
 * ever logged or returned to the browser.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!isOAuthProvider(provider)) {
    return new Response('Unknown OAuth provider', { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const store = await cookies();
  const storedState = store.get(STATE_COOKIE)?.value;
  const next = sanitizeRedirectPath(store.get(NEXT_COOKIE)?.value);

  // One-time cookies are always cleared, success or failure.
  store.delete(STATE_COOKIE);
  store.delete(NEXT_COOKIE);

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const providerError = searchParams.get('error');

  if (
    providerError !== null ||
    !code ||
    !state ||
    !storedState ||
    !stateMatches(state, storedState)
  ) {
    redirect('/login');
  }

  const redirectUri = new URL(
    `/api/auth/${provider}/callback`,
    request.nextUrl.origin,
  ).toString();

  let publicId: string;
  let username: string;
  try {
    const accessToken = await exchangeCodeForToken(provider, code, redirectUri);
    const profile = await fetchProfile(provider, accessToken);
    const user = await createOrLinkOAuthUser(profile);
    publicId = user.publicId;
    username = user.username;
  } catch (error) {
    console.error(`OAuth callback failed for ${provider}:`, error);
    redirect('/login');
  }

  // `createSession` writes the cookie, so it must run after the try/catch that
  // handles the OAuth exchange (redirect() throws and must not be swallowed).
  try {
    await createSession({ publicId, username }, { remember: true });
  } catch (error) {
    console.error('OAuth callback failed to create the session:', error);
    redirect('/login');
  }

  redirect(next);
}

function stateMatches(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}
