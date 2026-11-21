import type { PublicRoomForPage } from '../../db/queries/rooms';
import type { Messages } from '../../i18n/messages';
import ButtonPrimary from '../ButtonPrimary';
import SectionHeader from '../SectionHeader';
import ExplorerJoinButton from '../rooms/ExplorerJoinButton';

const STATUS_KEYS = {
  en_attente: 'lobby.status.en_attente',
  decompte: 'lobby.status.decompte',
  en_course: 'lobby.status.en_course',
  resultats: 'lobby.status.resultats',
  fermee: 'lobby.status.fermee',
} as const;

/**
 * Race-home public races list (JOIN-02): the waiting public rooms a visitor
 * can join from `/race`, sourced from the database. An empty list renders the
 * "no public races / Create one" empty state (SALLE-01) — the create button
 * scrolls signed-in users to the on-page create card and sends guests to
 * `/login` (AUTH-03).
 */
export default function PublicRacesList({
  rooms,
  viewerIsGuest,
  messages,
}: {
  rooms: PublicRoomForPage[];
  viewerIsGuest: boolean;
  messages: Messages;
}) {
  const complexityLabel = (value: PublicRoomForPage['textComplexity']): string =>
    value === 'facile'
      ? messages['lobby.complexity.facile']
      : value === 'moyen'
        ? messages['lobby.complexity.moyen']
        : messages['lobby.complexity.difficile'];

  return (
    <section className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
      <SectionHeader
        title={messages['raceHome.racesTitle']}
        subtitle={messages['explorer.subtitle']}
        level={2}
      />

      {rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-space-md py-space-xl text-center">
          <p className="font-body-sm text-body-sm text-dwarf-parchmentMuted">
            {messages['raceHome.empty']}
          </p>
          <ButtonPrimary href={viewerIsGuest ? '/login' : '#create-room'}>
            {messages['raceHome.createOne']}
          </ButtonPrimary>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-dwarf-border">
                <th
                  scope="col"
                  className="px-space-sm py-space-xs text-left font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted"
                >
                  {messages['raceHome.colCode']}
                </th>
                <th
                  scope="col"
                  className="px-space-sm py-space-xs text-left font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted"
                >
                  {messages['explorer.host']}
                </th>
                <th
                  scope="col"
                  className="px-space-sm py-space-xs text-left font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted"
                >
                  {messages['explorer.language']}
                </th>
                <th
                  scope="col"
                  className="px-space-sm py-space-xs text-left font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted"
                >
                  {messages['explorer.complexity']}
                </th>
                <th
                  scope="col"
                  className="px-space-sm py-space-xs text-left font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted"
                >
                  {messages['explorer.participants']}
                </th>
                <th
                  scope="col"
                  className="px-space-sm py-space-xs text-left font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted"
                >
                  {messages['explorer.status']}
                </th>
                <th
                  scope="col"
                  className="px-space-sm py-space-xs text-right font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted"
                >
                  <span className="sr-only">{messages['explorer.join']}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.publicId} className="border-b border-dwarf-border/40 last:border-b-0">
                  <td className="px-space-sm py-space-sm font-mono text-body-sm text-dwarf-gold">
                    {room.code}
                  </td>
                  <td className="px-space-sm py-space-sm font-body-sm text-body-sm text-dwarf-parchment">
                    {room.hostName}
                  </td>
                  <td className="px-space-sm py-space-sm font-body-sm text-body-sm text-dwarf-parchmentMuted">
                    {room.textLanguage === 'fr'
                      ? messages['lobby.lang.fr']
                      : messages['lobby.lang.en']}
                  </td>
                  <td className="px-space-sm py-space-sm font-body-sm text-body-sm text-dwarf-parchmentMuted">
                    {complexityLabel(room.textComplexity)}
                  </td>
                  <td className="px-space-sm py-space-sm font-mono text-body-sm text-dwarf-gold">
                    {room.participantCount} / {room.capacity}
                  </td>
                  <td className="px-space-sm py-space-sm font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted">
                    {room.status in STATUS_KEYS
                      ? messages[STATUS_KEYS[room.status as keyof typeof STATUS_KEYS]]
                      : messages['lobby.status.en_attente']}
                  </td>
                  <td className="px-space-sm py-space-sm text-right">
                    <ExplorerJoinButton
                      roomPublicId={room.publicId}
                      roomCode={room.code}
                      messages={messages}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
