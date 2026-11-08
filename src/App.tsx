'use client';

import ChronicleFeed from './components/ChronicleFeed';
import Contracts from './components/Contracts';
import Footer from './components/Footer';
import GuildBanner from './components/GuildBanner';
import MinerRoster from './components/MinerRoster';
import PerksPanel from './components/PerksPanel';
import RaceSection, { type HomeNotice } from './components/home/RaceSection';
import SpriteShowcase from './sprites/SpriteShowcase';
import AutoTileDemo from './sprites/AutoTileDemo';
import Navbar from './components/Navbar/Navbar';
import type { Locale, Messages } from './i18n/messages';

export type NavUser = { username: string };

export type AppProps = {
  user?: NavUser | null;
  /** Present when the visitor holds a signed guest cookie (AUTH-02). */
  guestNickname?: string | null;
  notice?: HomeNotice;
  /** The resolved fr/en locale (drives the navbar selector, I18N-02). */
  locale: Locale;
  /** The resolved fr/en message bag (server components read the cookie). */
  messages: Messages;
};

export default function App({
  user = null,
  guestNickname = null,
  notice = null,
  locale,
  messages,
}: AppProps) {
  const viewer =
    user !== null
      ? ({ kind: 'user', username: user.username } as const)
      : guestNickname !== null
        ? ({ kind: 'guest', nickname: guestNickname } as const)
        : null;

  return (
    <>
      <Navbar user={user} locale={locale} messages={messages} />

      <main className="w-full pt-20 bg-surface min-h-[calc(100vh-3rem)] pb-12">
        <div className="flex flex-col w-full">
          <div className="w-full px-margin-desktop py-space-xl flex flex-col gap-space-xl max-w-[1720px] mx-auto">
            <GuildBanner messages={messages} />

            <RaceSection viewer={viewer} notice={notice} messages={messages} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
              <div className="lg:col-span-8 flex flex-col gap-space-xl">
                <MinerRoster messages={messages} />
                <Contracts messages={messages} />
              </div>

              <div className="lg:col-span-4 flex flex-col gap-space-xl">
                <PerksPanel messages={messages} />
                <ChronicleFeed messages={messages} />
              </div>
            </div>

            {/* Dev-only sprite system demo — remove when integrated into the real game. */}
            <SpriteShowcase />
            <AutoTileDemo />
          </div>
        </div>
      </main>

      <Footer messages={messages} />
    </>
  );
}
