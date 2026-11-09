'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import {
  joinByCodeFormAction,
  leaveAndJoinFormAction,
  type RoomActionError,
} from '../../app/rooms/actions';
import type { Messages } from '../../i18n/messages';
import ButtonPrimary from '../ButtonPrimary';
import ButtonSecondary from '../ButtonSecondary';

export type JoinViewer = { kind: 'user'; username: string } | { kind: 'guest'; nickname: string } | null;

const JOIN_ERROR_KEYS = {
  invalidInput: 'joinCode.error.invalidInput',
  roomNotFound: 'joinCode.error.roomNotFound',
  rateLimited: 'joinCode.error.rateLimited',
  roomFull: 'joinCode.error.roomFull',
  kicked: 'joinCode.error.kicked',
  roomNotJoinable: 'joinCode.error.roomNotJoinable',
  identityRequired: 'joinCode.error.identityRequired',
  invalidNickname: 'guestNickname.error.invalid',
  unexpected: 'joinCode.error.unexpected',
  // Never returned by this form; mapped defensively to the generic message.
  authRequired: 'joinCode.error.unexpected',
  invalidConfig: 'joinCode.error.unexpected',
  notHost: 'joinCode.error.unexpected',
  targetNotFound: 'joinCode.error.unexpected',
  notHostCandidate: 'joinCode.error.unexpected',
  alreadyInRoom: 'joinCode.error.unexpected',
  // Never returned by this form (host config editor only, CONF-12).
  configLocked: 'joinCode.error.unexpected',
} as const satisfies Record<RoomActionError, keyof Messages>;

const INPUT_CLASSES =
  'w-full rounded border border-dwarf-border bg-dwarf-bg px-3 py-2.5 font-mono text-sm text-dwarf-parchment placeholder-dwarf-borderLight shadow-stone-inner transition-colors duration-150 focus:border-dwarf-gold focus:outline-none focus:ring-1 focus:ring-dwarf-gold';

/**
 * JOIN-01: room-code entry on the home page. Calls `joinByCodeFormAction`;
 * on `alreadyInRoom` it shows the current room (SALLE-06) with a
 * leave-and-join path; rate-limit and not-found failures surface the typed
 * message. Guests without a nickname cookie submit their dwarf name with the
 * code (AUTH-02).
 */
export default function JoinByCodeForm({
  viewer,
  messages,
}: {
  viewer: JoinViewer;
  messages: Messages;
}) {
  const router = useRouter();
  const [joinState, joinAction, joinPending] = useActionState(joinByCodeFormAction, null);
  const [leaveState, leaveAction, leavePending] = useActionState(leaveAndJoinFormAction, null);
  const [code, setCode] = useState('');

  const effectiveState = joinState ?? leaveState;
  const pending = joinPending || leavePending;
  const failure = effectiveState && !effectiveState.ok ? effectiveState : null;
  const needsNickname =
    viewer === null || failure?.error === 'identityRequired' || failure?.error === 'invalidNickname';

  useEffect(() => {
    if (joinState?.ok) {
      router.push(`/rooms/${joinState.roomPublicId}`);
    }
  }, [joinState, router]);

  useEffect(() => {
    if (leaveState?.ok) {
      router.push(`/rooms/${leaveState.roomPublicId}`);
    }
  }, [leaveState, router]);

  const error = failure ? JOIN_ERROR_KEYS[failure.error] : null;
  const alreadyInRoom = failure && failure.error === 'alreadyInRoom' ? failure.currentRoom : null;

  return (
    <section
      className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl"
      aria-labelledby="join-code-title"
    >
      <h3
        id="join-code-title"
        className="font-headline-sm text-headline-sm uppercase tracking-wide text-primary"
      >
        {messages['joinCode.title']}
      </h3>

      <form className="flex flex-col gap-space-sm" action={joinAction} noValidate>
        {needsNickname && (
          <div className="flex flex-col gap-space-xs">
            <label
              htmlFor="home-nickname-input"
              className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted"
            >
              {messages['guestNickname.label']}
            </label>
            <input
              id="home-nickname-input"
              name="nickname"
              type="text"
              maxLength={20}
              autoComplete="nickname"
              placeholder={messages['guestNickname.placeholder']}
              className={INPUT_CLASSES}
            />
          </div>
        )}

        <div className="flex flex-col gap-space-xs">
          <label
            htmlFor="home-code-input"
            className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted"
          >
            {messages['joinCode.label']}
          </label>
          <input
            id="home-code-input"
            name="code"
            type="text"
            required
            maxLength={6}
            autoComplete="off"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder={messages['joinCode.placeholder']}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'join-code-error' : undefined}
            className={`${INPUT_CLASSES} uppercase tracking-[0.3em]`}
          />
        </div>

        {error && (
          <p id="join-code-error" role="alert" className="text-xs font-medium text-dwarf-magma">
            {messages[error]}
          </p>
        )}

        <ButtonPrimary type="submit" disabled={pending} className="w-full">
          {pending ? messages['joinCode.submitPending'] : messages['joinCode.submit']}
        </ButtonPrimary>
      </form>

      {alreadyInRoom && (
        <div
          className="flex flex-col gap-space-sm rounded border border-dwarf-border bg-dwarf-slate p-space-md"
          role="status"
        >
          <p className="font-label-md text-label-md uppercase text-dwarf-parchment">
            {messages['joinCode.alreadyInRoom']}
          </p>
          <p className="flex items-center gap-space-xs font-body-sm text-body-sm text-dwarf-parchmentMuted">
            <span>{messages['joinCode.currentRoom']}</span>
            <span className="rounded bg-dwarf-basalt px-space-xs py-0.5 font-mono text-dwarf-gold">
              {alreadyInRoom.code}
            </span>
          </p>
          <div className="flex flex-wrap gap-space-sm">
            <ButtonSecondary href={`/rooms/${alreadyInRoom.publicId}`} className="flex-1">
              {messages['joinCode.viewCurrent']}
            </ButtonSecondary>
            <form action={leaveAction} className="flex-1">
              <input type="hidden" name="code" value={code} />
              <input type="hidden" name="currentRoomPublicId" value={alreadyInRoom.publicId} />
              <ButtonSecondary type="submit" disabled={pending} className="w-full">
                {pending ? messages['joinCode.submitPending'] : messages['joinCode.leaveAndJoin']}
              </ButtonSecondary>
            </form>
          </div>
        </div>
      )}

      <p className="flex items-center gap-space-xs font-label-sm text-label-sm text-outline">
        <Link
          href="/rooms"
          className="text-dwarf-gold transition-colors hover:text-dwarf-goldHover"
        >
          {messages['raceSection.explorerLink']}
        </Link>
      </p>
    </section>
  );
}
