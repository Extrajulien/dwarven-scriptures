import ChronicleFeed from './components/ChronicleFeed';
import Contracts from './components/Contracts';
import Footer from './components/Footer';
import GuildBanner from './components/GuildBanner';
import Header from './components/Header';
import MinerRoster from './components/MinerRoster';
import PerksPanel from './components/PerksPanel';
import SpriteShowcase from './sprites/SpriteShowcase';
import AutoTileDemo from './sprites/AutoTileDemo';

export default function App() {
  return (
    <>
      <Header />

      <main className="w-full pt-20 bg-surface min-h-[calc(100vh-3rem)] pb-12">
        <div className="flex flex-col w-full">
          <div className="w-full px-margin-desktop py-space-xl flex flex-col gap-space-xl max-w-[1720px] mx-auto">
            <GuildBanner />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
              <div className="lg:col-span-8 flex flex-col gap-space-xl">
                <MinerRoster />
                <Contracts />
              </div>

              <div className="lg:col-span-4 flex flex-col gap-space-xl">
                <PerksPanel />
                <ChronicleFeed />
              </div>
            </div>

            {/* Dev-only sprite system demo — remove when integrated into the real game. */}
            <SpriteShowcase />
            <AutoTileDemo />
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
