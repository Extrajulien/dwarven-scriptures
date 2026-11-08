'use client';

import { useState } from 'react';
import type { ComponentType } from 'react';
import type { AccountProfile } from '../../app/account/profile';
import { logout } from '../../app/account/actions';
import { ACCOUNT_IDENTITY } from '../../data/accountData';
import { formatDate } from '../../i18n/format';
import type { Locale, Messages } from '../../i18n/messages';
import ButtonPrimary from '../ButtonPrimary';
import ButtonSecondary from '../ButtonSecondary';
import Icon from '../Icon';
import { DiscordIcon, GitHubIcon } from '../ProviderIcon';
import UserAvatar from '../UserAvatar';
import EditProfileModal from './EditProfileModal';

const PROVIDER_CHIPS: Record<
  string,
  {
    Icon: ComponentType<{ className?: string }>;
    className: string;
    labelKey: keyof Messages;
    dotClass: string;
  }
> = {
  github: {
    Icon: GitHubIcon,
    className: 'h-3.5 w-3.5 fill-current text-on-surface',
    labelKey: 'account.providers.githubConnected',
    dotClass: 'bg-tertiary',
  },
  discord: {
    Icon: DiscordIcon,
    className: 'h-3.5 w-3.5 fill-current text-secondary',
    labelKey: 'account.providers.discordConnected',
    dotClass: 'bg-secondary',
  },
};

export default function AccountIdentityCard({
  profile,
  locale,
  messages,
}: {
  profile: AccountProfile;
  locale: Locale;
  messages: Messages;
}) {
  const { actions } = ACCOUNT_IDENTITY;
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <section className="stone-card rounded-lg border border-outline-variant bg-surface-container-low p-4 shadow-lg md:p-6">
      <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
        {/* Beveled avatar frame with corner rivets */}
        <div className="relative flex-shrink-0">
          <div className="relative h-32 w-32 rounded-lg border-2 border-outline bg-surface-container-lowest p-1.5 shadow-md sm:h-36 sm:w-36">
            <span className="absolute left-1 top-1 text-[8px] leading-none text-outline">✦</span>
            <span className="absolute right-1 top-1 text-[8px] leading-none text-outline">✦</span>
            <span className="absolute bottom-1 left-1 text-[8px] leading-none text-outline">✦</span>
            <span className="absolute bottom-1 right-1 text-[8px] leading-none text-outline">✦</span>

            <UserAvatar
              pfpUrl={profile.pfpUrl}
              username={profile.username}
              className="h-full w-full border border-outline-variant"
              iconClassName="text-headline-xl"
            />
          </div>
        </div>

        {/* Identity details + actions */}
        <div className="w-full flex-1 space-y-3 text-center md:text-left">
          <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-center">
            <div>
              <h1 className="font-display text-headline-lg font-bold leading-tight tracking-tight text-on-surface sm:text-headline-xl">
                {profile.username}
              </h1>
              <p className="mt-0.5 font-mono font-label-md text-label-md uppercase tracking-wider text-outline">
                {messages[ACCOUNT_IDENTITY.memberSincePrefixKey]}{' '}
                {formatDate(profile.createdAt, locale)}{' '}
                {messages[ACCOUNT_IDENTITY.memberSinceSuffixKey]} •{' '}
                {messages[ACCOUNT_IDENTITY.citadelKey]}
              </p>
            </div>

            {profile.linkedProviders.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1 md:justify-start lg:pt-0">
                {profile.linkedProviders.map((provider) => {
                  const meta = PROVIDER_CHIPS[provider];
                  if (!meta) return null;
                  return (
                    <div
                      key={provider}
                      className="inline-flex items-center gap-1.5 rounded border border-outline-variant bg-surface-container-high px-2.5 py-1 font-label-sm text-label-sm tracking-wider text-on-surface-variant"
                    >
                      <meta.Icon className={meta.className} />
                      <span>{messages[meta.labelKey]}</span>
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions: single Edit (opens modal) + Log Out */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2 md:justify-start">
            <ButtonPrimary type="button" onClick={() => setIsModalOpen(true)}>
              <Icon name="edit" className="text-headline-sm" />
              {messages[actions.editKey]}
            </ButtonPrimary>
            <form action={logout}>
              <ButtonSecondary type="submit">
                <Icon name="logout" className="text-headline-sm" />
                {messages[actions.logoutKey]}
              </ButtonSecondary>
            </form>
          </div>
        </div>
      </div>

      <EditProfileModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        profile={profile}
        messages={messages}
      />
    </section>
  );
}
