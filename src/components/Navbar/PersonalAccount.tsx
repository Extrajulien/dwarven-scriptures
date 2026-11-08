import Link from 'next/link';
import Icon from '../Icon';
import UserAvatar from '../UserAvatar';
import { LOGIN } from '../../data/NavbarData';

export type NavUser = { username: string; pfpUrl?: string | null };

export default function PersonalAccount({ user = null }: { user?: NavUser | null }) {
  if (user) {
    return (
      <Link
        href="/account"
        className="flex items-center gap-space-sm rounded bg-surface-container px-space-sm py-space-xs"
      >
        <span className="hidden text-right sm:block">
          <span className="block font-label-md text-label-md text-on-surface">
            {user.username}
          </span>
        </span>
        <UserAvatar
          pfpUrl={user.pfpUrl ?? null}
          username={user.username}
          className="h-8 w-8 rounded-md"
          iconClassName="text-headline-sm"
        />
      </Link>
    );
  }

  return (
    <Link
      href="/login"
      className={`${LOGIN.button.className} flex h-8 items-center justify-center rounded-md bg-primary pe-3 ps-2`}
    >
      <Icon name={LOGIN.button.icon} className="text-headline-sm" />
      {LOGIN.button.label}
    </Link>
  );
}
