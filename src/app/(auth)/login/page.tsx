import type { Metadata } from 'next';
import ArtShowcase from '../../../components/login/ArtShowcase';
import LoginCard from '../../../components/login/LoginCard';

export const metadata: Metadata = {
  title: 'Citadel of Granite // Scribe Access Terminal',
};

export default function LoginPage() {
  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-stretch gap-6 md:grid-cols-12 lg:gap-8">
      <LoginCard />
      <ArtShowcase />
    </div>
  );
}
