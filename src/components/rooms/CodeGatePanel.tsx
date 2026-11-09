'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { joinByCodeFormAction } from '../../app/rooms/actions';
import type { Messages } from '../../i18n/messages';
import ButtonPrimary from '../ButtonPrimary';
import GuestAvatar from './GuestAvatar';

const GATE_ERROR_KEYS = {
  invalidInput: 'joinCode.error.invalidInput',
  roomNotFound: 'joinCode.error.roomNotFound',
  rateLimited: 'joinCode.error.rateLimited',
  roomFull: 'joinCode.error.roomFull',
  kicked: 'joinCode.error.kicked',
  roomNotJoinable: 'joinCode.error.roomNotJoinable',
  identityRequired: 'joinCode.error.identityRequired',
  invalidNickname: 'guestNickname.error.invalid',
  unexpected: 'joinCode.error.unexpected',
  authRequired: 'joinCode.error.unexpected',
  invalidConfig: 'joinCode.error.unexpected',
  notHost: 'joinCode.error.unexpected',
  targetNotFound: 'joinCode.error.unexpected',
  notHostCandidate: 'joinCode.error.unexpected',
  alreadyInRoom: 'joinCode.error.unexpected',
  configLocked: 'joinCode.error.unexpected',
} as const;

/**
 * SALLE-03 gate for code-visible rooms: a non-member must prove the code to
 * enter. On success the server-side membership exists and `router.refresh()`
 * re-renders the page — the viewer is now a member and the lobby mounts.
 * Guests without a nickname submit their dwarf name with the code (AUTH-02).
 */
export default function CodeGatePanel({
  roomPublicId,
  guestNeedsNickname,
  messages,
}: {
  roomPublicId: string;
  guestNeedsNickname: boolean;
  messages: Messages;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(joinByCodeFormAction, null);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (state?.ok && state.roomPublicId === roomPublicId) {
      router.refresh();
    }
  }, [state, router, roomPublicId]);

  const failure = state && !state.ok ? state : null;
  const error = failure ? GATE_ERROR_KEYS[failure.error] : null;
  const needsNickname = guestNeedsNickname || failure?.error === 'identityRequired' || failure?.error === 'invalidNickname';

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
      <div className="flex items-center gap-space-md">
        <GuestAvatar seed={roomPublicId} className="h-12 w-12 text-headline-md" />
        <h1 className="font-headline-sm text-headline-sm uppercase tracking-wide text-primary">
          {messages['gate.codeTitle']}
        </h1>
      </div>

      <p className="font-body-sm text-body-sm text-dwarf-parchmentMuted">{messages['gate.codeBody']}</p>

      <form className="flex flex-col gap-space-sm" action={formAction} noValidate>
        {needsNickname && (
          <div className="flex flex-col gap-space-xs">
            <label
              htmlFor="gate-nickname-input"
              className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted"
            >
              {messages['guestNickname.label']}
            </label>
            <input
              id="gate-nickname-input"
              name="nickname"
              type="text"
              maxLength={20}
              autoComplete="nickname"
              placeholder={messages['guestNickname.placeholder']}
              className="w-full rounded border border-dwarf-border bg-dwarf-bg px-3 py-2.5 font-mono text-sm text-dwarf-parchment placeholder-dwarf-borderLight shadow-stone-inner focus:border-dwarf-gold focus:outline-none focus:ring-1 focus:ring-dwarf-gold"
            />
          </div>
        )}

        <div className="flex flex-col gap-space-xs">
          <label
            htmlFor="gate-code-input"
            className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted"
          >
            {messages['joinCode.label']}
          </label>
          <input
            id="gate-code-input"
            name="code"
            type="text"
            required
            maxLength={6}
            autoComplete="off"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder={messages['joinCode.placeholder']}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'gate-code-error' : undefined}
            className="w-full rounded border border-dwarf-border bg-dwarf-bg px-3 py-2.5 font-mono text-sm uppercase tracking-[0.3em] text-dwarf-parchment placeholder-dwarf-borderLight shadow-stone-inner focus:border-dwarf-gold focus:outline-none focus:ring-1 focus:ring-dwarf-gold"
          />
        </div>

        {error && (
          <p id="gate-code-error" role="alert" className="text-xs font-medium text-dwarf-magma">
            {messages[error]}
          </p>
        )}

        <ButtonPrimary type="submit" disabled={pending} className="w-full">
          {pending ? messages['gate.joinPending'] : messages['gate.joinButton']}
        </ButtonPrimary>
      </form>
    </section>
  );
}
