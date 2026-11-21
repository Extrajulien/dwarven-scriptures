'use client';

import type { PublicRoomForPage } from '../../db/queries/rooms';
import type { Messages } from '../../i18n/messages';
import ButtonSecondary from '../ButtonSecondary';
import ExplorerJoinButton from '../rooms/ExplorerJoinButton';

/**
 * Compact joinable-rooms panel for the landing hero: the public rooms
 * currently in `en_attente`, each with its code, host, participant fill and a
 * join action. Reuses `ExplorerJoinButton` so joining behaves exactly like
 * the room explorer (JOIN-02) — public rooms admit direct access and the
 * lobby collects a guest's nickname there (AUTH-02).
 */
export default function JoinableRooms({
  rooms,
  messages,
}: {
  rooms: PublicRoomForPage[];
  messages: Messages;
}) {
  return (
    <section
      className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl"
      aria-labelledby="joinable-rooms-title"
    >
      <div className="flex items-center justify-between gap-space-sm border-b border-dwarf-divider pb-space-sm">
        <h2
          id="joinable-rooms-title"
          className="font-display text-headline-sm uppercase tracking-wide text-primary"
        >
          {messages['home.rooms.title']}
        </h2>
        <span
          data-testid="joinable-rooms-count"
          className="inline-flex shrink-0 items-center gap-space-xs rounded border border-dwarf-gold/40 bg-dwarf-gold/10 px-space-md py-space-xs font-label-sm text-label-sm uppercase text-dwarf-gold"
        >
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-tertiary animate-pulse" />
          {rooms.length} {messages['home.hero.roomsLive']}
        </span>
      </div>

      {rooms.length === 0 ? (
        <div className="flex flex-col gap-space-sm py-space-md">
          <p className="font-body-sm text-body-sm text-dwarf-parchmentMuted">
            {messages['home.rooms.empty']}
          </p>
          <ButtonSecondary href="/race" className="self-start">
            {messages['raceHome.createOne']}
          </ButtonSecondary>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-dwarf-divider">
          {rooms.slice(0, 5).map((room) => (
            <li
              key={room.publicId}
              className="flex items-center justify-between gap-space-md py-space-sm first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-col gap-space-xs">
                <span className="font-mono text-body-sm uppercase tracking-[0.25em] text-dwarf-gold">
                  {room.code}
                </span>
                <span className="truncate font-label-sm text-label-sm text-dwarf-parchmentMuted">
                  {room.hostName} · {room.participantCount}/{room.capacity}
                </span>
              </div>
              <ExplorerJoinButton
                roomPublicId={room.publicId}
                roomCode={room.code}
                messages={messages}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
