import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import {
  buildAuthorizeUrl,
  generateState,
  isOAuthProvider,
  sanitizeRedirectPath,
} from '../../../../lib/oauth';

const STATE_COOKIE = 'oauth_state';
const NEXT_COOKIE = 'oauth_next';
const OAUTH_COOKIE_MAX_AGE = 10 * 60; // 10 minutes

/**
 * Starts the OAuth flow for `/api/auth/<provider>`.
 *
 * Generates a CSRF `state`, stores it (plus the sanitized post-login
 * destination) in short-lived HttpOnly cookies, and redirects to the
 * provider's authorize page. The `callback` route verifies the echoed `state`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!isOAuthProvider(provider)) {
    return new Response('Unknown OAuth provider', { status: 404 });
  }

  const state = generateState();
  const next = sanitizeRedirectPath(request.nextUrl.searchParams.get('next'));
  const redirectUri = new URL(
    `/api/auth/${provider}/callback`,
    request.nextUrl.origin,
  ).toString();

  const store = await cookies();
  const options = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: OAUTH_COOKIE_MAX_AGE,
    path: '/',
  };
  store.set(STATE_COOKIE, state, options);
  store.set(NEXT_COOKIE, next, options);

  redirect(buildAuthorizeUrl(provider, state, redirectUri).toString());
}
