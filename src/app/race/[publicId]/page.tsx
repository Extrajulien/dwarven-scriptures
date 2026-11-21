import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import RaceArena, { type RaceArenaViewer } from '../../../components/race/RaceArena';
import { SITE } from '../../../data/site';
import { getRoomForPage, getViewerMembership } from '../../../db/queries/rooms';
import { getUserFullProfile } from '../../../db/queries/users';
import { getLocale, pick } from '../../../i18n/messages';
import { getGuestSession } from '../../../lib/guest-session';
import { getSession } from '../../../lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const messages = pick(await getLocale());
  return { title: `${SITE.name} // ${messages['pageTitle.raceArena']}` };
}

/**
 * Full-screen race arena (`/race/[publicId]`) — the minimal centered race
 * surface (progress track + typing zone + give up), reached by navigation
 * from the room lobby when a race starts. Only a present room member may
 * race: a hand-crafted URL is redirected home (SALLE-03/09 — the membership
 * is the credential, the room code only re-attaches the live connection).
 */
export default async function RaceArenaPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const room = await getRoomForPage(publicId);
  if (!room) {
    notFound();
  }

  const session = await getSession();
  const guest = await getGuestSession();
  const messages = pick(await getLocale());

  let viewer: RaceArenaViewer | null = null;
  let internalUserId: number | null = null;
  let guestToken: string | null = null;

  if (session) {
    const profile = await getUserFullProfile({ publicId: session.publicId });
    if (profile) {
      internalUserId = profile.id;
      viewer = { kind: 'user', publicId: session.publicId, username: profile.username };
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
    redirect('/');
  }

  return (
    <RaceArena
      roomPublicId={publicId}
      roomCode={room.code}
      viewer={viewer}
      viewerRole={membership.role === 'spectator' ? 'spectator' : 'participant'}
      messages={messages}
    />
  );
}
