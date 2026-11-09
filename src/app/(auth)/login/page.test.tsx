import { renderToStaticMarkup } from 'react-dom/server';
import LoginPage from './page';

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({ get: () => undefined }),
  headers: jest.fn().mockResolvedValue({ get: () => 'fr-CA,fr;q=0.9' }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

// The LoginForm client component imports the server action, whose graph
// reaches the real `pg` driver; the mock keeps the page render jsdom-safe.
jest.mock('../../../app/login/actions', () => ({
  loginUser: jest.fn(),
}));

/**
 * TECH-05: the OAuth routes redirect to `/login?oauth=unavailable` when the
 * provider credentials are not configured; the page must render the
 * localized notice for that flag and stay silent otherwise.
 */
describe('login page OAuth notice (TECH-05)', () => {
  test('renders the localized notice when oauth=unavailable is present', async () => {
    const markup = renderToStaticMarkup(
      await LoginPage({
        searchParams: Promise.resolve({ oauth: 'unavailable' }),
      }),
    );

    expect(markup).toContain('data-purpose="oauth-unavailable-notice"');
    expect(markup).toContain('n’est pas configurée');
    expect(markup).toMatch(/role="alert"/);
  });

  test('stays silent without the oauth flag', async () => {
    const markup = renderToStaticMarkup(
      await LoginPage({ searchParams: Promise.resolve({}) }),
    );

    expect(markup).not.toContain('oauth-unavailable-notice');
  });
});
