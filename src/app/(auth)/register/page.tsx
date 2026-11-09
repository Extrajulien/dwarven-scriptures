import type { Metadata } from 'next';
import RegisterArtShowcase from '../../../components/register/RegisterArtShowcase';
import RegisterCard from '../../../components/register/RegisterCard';
import { getLocale, pick } from '../../../i18n/messages';

export async function generateMetadata(): Promise<Metadata> {
  const messages = pick(await getLocale());
  return { title: messages['pageTitle.register'] };
}

export default async function RegisterPage() {
  const messages = pick(await getLocale());

  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-stretch gap-6 md:grid-cols-12 lg:gap-8">
      <RegisterCard messages={messages} />
      <RegisterArtShowcase messages={messages} />
    </div>
  );
}
