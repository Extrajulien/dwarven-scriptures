import type { Metadata } from 'next';
import RegisterArtShowcase from '../../components/register/RegisterArtShowcase';
import RegisterCard from '../../components/register/RegisterCard';
import LightFooter from '../../components/LightFooter';
import LightHeader from '../../components/LightHeader';

export const metadata: Metadata = {
  title: 'Citadel of Granite // Scribe Registration Terminal',
};

export default function RegisterPage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#0f0e0d] font-mono text-dwarf-parchment antialiased selection:bg-dwarf-gold selection:text-dwarf-abyss">
      {/* Scanline texture overlay */}
      <div className="retro-scanlines pointer-events-none fixed inset-0 z-50" />
      {/* Ambient cave lighting gradient */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(197,155,39,0.08),rgba(15,14,13,0.9))]" />

      <LightHeader />

      <main className="relative z-20 flex flex-grow items-center justify-center p-3 sm:p-6 lg:p-10">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-stretch gap-6 md:grid-cols-12 lg:gap-8">
          <RegisterCard />
          <RegisterArtShowcase />
        </div>
      </main>

      <LightFooter />
    </div>
  );
}
