import { AUTH_ALTERNATIVES } from '../../data/registerData';
import { DiscordIcon, GitHubIcon } from '../ProviderIcon';

// A plain anchor (not `next/link`) so the browser performs a full-page load
// to the route handler, which immediately redirects to the external provider.
const PROVIDER_LINK_CLASSES =
  'btn-chisel-stone group inline-flex min-h-[44px] items-center justify-center gap-2 rounded bg-dwarf-basalt px-3 py-2.5 text-xs text-dwarf-parchment transition hover:text-white';

const PROVIDER_ICONS = {
  github: {
    Icon: GitHubIcon,
    className: 'h-4 w-4 fill-current text-dwarf-parchmentMuted group-hover:text-white',
  },
  discord: {
    Icon: DiscordIcon,
    className: 'h-4 w-4 fill-current text-[#5865F2]',
  },
};

export default function RegisterOAuthButtons() {
  return (
    <div
      className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
      data-purpose="register-oauth-providers"
    >
      {AUTH_ALTERNATIVES.providers.map((provider) => {
        const { Icon, className } = PROVIDER_ICONS[provider.id];
        return (
          <a
            key={provider.id}
            href={`/api/auth/${provider.id}`}
            className={PROVIDER_LINK_CLASSES}
          >
            <Icon className={className} />
            <span className="text-label-sm font-bold tracking-tight">
              {provider.label}
            </span>
          </a>
        );
      })}
    </div>
  );
}
