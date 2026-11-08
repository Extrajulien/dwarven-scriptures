import type { Metadata } from 'next';
import ArtShowcase from '../../../components/login/ArtShowcase';
import LoginCard from '../../../components/login/LoginCard';
import { getLocale, pick } from '../../../i18n/messages';

export async function generateMetadata(): Promise<Metadata> {
  const messages = pick(await getLocale());
  return { title: messages['pageTitle.login'] };
}

export default async function LoginPage() {
  const messages = pick(await getLocale());

  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-stretch gap-6 md:grid-cols-12 lg:gap-8">
      <LoginCard messages={messages} />
      <ArtShowcase messages={messages} />
    </div>
  );
}
