'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ChangeEvent, ComponentType, ReactNode } from 'react';
import type { AccountProfile } from '../../app/account/profile';
import { unlinkAccount, updateProfile, uploadAvatar } from '../../app/account/actions';
import {
  AVATAR_CONTENT_TYPES,
  AVATAR_MAX_BYTES,
  type AvatarUploadErrorCode,
} from '../../lib/avatar-upload';
import type { Messages } from '../../i18n/messages';
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
  connectedLabelKey: keyof Messages;
  disconnectedLabelKey: keyof Messages;
  noteKey: keyof Messages;
};

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'github',
    Icon: GitHubIcon,
    iconClass: 'h-4 w-4 fill-current text-on-surface',
    connectedLabelKey: 'account.modal.githubConnected',
    disconnectedLabelKey: 'account.modal.githubDisconnected',
    noteKey: 'account.modal.oauthNote',
  },
  {
    id: 'discord',
    Icon: DiscordIcon,
    iconClass: 'h-4 w-4 fill-current text-secondary',
    connectedLabelKey: 'account.modal.discordConnected',
    disconnectedLabelKey: 'account.modal.discordDisconnected',
    noteKey: 'account.modal.oauthNote',
  },
];

/** Field error codes → localized message keys (I18N-01). */
const USERNAME_ERROR_KEYS: Record<string, keyof Messages> = {
  required: 'account.modal.error.usernameRequired',
  usernameTooLong: 'account.modal.error.usernameTooLong',
  usernameTaken: 'account.modal.error.usernameTaken',
};

const AVATAR_ERROR_KEYS: Record<string, keyof Messages> = {
  invalidUrl: 'account.modal.error.invalidUrl',
};

/** Every failure code the upload path can produce, server or client side. */
type UploadErrorCode = AvatarUploadErrorCode | 'unauthenticated' | 'rateLimited' | 'unexpected';

/** Server-side upload failure codes → localized message keys (AUTH-04). */
const UPLOAD_ERROR_KEYS: Record<UploadErrorCode, keyof Messages> = {
  missingFile: 'upload.error.missingFile',
  emptyFile: 'upload.error.emptyFile',
  fileTooLarge: 'upload.error.fileTooLarge',
  unsupportedType: 'upload.error.unsupportedType',
  unauthenticated: 'upload.error.unauthenticated',
  rateLimited: 'upload.error.rateLimited',
  unexpected: 'upload.error.unexpected',
};

const SOUND_OPTION_KEYS: readonly (keyof Messages)[] = [
  'account.modal.sound1',
  'account.modal.sound2',
  'account.modal.sound3',
  'account.modal.sound4',
];

const SCRIPT_OPTION_KEYS: readonly (keyof Messages)[] = [
  'account.modal.script1',
  'account.modal.script2',
  'account.modal.script3',
  'account.modal.script4',
];

const FIELD_CLASSES =
  'w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 font-mono text-body-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40';

export default function EditProfileModal({
  open,
  onClose,
  profile,
  messages,
}: {
  open: boolean;
  onClose: () => void;
  profile: AccountProfile;
  messages: Messages;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('identity');
  const [state, formAction, pending] = useActionState(updateProfile, null);

  // Avatar upload (AUTH-04): the file is checked client-side as a hint only
  // (size + declared type), previewed, then handed to the `uploadAvatar`
  // server action which decides the real type from the bytes.
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<UploadErrorCode | null>(null);
  const [uploadPending, startUploadTransition] = useTransition();
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (state && state.ok) {
      router.refresh();
      onClose();
    }
  }, [state, router, onClose]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    // Clear the input value so re-selecting the same file re-fires `change`.
    event.target.value = '';

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    if (!file) {
      setSelectedFile(null);
      setPreviewUrl(null);
      setUploadError(null);
      return;
    }

    const clientError = previewUploadError(file);
    if (clientError) {
      setSelectedFile(null);
      setPreviewUrl(null);
      setUploadError(clientError);
      return;
    }

    const url = URL.createObjectURL(file);
    blobUrlRef.current = url;
    setSelectedFile(file);
    setPreviewUrl(url);
    setUploadError(null);
  }

  function handleUpload(): void {
    if (!selectedFile || uploadPending) {
      return;
    }

    const formData = new FormData();
    formData.append('avatar', selectedFile);

    startUploadTransition(async () => {
      const result = await uploadAvatar(formData);
      if (result.ok) {
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }
        setSelectedFile(null);
        setUploadError(null);
        // The new pfpUrl is the serving route; refresh so every avatar on the
        // page (navbar, identity card, modal) picks up the fresh URL.
        setPreviewUrl(result.pfpUrl);
        router.refresh();
      } else {
        setUploadError(result.error);
      }
    });
  }

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
              <span className="font-bold text-primary">{messages['account.modal.header']}</span>
              <span className="text-outline">{'//'}</span>
              <span className="text-tertiary">{messages['account.modal.statusActive']}</span>
            </div>
            <button
              type="button"
              title={messages['account.modal.discardTitle']}
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
              <span>{messages['account.modal.title']}</span>
              <span className="font-bold text-primary">᚜</span>
            </h2>
            <p className="mt-0.5 font-mono font-label-sm text-label-sm uppercase tracking-wider text-outline">
              {messages['account.modal.subtitle']}
            </p>
          </div>

          {/* Tabs */}
          <div className="mt-5 flex items-center gap-2 border-b border-outline-variant pb-2 font-mono font-label-sm text-label-sm uppercase tracking-wider">
            <TabButton active={activeTab === 'identity'} onClick={() => setActiveTab('identity')}>
              <span>ᛉ</span> {messages['account.modal.tabIdentity']}
            </TabButton>
            <TabButton active={activeTab === 'accounts'} onClick={() => setActiveTab('accounts')}>
              <span>ᛋ</span> {messages['account.modal.tabAccounts']}
            </TabButton>
            <TabButton active={activeTab === 'preferences'} onClick={() => setActiveTab('preferences')}>
              <span>ᚱ</span> {messages['account.modal.tabPreferences']}
            </TabButton>
          </div>

          {/* Body */}
          <div className="mt-5 max-h-[62vh] space-y-5 overflow-y-auto pr-1 font-mono">
            {activeTab === 'identity' && (
              <div className="space-y-4 rounded border border-outline-variant bg-surface-container p-3.5">
                <div className="flex items-center justify-between font-label-sm text-label-sm font-bold uppercase tracking-wider text-outline">
                  <span>{messages['account.modal.identitySection']}</span>
                  <span className="text-tertiary">{messages['account.modal.citadelRegistered']}</span>
                </div>

                {/* Username */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="profile-username"
                    className="block font-label-sm text-label-sm font-bold uppercase tracking-widest text-outline"
                  >
                    {messages['account.modal.usernameLabel']}
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
                      {messages['account.modal.availableYes']}
                    </span>
                  </div>
                  {fieldErrors.username && (
                    <p id="profile-username-error" role="alert" className="font-label-sm text-label-sm font-medium text-error">
                      {messages[USERNAME_ERROR_KEYS[fieldErrors.username] ?? 'account.modal.error.usernameRequired']}
                    </p>
                  )}
                </div>

                {/* Avatar URL (kept as-is: the URL-edit path stays available) */}
                <div className="space-y-2 border-t border-outline-variant/60 pt-1">
                  <label
                    htmlFor="profile-pfpUrl"
                    className="block font-label-sm text-label-sm font-bold uppercase tracking-widest text-outline"
                  >
                    {messages['account.modal.avatarLabel']}
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative h-14 w-14 flex-shrink-0 rounded border-2 border-primary bg-surface-container-lowest p-0.5 shadow-gold-glow">
                      <UserAvatar
                        pfpUrl={previewUrl ?? profile.pfpUrl}
                        username={profile.username}
                        className="h-full w-full"
                        iconClassName="text-headline-md"
                      />
                      <span className="absolute -bottom-1 -right-1 rounded-full bg-primary px-1 text-[8px] font-bold text-on-primary">
                        {messages['account.modal.avatarActive']}
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
                      {messages[AVATAR_ERROR_KEYS[fieldErrors.pfpUrl] ?? 'account.modal.error.invalidUrl']}
                    </p>
                  )}
                  <p className="font-label-sm text-label-sm text-outline">
                    {messages['account.modal.avatarHint']}
                  </p>
                </div>

                {/* Avatar upload (AUTH-04) */}
                <div className="space-y-1.5 border-t border-outline-variant/60 pt-2">
                  <label
                    htmlFor="profile-avatar-file"
                    className="block font-label-sm text-label-sm font-bold uppercase tracking-widest text-outline"
                  >
                    {messages['upload.chooseFile']}
                  </label>
                  <input
                    id="profile-avatar-file"
                    name="avatar"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadPending}
                    onChange={handleFileChange}
                    className="w-full cursor-pointer rounded border border-outline-variant bg-surface-container-lowest px-2 py-1.5 font-mono font-body-sm text-body-sm text-on-surface file:mr-3 file:cursor-pointer file:rounded file:border file:border-outline-variant file:bg-surface-container-high file:px-2 file:py-1 file:font-mono file:font-label-sm file:text-label-sm file:font-bold file:uppercase file:tracking-wider file:text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  {uploadError && (
                    <p role="alert" className="font-label-sm text-label-sm font-medium text-error">
                      {messages[UPLOAD_ERROR_KEYS[uploadError] ?? 'upload.error.unexpected']}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <ButtonPrimary
                      type="button"
                      onClick={handleUpload}
                      disabled={uploadPending || !selectedFile}
                    >
                      <Icon name="upload" className="text-headline-sm" />
                      {uploadPending ? messages['upload.uploading'] : messages['upload.upload']}
                    </ButtonPrimary>
                  </div>
                  <p className="font-label-sm text-label-sm text-outline">
                    {messages['upload.hint']}
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'accounts' && (
              <div className="space-y-3 rounded border border-outline-variant bg-surface-container p-3.5">
                <div className="flex items-center justify-between font-label-sm text-label-sm font-bold uppercase tracking-wider text-outline">
                  <span>{messages['account.modal.accountsSection']}</span>
                  <span className="text-outline-variant">{messages['account.modal.oauthSecure']}</span>
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
                            {messages[
                              linked ? provider.connectedLabelKey : provider.disconnectedLabelKey
                            ]}
                          </div>
                          <div className="font-label-sm text-label-sm text-tertiary">
                            {messages[provider.noteKey]}
                          </div>
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
                          {messages['account.modal.disconnect']}
                        </button>
                      ) : (
                        <a
                          href={`/api/auth/${provider.id}`}
                          className="rounded border border-outline-variant bg-surface-container-high px-2.5 py-1 font-label-sm text-label-sm font-bold uppercase tracking-wider text-primary transition-colors hover:border-primary/50 hover:text-on-surface"
                        >
                          {messages['account.modal.connect']}
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
                  <span>{messages['account.modal.preferencesSection']}</span>
                  <span className="text-outline-variant">{messages['account.modal.audioScripts']}</span>
                </div>
                {/* Not persisted — no DB columns yet. Rendered for parity with the design. */}
                <div className="space-y-1.5">
                  <label className="block font-label-sm text-label-sm font-bold uppercase tracking-widest text-outline">
                    {messages['account.modal.keystrokeLabel']}
                  </label>
                  <select defaultValue="" className="w-full cursor-pointer appearance-none rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40">
                    {SOUND_OPTION_KEYS.map((optionKey) => (
                      <option key={optionKey} value="">
                        {messages[optionKey]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block font-label-sm text-label-sm font-bold uppercase tracking-widest text-outline">
                    {messages['account.modal.scriptLabel']}
                  </label>
                  <select defaultValue="" className="w-full cursor-pointer appearance-none rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40">
                    {SCRIPT_OPTION_KEYS.map((optionKey) => (
                      <option key={optionKey} value="">
                        {messages[optionKey]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-5 flex flex-col items-center justify-between gap-3 border-t border-outline-variant pt-3 font-mono text-body-sm sm:flex-row">
            <div className="hidden font-label-sm text-label-sm uppercase tracking-wider text-outline sm:block">
              {messages['account.modal.persistNote']}
            </div>
            <div className="flex w-full items-center justify-end gap-2.5 sm:w-auto">
              <ButtonSecondary type="button" onClick={onClose} className="!min-h-[48px] !px-4 !py-3 sm:text-sm">
                <Icon name="close" className="text-headline-sm" />
                {messages['account.modal.discard']}
              </ButtonSecondary>
              <ButtonPrimary type="submit" disabled={pending}>
                <Icon name="done" className="text-headline-sm" />
                {pending ? messages['account.modal.submitPending'] : messages['account.modal.submit']}
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

const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/** Client-side hint codes; the server action re-validates everything. */
type UploadHintError = 'emptyFile' | 'fileTooLarge' | 'unsupportedType';

/**
 * Pre-submit sanity check (AUTH-04): the size comes from `File.size` and the
 * type from the declared MIME/extension — a convenience only, the server
 * decides the real type from the magic bytes (SEC-02).
 */
function previewUploadError(file: File): UploadHintError | null {
  if (file.size === 0) {
    return 'emptyFile';
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return 'fileTooLarge';
  }
  const name = file.name.toLowerCase();
  const declaredTypeKnown = (AVATAR_CONTENT_TYPES as readonly string[]).includes(file.type);
  const extensionKnown = ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension));
  return declaredTypeKnown || extensionKnown ? null : 'unsupportedType';
}
