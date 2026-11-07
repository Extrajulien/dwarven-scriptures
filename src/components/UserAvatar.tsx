import Icon from './Icon';

export type UserAvatarProps = {
  pfpUrl: string | null;
  username: string;
  className?: string;
  iconClassName?: string;
};

/**
 * Renders a user's profile picture, or the shared `person` fallback icon when
 * `pfpUrl` is null. Single source of truth so the navbar and the account screen
 * show the same avatar.
 */
export default function UserAvatar({
  pfpUrl,
  username,
  className = '',
  iconClassName = '',
}: UserAvatarProps) {
  if (pfpUrl) {
    return (
      <img
        src={pfpUrl}
        alt={`${username} avatar`}
        className={`rounded object-cover ${className}`.trim()}
      />
    );
  }

  return (
    <span
      className={`flex items-center justify-center rounded bg-primary text-on-primary ${className}`.trim()}
    >
      <Icon name="person" className={iconClassName} />
    </span>
  );
}
