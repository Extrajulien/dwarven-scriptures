'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { guestNicknameFormAction } from '../../app/rooms/actions';
import type { Messages } from '../../i18n/messages';
import ButtonPrimary from '../ButtonPrimary';
import GuestAvatar from './GuestAvatar';

/**
 * AUTH-02: guests choose their dwarf name (3–20 characters) before entering
 * a room. The signed `guest` cookie is written by the server action; the
 * cookie mutation makes Next re-render the route, so the lobby appears as
 * soon as the name is sealed. `router.refresh()` re-syncs as a fallback.
 */
export default function GuestNicknameForm({ messages }: { messages: Messages }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(guestNicknameFormAction, null);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
      <div className="flex items-center gap-space-md">
        <GuestAvatar seed="guest" className="h-12 w-12 text-headline-md" />
        <h1 className="font-headline-sm text-headline-sm uppercase tracking-wide text-primary">
          {messages['guestNickname.title']}
        </h1>
      </div>

      <p className="font-body-sm text-body-sm text-dwarf-parchmentMuted">
        {messages['guestNickname.hint']}
      </p>

      <form className="flex flex-col gap-space-sm" action={formAction} noValidate>
        <div className="flex flex-col gap-space-xs">
          <label
            htmlFor="guest-nickname-input"
            className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted"
          >
            {messages['guestNickname.label']}
          </label>
          <input
            id="guest-nickname-input"
            name="nickname"
            type="text"
            required
            minLength={3}
            maxLength={20}
            autoComplete="nickname"
            placeholder={messages['guestNickname.placeholder']}
            aria-invalid={state && !state.ok ? true : undefined}
            aria-describedby={state && !state.ok ? 'guest-nickname-error' : undefined}
            className="w-full rounded border border-dwarf-border bg-dwarf-bg px-3 py-2.5 font-mono text-sm text-dwarf-parchment placeholder-dwarf-borderLight shadow-stone-inner transition-colors duration-150 focus:border-dwarf-gold focus:outline-none focus:ring-1 focus:ring-dwarf-gold"
          />
        </div>

        {state && !state.ok && (
          <p id="guest-nickname-error" role="alert" className="text-xs font-medium text-dwarf-magma">
            {state.error === 'unexpected'
              ? messages['guestNickname.error.unexpected']
              : messages['guestNickname.error.invalid']}
          </p>
        )}

        <ButtonPrimary type="submit" disabled={pending} className="w-full">
          {pending ? messages['guestNickname.submitPending'] : messages['guestNickname.submit']}
        </ButtonPrimary>
      </form>

      <p className="text-center">
        <Link
          href="/login"
          className="font-label-sm text-label-sm uppercase text-dwarf-gold transition-colors hover:text-dwarf-goldHover"
        >
          {messages['guestNickname.signInInstead']}
        </Link>
      </p>
    </section>
  );
}
