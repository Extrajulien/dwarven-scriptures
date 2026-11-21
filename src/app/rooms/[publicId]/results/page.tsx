import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Navbar from '../../../../components/Navbar/Navbar';
import RaceResultsView, {
  type RaceResultsViewer,
} from '../../../../components/race/RaceResultsView';
import { SITE } from '../../../../data/site';
import { getRoomForPage, getViewerMembership } from '../../../../db/queries/rooms';
import { getUserFullProfile } from '../../../../db/queries/users';
import { getLocale, pick } from '../../../../i18n/messages';
import { getGuestSession } from '../../../../lib/guest-session';
import { getSession } from '../../../../lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const messages = pick(await getLocale());
  return { title: `${SITE.name} // ${messages['pageTitle.raceResults']}` };
}

/**
 * Dedicated race-results page (`/rooms/[publicId]/results`, RES-01..04,
 * COURSE-11): shows only the finished race's results — no lobby chrome. A
 * present member is handed to the results view with their room code and role;
 * the view reconnects the room socket and receives the server's replayed
 * `raceFinished`. Everyone else is redirected to the room page, which owns
 * the nickname/gate/private/closed screens.
 */
export default async function RoomResultsPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const room = await getRoomForPage(publicId);
  if (!room) {
    notFound();
  }

  if (room.status === 'fermee') {
    redirect(`/rooms/${publicId}`);
  }

  const session = await getSession();
  const guest = await getGuestSession();
  const locale = await getLocale();
  const messages = pick(locale);

  let viewer: RaceResultsViewer | null = null;
  let internalUserId: number | null = null;
  let guestToken: string | null = null;
  let viewerBestWpm: number | null = null;

  if (session) {
    const profile = await getUserFullProfile({ publicId: session.publicId });
    if (profile) {
      internalUserId = profile.id;
      viewer = { kind: 'user', publicId: session.publicId, username: profile.username };
      // RES-04: the viewer's pre-race personal best feeds the record
      // indicator. Only logged-in users have stats (AUTH-03).
      const parsedBest = Number.parseFloat(profile.bestWpm ?? '');
      viewerBestWpm = Number.isFinite(parsedBest) ? parsedBest : null;
    }
  } else if (guest) {
    guestToken = guest.guestId;
    viewer = { kind: 'guest', nickname: guest.nickname, guestToken };
  }

  const membership =
    internalUserId !== null
      ? await getViewerMembership(publicId, { userId: internalUserId })
      : guestToken !== null
        ? await getViewerMembership(publicId, { guestToken })
        : null;

  if (viewer === null || membership === null) {
    redirect(`/rooms/${publicId}`);
  }

  return (
    <>
      <Navbar
        user={viewer.kind === 'user' ? { username: viewer.username } : null}
        locale={locale}
        messages={messages}
      />
      <main className="w-full bg-surface pt-20 pb-12 min-h-screen">
        <div className="mx-auto w-full max-w-[1200px] px-margin py-space-lg sm:px-margin-tablet">
          <RaceResultsView
            roomPublicId={publicId}
            roomCode={room.code}
            viewer={viewer}
            viewerRole={membership.role === 'spectator' ? 'spectator' : 'participant'}
            viewerBestWpm={viewerBestWpm}
            messages={messages}
            locale={locale}
          />
        </div>
      </main>
    </>
  );
}
