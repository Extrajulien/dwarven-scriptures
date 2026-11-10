import App from '../App';
import { getSession } from '../lib/session';
import { getLocale, pick } from '../i18n/messages';

export default async function Page() {
  const session = await getSession();
  const locale = await getLocale();

  return (
    <App
      user={session ? { username: session.username } : null}
      locale={locale}
      messages={pick(locale)}
    />
  );
}
