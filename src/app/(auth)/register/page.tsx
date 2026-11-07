import type { Metadata } from 'next';
import RegisterArtShowcase from '../../../components/register/RegisterArtShowcase';
import RegisterCard from '../../../components/register/RegisterCard';

export const metadata: Metadata = {
  title: 'Citadel of Granite // Scribe Registration Terminal',
};

export default function RegisterPage() {
  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-stretch gap-6 md:grid-cols-12 lg:gap-8">
      <RegisterCard />
      <RegisterArtShowcase />
    </div>
  );
}
