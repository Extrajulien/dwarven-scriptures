import Link from 'next/link';
import type { PublicRoomForPage } from '../../db/queries/rooms';
import type { Messages } from '../../i18n/messages';
import { buildExplorerHref, type ExplorerFilters } from '../../lib/explorer-filters';
import SectionHeader from '../SectionHeader';
import ExplorerJoinButton from './ExplorerJoinButton';

const STATUS_KEYS = {
  en_attente: 'lobby.status.en_attente',
  decompte: 'lobby.status.decompte',
  en_course: 'lobby.status.en_course',
  resultats: 'lobby.status.resultats',
  fermee: 'lobby.status.fermee',
} as const;

function FilterLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'rounded bg-dwarf-gold px-space-sm py-space-xs font-label-sm text-label-sm uppercase text-dwarf-abyss'
          : 'rounded bg-dwarf-basalt px-space-sm py-space-xs font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted transition-colors hover:text-dwarf-gold'
      }
    >
      {label}
    </Link>
  );
}

/**
 * JOIN-02 presentational explorer: public rooms in `en_attente` with
 * participants/capacity, host, text language and complexity, status, and the
 * language/complexity filters. Pure props in, so it is testable without a
 * server; the page feeds it `listPublicRoomsForPage` and a client component
 * refreshes the route every few seconds (no manual reload).
 */
export default function RoomExplorer({
  rooms,
  filters,
  viewerIsGuest,
  messages,
}: {
  rooms: PublicRoomForPage[];
  filters: ExplorerFilters;
  viewerIsGuest: boolean;
  messages: Messages;
}) {
  const complexityLabel = (value: 'facile' | 'moyen' | 'difficile'): string =>
    value === 'facile'
      ? messages['lobby.complexity.facile']
      : value === 'moyen'
        ? messages['lobby.complexity.moyen']
        : messages['lobby.complexity.difficile'];

  return (
    <section
      className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl"
      aria-labelledby="explorer-title"
    >
      <SectionHeader
        title={messages['explorer.title']}
        subtitle={messages['explorer.subtitle']}
      />

      {/* Filters (JOIN-02): links preserve the other filter. */}
      <div className="flex flex-col gap-space-md sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-space-sm" role="group" aria-label={messages['explorer.filters.language']}>
          <span className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted">
            {messages['explorer.filters.language']}
          </span>
          <FilterLink
            href={buildExplorerHref(filters, { lang: null })}
            label={messages['explorer.filters.all']}
            active={filters.lang === null}
          />
          <FilterLink
            href={buildExplorerHref(filters, { lang: 'fr' })}
            label={messages['lobby.lang.fr']}
            active={filters.lang === 'fr'}
          />
          <FilterLink
            href={buildExplorerHref(filters, { lang: 'en' })}
            label={messages['lobby.lang.en']}
            active={filters.lang === 'en'}
          />
        </div>

        <div className="flex flex-wrap items-center gap-space-sm" role="group" aria-label={messages['explorer.filters.complexity']}>
          <span className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted">
            {messages['explorer.filters.complexity']}
          </span>
          <FilterLink
            href={buildExplorerHref(filters, { complexity: null })}
            label={messages['explorer.filters.all']}
            active={filters.complexity === null}
          />
          <FilterLink
            href={buildExplorerHref(filters, { complexity: 'facile' })}
            label={messages['lobby.complexity.facile']}
            active={filters.complexity === 'facile'}
          />
          <FilterLink
            href={buildExplorerHref(filters, { complexity: 'moyen' })}
            label={messages['lobby.complexity.moyen']}
            active={filters.complexity === 'moyen'}
          />
          <FilterLink
            href={buildExplorerHref(filters, { complexity: 'difficile' })}
            label={messages['lobby.complexity.difficile']}
            active={filters.complexity === 'difficile'}
          />
        </div>
      </div>

      {rooms.length === 0 ? (
        <p className="py-space-lg text-center font-body-sm text-body-sm text-dwarf-parchmentMuted">
          {viewerIsGuest ? messages['explorer.emptyGuest'] : messages['explorer.empty']}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-dwarf-border">
                <th scope="col" className="px-space-sm py-space-xs text-left font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted">
                  {messages['explorer.host']}
                </th>
                <th scope="col" className="px-space-sm py-space-xs text-left font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted">
                  {messages['explorer.participants']}
                </th>
                <th scope="col" className="px-space-sm py-space-xs text-left font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted">
                  {messages['explorer.language']}
                </th>
                <th scope="col" className="px-space-sm py-space-xs text-left font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted">
                  {messages['explorer.complexity']}
                </th>
                <th scope="col" className="px-space-sm py-space-xs text-left font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted">
                  {messages['explorer.status']}
                </th>
                <th scope="col" className="px-space-sm py-space-xs text-right font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted">
                  <span className="sr-only">{messages['explorer.join']}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.publicId} className="border-b border-dwarf-border/40 last:border-b-0">
                  <td className="px-space-sm py-space-sm font-body-sm text-body-sm text-dwarf-parchment">
                    {room.hostName}
                  </td>
                  <td className="px-space-sm py-space-sm font-mono text-body-sm text-dwarf-gold">
                    {room.participantCount} / {room.capacity}
                  </td>
                  <td className="px-space-sm py-space-sm font-body-sm text-body-sm text-dwarf-parchmentMuted">
                    {room.textLanguage === 'fr' ? messages['lobby.lang.fr'] : messages['lobby.lang.en']}
                  </td>
                  <td className="px-space-sm py-space-sm font-body-sm text-body-sm text-dwarf-parchmentMuted">
                    {complexityLabel(room.textComplexity)}
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
