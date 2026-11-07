'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';
import type { AccountProfile } from '../../app/account/profile';
import { unlinkAccount, updateProfile } from '../../app/account/actions';
import ButtonPrimary from '../ButtonPrimary';
import ButtonSecondary from '../ButtonSecondary';
import Icon from '../Icon';
import { DiscordIcon, GitHubIcon } from '../ProviderIcon';
import UserAvatar from '../UserAvatar';

type Tab = 'identity' | 'accounts' | 'preferences';

type ProviderMeta = {
  id: string;
  Icon: ComponentType<{ className?: string }>;
  iconClass: string;
  connectedLabel: string;
  disconnectedLabel: string;
  note: string;
};

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'github',
    Icon: GitHubIcon,
    iconClass: 'h-4 w-4 fill-current text-on-surface',
    connectedLabel: 'GITHUB: CONNECTED',
    disconnectedLabel: 'GITHUB: NOT CONNECTED',
    note: '[OAUTH2 SYNC ACTIVE]',
  },
  {
    id: 'discord',
    Icon: DiscordIcon,
    iconClass: 'h-4 w-4 fill-current text-secondary',
    connectedLabel: 'DISCORD: CONNECTED',
    disconnectedLabel: 'DISCORD: NOT CONNECTED',
    note: '[OAUTH2 SYNC ACTIVE]',
  },
];

const USERNAME_ERRORS: Record<string, string> = {
  required: 'A name is required.',
  usernameTooLong: 'Name must be at most 32 characters.',
  usernameTaken: 'That name is already taken.',
};

const AVATAR_ERRORS: Record<string, string> = {
  invalidUrl: 'Enter a valid http(s) image URL.',
};

const FIELD_CLASSES =
  'w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 font-mono text-body-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40';

export default function EditProfileModal({
  open,
  onClose,
  profile,
}: {
  open: boolean;
  onClose: () => void;
  profile: AccountProfile;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('identity');
  const [state, formAction, pending] = useActionState(updateProfile, null);

  useEffect(() => {
    if (state && state.ok) {
      router.refresh();
      onClose();
    }
  }, [state, router, onClose]);

  if (!open) {
    return null;
  }

  const fieldErrors = state && state.ok === false ? state.fieldErrors : {};

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-surface-container-lowest/85 p-4 backdrop-blur-[3px] sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-scribe-title"
      onClick={onClose}
    >
      <div
        className="stone-card relative my-auto w-full max-w-2xl space-y-5 rounded-lg border-2 border-outline-variant bg-surface-container-low p-5 shadow-2xl shadow-black/90 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Corner rivets */}
        <span className="absolute left-2 top-2 select-none text-[9px] leading-none text-outline">✦</span>
        <span className="absolute right-2 top-2 select-none text-[9px] leading-none text-outline">✦</span>
        <span className="absolute bottom-2 left-2 select-none text-[9px] leading-none text-outline">✦</span>
        <span className="absolute bottom-2 right-2 select-none text-[9px] leading-none text-outline">✦</span>

        <form action={formAction} noValidate>
          {/* Header bar */}
          <div className="flex items-center justify-between border-b border-outline-variant pb-3">
            <div className="flex items-center gap-2 font-mono font-label-sm text-label-sm uppercase tracking-widest">
              <span className="font-bold text-primary">ᛞ [DIALOGUE // PROFILE_SETTINGS]</span>
              <span className="text-outline">{'//'}</span>
              <span className="text-tertiary">[STATUS: ACTIVE]</span>
            </div>
            <button
              type="button"
              title="[DISCARD]"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-outline-variant bg-surface-container-high font-mono font-bold text-outline transition-colors hover:border-error/60 hover:bg-error/20 hover:text-error"
            >
              ✕
            </button>
          </div>

          {/* Title */}
          <div className="mt-5">
            <h2
              id="modal-scribe-title"
              className="flex items-center gap-2 font-display text-headline-sm font-bold uppercase tracking-wider text-on-surface sm:text-headline-md"
            >
              <span className="font-bold text-primary">᚛</span>
              <span>CHISEL SCRIBE DOSSIER &amp; SETTINGS</span>
              <span className="font-bold text-primary">᚜</span>
            </h2>
            <p className="mt-0.5 font-mono font-label-sm text-label-sm uppercase tracking-wider text-outline">
              Configure runic identifier, linked telemetry nodes, and auditory chisel profiles.
            </p>
          </div>

          {/* Tabs */}
          <div className="mt-5 flex items-center gap-2 border-b border-outline-variant pb-2 font-mono font-label-sm text-label-sm uppercase tracking-wider">
            <TabButton active={activeTab === 'identity'} onClick={() => setActiveTab('identity')}>
              <span>ᛉ</span> [IDENTITY &amp; CALLSIGN]
            </TabButton>
            <TabButton active={activeTab === 'accounts'} onClick={() => setActiveTab('accounts')}>
              <span>ᛋ</span> [LINKED ACCOUNTS]
            </TabButton>
            <TabButton active={activeTab === 'preferences'} onClick={() => setActiveTab('preferences')}>
              <span>ᚱ</span> [DELVE PREFERENCES]
            </TabButton>
          </div>

          {/* Body */}
          <div className="mt-5 max-h-[62vh] space-y-5 overflow-y-auto pr-1 font-mono">
            {activeTab === 'identity' && (
              <div className="space-y-4 rounded border border-outline-variant bg-surface-container p-3.5">
                <div className="flex items-center justify-between font-label-sm text-label-sm font-bold uppercase tracking-wider text-outline">
                  <span>[01 // IDENTITY &amp; CALLSIGN]</span>
                  <span className="text-tertiary">[CITADEL REGISTERED]</span>
                </div>

                {/* Username */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="profile-username"
                    className="block font-label-sm text-label-sm font-bold uppercase tracking-widest text-outline"
                  >
                    [ SCRIBE USERNAME ]
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 select-none font-label-md text-label-md font-bold text-primary">ᛞ</span>
                    <input
                      id="profile-username"
                      name="username"
                      type="text"
                      defaultValue={profile.username}
                      aria-invalid={fieldErrors.username ? true : undefined}
                      aria-describedby={fieldErrors.username ? 'profile-username-error' : undefined}
                      className={`pl-8 pr-16 ${FIELD_CLASSES}`}
                    />
                    <span className="absolute right-3 font-mono font-label-sm text-label-sm font-bold uppercase text-tertiary">
                      [AVAIL: YES]
                    </span>
                  </div>
                  {fieldErrors.username && (
                    <p id="profile-username-error" role="alert" className="font-label-sm text-label-sm font-medium text-error">
                      {USERNAME_ERRORS[fieldErrors.username]}
                    </p>
                  )}
                </div>

                {/* Avatar URL */}
                <div className="space-y-2 border-t border-outline-variant/60 pt-1">
                  <label
                    htmlFor="profile-pfpUrl"
                    className="block font-label-sm text-label-sm font-bold uppercase tracking-widest text-outline"
                  >
                    [ AVATAR EMBLEM SELECTION ]
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative h-14 w-14 flex-shrink-0 rounded border-2 border-primary bg-surface-container-lowest p-0.5 shadow-gold-glow">
                      <UserAvatar
                        pfpUrl={profile.pfpUrl}
                        username={profile.username}
                        className="h-full w-full"
                        iconClassName="text-headline-md"
                      />
                      <span className="absolute -bottom-1 -right-1 rounded-full bg-primary px-1 text-[8px] font-bold text-on-primary">
                        ACTIVE
                      </span>
                    </div>
                    <input
                      id="profile-pfpUrl"
                      name="pfpUrl"
                      type="url"
                      defaultValue={profile.pfpUrl ?? ''}
                      placeholder="https://example.com/avatar.png"
                      aria-invalid={fieldErrors.pfpUrl ? true : undefined}
                      aria-describedby={fieldErrors.pfpUrl ? 'profile-pfpUrl-error' : undefined}
                      className={`min-w-[220px] flex-1 ${FIELD_CLASSES}`}
                    />
                  </div>
                  {fieldErrors.pfpUrl && (
                    <p id="profile-pfpUrl-error" role="alert" className="font-label-sm text-label-sm font-medium text-error">
                      {AVATAR_ERRORS[fieldErrors.pfpUrl]}
                    </p>
                  )}
                  <p className="font-label-sm text-label-sm text-outline">
                    Leave empty to clear the avatar and restore the fallback icon.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'accounts' && (
              <div className="space-y-3 rounded border border-outline-variant bg-surface-container p-3.5">
                <div className="flex items-center justify-between font-label-sm text-label-sm font-bold uppercase tracking-wider text-outline">
                  <span>[02 // LINKED ACCOUNTS &amp; TELEMETRY]</span>
                  <span className="text-outline-variant">[OAUTH2 SECURE]</span>
                </div>
                {PROVIDERS.map((provider) => {
                  const linked = profile.linkedProviders.includes(provider.id);
                  return (
                    <div
                      key={provider.id}
                      className="flex items-center justify-between rounded border border-outline-variant bg-surface-container-lowest p-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <provider.Icon className={provider.iconClass} />
                        <div>
                          <div className="font-label-md text-label-md font-bold text-on-surface">
                            {linked ? provider.connectedLabel : provider.disconnectedLabel}
                          </div>
                          <div className="font-label-sm text-label-sm text-tertiary">{provider.note}</div>
                        </div>
                      </div>
                      {linked ? (
                        <button
                          type="button"
                          onClick={() => {
                            void unlinkAccount(provider.id);
                          }}
                          className="rounded border border-outline-variant bg-surface-container-high px-2.5 py-1 font-label-sm text-label-sm font-bold uppercase tracking-wider text-error transition-colors hover:border-error/40 hover:bg-error/15"
                        >
                          [DISCONNECT]
                        </button>
                      ) : (
                        <a
                          href={`/api/auth/${provider.id}`}
                          className="rounded border border-outline-variant bg-surface-container-high px-2.5 py-1 font-label-sm text-label-sm font-bold uppercase tracking-wider text-primary transition-colors hover:border-primary/50 hover:text-on-surface"
                        >
                          [CONNECT]
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'preferences' && (
              <div className="space-y-3 rounded border border-outline-variant bg-surface-container p-3.5">
                <div className="flex items-center justify-between font-label-sm text-label-sm font-bold uppercase tracking-wider text-outline">
                  <span>[03 // DELVE PREFERENCES]</span>
                  <span className="text-outline-variant">[AUDIO &amp; SCRIPTS]</span>
                </div>
                {/* Not persisted — no DB columns yet. Rendered for parity with the design. */}
                <div className="space-y-1.5">
                  <label className="block font-label-sm text-label-sm font-bold uppercase tracking-widest text-outline">
                    [ KEYSTROKE SOUND: AUDITORY CHISEL ]
                  </label>
                  <select defaultValue="" className="w-full cursor-pointer appearance-none rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40">
                    <option value="">[CHERRY MX BLUE / DEEP GRANITE CLACK]</option>
                    <option value="">[MAGMA FLINT / HEAVY ANVIL STRIKE]</option>
                    <option value="">[BASALT CHIP / SUBDUED TACTILE]</option>
                    <option value="">[SILENT CAVERN / MUTED RUNES]</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block font-label-sm text-label-sm font-bold uppercase tracking-widest text-outline">
                    [ DEFAULT RUNIC SCRIPT / LANGUAGE DRILL ]
                  </label>
                  <select defaultValue="" className="w-full cursor-pointer appearance-none rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40">
                    <option value="">[DEFAULT RUNIC SCRIPT: ENGLISH + LATIN]</option>
                    <option value="">[ANCIENT RUNIC / DWARVEN PROTOCOL]</option>
                    <option value="">[POLYGLOT DELVE: ENG + FRE + GER]</option>
                    <option value="">[HEXADECIMAL CODE MATRIX]</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-5 flex flex-col items-center justify-between gap-3 border-t border-outline-variant pt-3 font-mono text-body-sm sm:flex-row">
            <div className="hidden font-label-sm text-label-sm uppercase tracking-wider text-outline sm:block">
              ᛞ [CHANGES PERSIST TO CITADEL CORE]
            </div>
            <div className="flex w-full items-center justify-end gap-2.5 sm:w-auto">
              <ButtonSecondary type="button" onClick={onClose} className="!min-h-[48px] !px-4 !py-3 sm:text-sm">
                <Icon name="close" className="text-headline-sm" />
                [ DISCARD ]
              </ButtonSecondary>
              <ButtonPrimary type="submit" disabled={pending}>
                <Icon name="done" className="text-headline-sm" />
                {pending ? '[ ENGRAVING… ]' : '[ ENGRAVE ]'}
              </ButtonPrimary>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'flex items-center gap-1 rounded bg-primary px-2.5 py-1 font-bold text-on-primary'
          : 'flex items-center gap-1 rounded border border-outline-variant bg-surface-container-high px-2.5 py-1 text-on-surface-variant transition-colors hover:text-on-surface'
      }
    >
      {children}
    </button>
  );
}
