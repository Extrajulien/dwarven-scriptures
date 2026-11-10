import type { Metadata } from 'next';
import Navbar from '../../components/Navbar/Navbar';
import Footer from '../../components/Footer';
import Icon from '../../components/Icon';
import RaceSection, { type HomeNotice } from '../../components/home/RaceSection';
import PublicRacesList from '../../components/race/PublicRacesList';
import { SITE } from '../../data/site';
import { listPublicRoomsForPage } from '../../db/queries/rooms';
import { getGuestSession } from '../../lib/guest-session';
import { getSession } from '../../lib/session';
import { getLocale, pick } from '../../i18n/messages';

const RACE_NOTICES = new Set(['kicked', 'noRooms', 'noRoomsGuest']);

export async function generateMetadata(): Promise<Metadata> {
  const messages = pick(await getLocale());
  return { title: `${SITE.name} // ${messages['pageTitle.race']}` };
}

/**
 * Race home (JOIN-01/03, SALLE-01): the "RACE CAVERN" title, the quick
 * play / join / create action cards (`RaceSection`) and the DB-backed public
 * races list. It also owns the `notice` query param (kicked / noRooms /
 * noRoomsGuest) that the room actions redirect to.
 */
export default async function RaceHomePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const [session, guest, locale, rooms] = await Promise.all([
    getSession(),
    getGuestSession(),
    getLocale(),
    listPublicRoomsForPage(),
  ]);
  const messages = pick(locale);

  const rawNotice = (await searchParams).notice;
  const notice: HomeNotice =
    typeof rawNotice === 'string' && RACE_NOTICES.has(rawNotice)
      ? (rawNotice as Exclude<HomeNotice, null>)
      : null;

  const viewer = session
    ? ({ kind: 'user', username: session.username } as const)
    : guest
      ? ({ kind: 'guest', nickname: guest.nickname } as const)
      : null;

  return (
    <>
      <Navbar
        user={session ? { username: session.username } : null}
        locale={locale}
        messages={messages}
      />

      <main className="min-h-[calc(100vh-3rem)] w-full bg-surface pb-16 pt-20">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-space-lg px-margin py-space-lg sm:px-margin-tablet">
          <header className="flex flex-col gap-space-sm border-b border-dwarf-border pb-space-md sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-space-xs">
              <h1 className="font-headline-sm text-headline-sm uppercase tracking-wide text-primary">
                {messages['raceSection.title']}
              </h1>
              <p className="font-label-sm text-label-sm text-outline">
                {messages['raceSection.subtitle']}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-space-xs self-start rounded border border-dwarf-gold/40 bg-dwarf-gold/10 px-space-md py-space-xs font-label-sm text-label-sm uppercase text-dwarf-gold sm:self-center">
              <Icon name="bolt" className="text-headline-sm" />
              {rooms.length} {messages['raceHome.active']}
            </span>
          </header>

          <RaceSection viewer={viewer} notice={notice} messages={messages} />

          <PublicRacesList
            rooms={rooms}
            viewerIsGuest={session === null}
            messages={messages}
          />
        </div>
      </main>

      <Footer messages={messages} />
    </>
  );
}
