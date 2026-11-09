'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { createRoomFormAction } from '../../app/rooms/actions';
import type { Messages } from '../../i18n/messages';
import ButtonPrimary from '../ButtonPrimary';

const CREATE_ERROR_KEYS = {
  authRequired: 'createRoom.error.authRequired',
  alreadyInRoom: 'createRoom.error.alreadyInRoom',
  invalidInput: 'createRoom.error.invalidInput',
  unexpected: 'createRoom.error.unexpected',
} as const satisfies Record<
  'authRequired' | 'alreadyInRoom' | 'invalidInput' | 'unexpected',
  keyof Messages
>;

const FIELD_CLASSES =
  'w-full rounded border border-dwarf-border bg-dwarf-bg px-3 py-2.5 font-mono text-sm text-dwarf-parchment shadow-stone-inner transition-colors duration-150 focus:border-dwarf-gold focus:outline-none focus:ring-1 focus:ring-dwarf-gold';

/**
 * SALLE-01/05 create entry point for signed-in users: visibility, capacity
 * (2–30, the same bounds the server re-verifies) and the host's role. The
 * card is only rendered for authenticated users; guests see the AUTH-03
 * empty state instead — and the server refuses them anyway.
 */
export default function CreateRoomCard({ messages }: { messages: Messages }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createRoomFormAction, null);

  useEffect(() => {
    if (state?.ok) {
      router.push(`/rooms/${state.roomPublicId}`);
    }
  }, [state, router]);

  const error =
    state && !state.ok && state.error in CREATE_ERROR_KEYS
      ? CREATE_ERROR_KEYS[state.error as keyof typeof CREATE_ERROR_KEYS]
      : state && !state.ok
        ? ('createRoom.error.unexpected' as const)
        : null;

  return (
    <section
      className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl"
      aria-labelledby="create-room-title"
    >
      <div className="flex flex-col gap-space-xs">
        <h2
          id="create-room-title"
          className="font-headline-sm text-headline-sm uppercase tracking-wide text-primary"
        >
          {messages['createRoom.title']}
        </h2>
        <p className="font-label-sm text-label-sm text-dwarf-parchmentMuted">
          {messages['raceSection.createHint']}
        </p>
      </div>

      <form className="flex flex-col gap-space-sm" action={formAction} noValidate>
        <div className="flex flex-col gap-space-xs">
          <label
            htmlFor="create-room-visibility"
            className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted"
          >
            {messages['createRoom.visibilityLabel']}
          </label>
          <select id="create-room-visibility" name="visibility" defaultValue="public" className={FIELD_CLASSES}>
            <option value="public">{messages['createRoom.visibility.public']}</option>
            <option value="code">{messages['createRoom.visibility.code']}</option>
            <option value="private">{messages['createRoom.visibility.private']}</option>
          </select>
        </div>

        <div className="flex flex-col gap-space-xs">
          <label
            htmlFor="create-room-capacity"
            className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted"
          >
            {messages['createRoom.capacityLabel']}
          </label>
          <input
            id="create-room-capacity"
            name="capacity"
            type="number"
            min={2}
            max={30}
            defaultValue={10}
            required
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-space-xs">
          <label
            htmlFor="create-room-role"
            className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted"
          >
            {messages['createRoom.roleLabel']}
          </label>
          <select id="create-room-role" name="hostRole" defaultValue="participant" className={FIELD_CLASSES}>
            <option value="participant">{messages['createRoom.role.participant']}</option>
            <option value="spectator">{messages['createRoom.role.spectator']}</option>
          </select>
        </div>

        {error && (
          <p role="alert" className="text-xs font-medium text-dwarf-magma">
            {messages[error]}
          </p>
        )}

        <ButtonPrimary type="submit" disabled={pending} className="w-full">
          {pending ? messages['createRoom.submitPending'] : messages['createRoom.submit']}
        </ButtonPrimary>
      </form>
    </section>
  );
}
