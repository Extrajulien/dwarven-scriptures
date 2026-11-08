import App from '../App';
import { getGuestSession } from '../lib/guest-session';
import { getSession } from '../lib/session';
import { getLocale, pick } from '../i18n/messages';

const HOME_NOTICES = new Set(['kicked', 'noRooms', 'noRoomsGuest']);

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const session = await getSession();
  const guest = await getGuestSession();
  const locale = await getLocale();

  const rawNotice = (await searchParams).notice;
  const notice =
    typeof rawNotice === 'string' && HOME_NOTICES.has(rawNotice)
      ? (rawNotice as 'kicked' | 'noRooms' | 'noRoomsGuest')
      : null;

  return (
    <App
      user={session ? { username: session.username } : null}
      guestNickname={guest?.nickname ?? null}
      notice={notice}
      messages={pick(locale)}
    />
  );
}
