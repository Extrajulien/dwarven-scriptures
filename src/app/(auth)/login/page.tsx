import type { Metadata } from 'next';
import ArtShowcase from '../../../components/login/ArtShowcase';
import LoginCard from '../../../components/login/LoginCard';
import { getLocale, pick } from '../../../i18n/messages';

export async function generateMetadata(): Promise<Metadata> {
  const messages = pick(await getLocale());
  return { title: messages['pageTitle.login'] };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const messages = pick(await getLocale());
  const params = await searchParams;
  // TECH-05: the OAuth routes redirect back here with this flag when the
  // provider credentials are not configured on the deployment — the login
  // forms keep working with username + password.
  const oauthUnavailable = params.oauth === 'unavailable';

  return (
    <div className="space-y-6">
      {oauthUnavailable && (
        <div
          role="alert"
          data-purpose="oauth-unavailable-notice"
          className="mx-auto w-full max-w-7xl border border-dwarf-gold/60 bg-dwarf-statusStrip px-4 py-3 text-label-sm text-dwarf-parchment"
        >
          {messages['oauth.unavailable']}
        </div>
      )}
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-stretch gap-6 md:grid-cols-12 lg:gap-8">
        <LoginCard messages={messages} />
        <ArtShowcase messages={messages} />
      </div>
    </div>
  );
}
