import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Navbar from '../../../components/Navbar/Navbar';
import GuestNicknameForm from '../../../components/rooms/GuestNicknameForm';
import CodeGatePanel from '../../../components/rooms/CodeGatePanel';
import RoomLobby from '../../../components/rooms/RoomLobby';
import { listInvitationsForRoom } from '../../../db/queries/invitations';
import { getRoomForPage, getViewerMembership } from '../../../db/queries/rooms';
import { getUserFullProfile } from '../../../db/queries/users';
import { getGuestSession } from '../../../lib/guest-session';
import { getSession } from '../../../lib/session';
import { getLocale, pick } from '../../../i18n/messages';
import { SITE } from '../../../data/site';
import ButtonSecondary from '../../../components/ButtonSecondary';

export async function generateMetadata(): Promise<Metadata> {
  const messages = pick(await getLocale());
  return { title: `${SITE.name} // ${messages['pageTitle.room']}` };
}

type Viewer =
  | { kind: 'user'; publicId: string; username: string }
  | { kind: 'guest'; nickname: string; guestToken: string }
  | null;

/**
 * Room lobby page (SALLE-01/03/05/07, CONF-12).
 *
 * Access model (server-side, cookies only):
 * - public rooms open to everyone — the lobby joins by code, which is the
 *   documented "direct access" of a public room (SALLE-03);
 * - code rooms open to present members, or after proving the code (gate);
 * - private rooms open through an invitation token, or to a present member
 *   reconnecting (their membership is the credential — see the room store);
 * - closed rooms render the closed screen;
 * - guests choose their dwarf name first (AUTH-02); guests never see host
 *   controls and the server refuses host actions for them anyway (AUTH-03).
 */
export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ invitation?: string | string[] }>;
}) {
  const { publicId } = await params;
  const rawSearch = await searchParams;
  const invitation =
    typeof rawSearch.invitation === 'string' && rawSearch.invitation.length > 0 && rawSearch.invitation.length <= 256
      ? rawSearch.invitation
      : null;

  const room = await getRoomForPage(publicId);
  if (!room) {
    notFound();
  }

  const session = await getSession();
  const guest = await getGuestSession();
  const locale = await getLocale();
  const messages = pick(locale);

  let viewer: Viewer = null;
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
  const isMember = membership !== null;

  const shell = (children: ReactNode) => (
    <>
      <Navbar
        user={viewer?.kind === 'user' ? { username: viewer.username } : null}
        locale={locale}
        messages={messages}
      />
      <main className="w-full bg-surface pt-20 pb-12 min-h-screen">
        <div className="mx-auto w-full max-w-[1200px] px-margin py-space-lg sm:px-margin-tablet">
          {children}
        </div>
      </main>
    </>
  );

  if (room.status === 'fermee') {
    return shell(
      <section className="mx-auto flex w-full max-w-md flex-col items-center gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
        <h1 className="font-headline-sm text-headline-sm uppercase tracking-wide text-error">
          {messages['lobby.closed.title']}
        </h1>
        <p className="font-body-sm text-body-sm text-dwarf-parchmentMuted">
          {messages['lobby.closed.body']}
        </p>
        <ButtonSecondary href="/" className="w-full">
          {messages['lobby.backHome']}
        </ButtonSecondary>
      </section>,
    );
  }

  // SALLE-03: private rooms only open through an invitation link — for a
  // non-member there is nothing to prove and nothing to leak.
  if (room.visibility === 'private' && invitation === null && !isMember) {
    return shell(
      <section className="mx-auto flex w-full max-w-md flex-col items-center gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
        <h1 className="font-headline-sm text-headline-sm uppercase tracking-wide text-primary">
          {messages['gate.privateTitle']}
        </h1>
        <p className="font-body-sm text-body-sm text-dwarf-parchmentMuted">
          {messages['gate.privateBody']}
        </p>
        <ButtonSecondary href="/" className="w-full">
          {messages['lobby.backHome']}
        </ButtonSecondary>
      </section>,
    );
  }

  // SALLE-03: a code room requires proving the code before anything is shown.
  if (room.visibility === 'code' && !isMember) {
    return shell(
      <CodeGatePanel
        roomPublicId={publicId}
        guestNeedsNickname={viewer === null}
        messages={messages}
      />,
    );
  }

  // Guests pick their dwarf name before the lobby mounts (AUTH-02); the
  // nickname action writes the cookie, which re-renders this page.
  if (viewer === null) {
    return shell(<GuestNicknameForm messages={messages} />);
  }

  const isHost = viewer.kind === 'user' && viewer.publicId === room.hostPublicId;
  const initialInvitations = isHost ? await listInvitationsForRoom(publicId) : null;

  return shell(
    <RoomLobby
      roomPublicId={publicId}
      roomCode={room.code}
      invitationToken={invitation}
      viewer={viewer}
      initialInvitations={initialInvitations}
      messages={messages}
    />,
  );
}
