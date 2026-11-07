import App from '../App';
import { getSession } from '../lib/session';

export default async function Page() {
  const session = await getSession();

  return <App user={session ? { username: session.username } : null} />;
}
