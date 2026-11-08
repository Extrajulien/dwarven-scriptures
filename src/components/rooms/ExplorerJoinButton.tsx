'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { joinRoomByCode } from '../../app/rooms/actions';
import type { Messages } from '../../i18n/messages';
import ButtonSecondary from '../ButtonSecondary';

const ERROR_KEYS = {
  rateLimited: 'explorer.error.rateLimited',
  roomFull: 'explorer.error.roomFull',
  roomNotFound: 'explorer.error.roomNotFound',
  kicked: 'explorer.error.kicked',
  unexpected: 'explorer.error.unexpected',
} as const;

/**
 * JOIN-02 join button for one explorer row. Joining through the action gives
 * the typed feedback before navigating; `alreadyInRoom` and
 * `identityRequired` simply open the room page — a public room admits direct
 * access and the lobby collects the guest's nickname there (AUTH-02).
 */
export default function ExplorerJoinButton({
  roomPublicId,
  roomCode,
  messages,
}: {
  roomPublicId: string;
  roomCode: string;
  messages: Messages;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<keyof typeof ERROR_KEYS | null>(null);

  const handleJoin = async () => {
    setPending(true);
    setErrorKey(null);
    try {
      const result = await joinRoomByCode({ code: roomCode });
      if (result.ok) {
        router.push(`/rooms/${result.room.publicId}`);
        return;
      }
      if (result.error === 'alreadyInRoom' || result.error === 'identityRequired') {
        router.push(`/rooms/${roomPublicId}`);
        return;
      }
      setErrorKey(
        result.error === 'rateLimited'
          ? 'rateLimited'
          : result.error === 'roomFull'
            ? 'roomFull'
            : result.error === 'roomNotFound'
              ? 'roomNotFound'
              : result.error === 'kicked'
                ? 'kicked'
                : 'unexpected',
      );
    } catch {
      setErrorKey('unexpected');
    } finally {
      setPending(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-space-xs">
      <ButtonSecondary
        type="button"
        disabled={pending}
        onClick={() => void handleJoin()}
        className="px-space-md py-space-xs"
      >
        {pending ? messages['explorer.joinPending'] : messages['explorer.join']}
      </ButtonSecondary>
      {errorKey && (
        <span role="alert" className="font-label-sm text-label-sm text-dwarf-magma">
          {messages[ERROR_KEYS[errorKey]]}
        </span>
      )}
    </span>
  );
}
