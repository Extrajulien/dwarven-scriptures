'use client';

import Link from 'next/link';
import { quickPlay } from '../../app/rooms/actions';
import type { Messages } from '../../i18n/messages';
import ButtonPrimary from '../ButtonPrimary';
import ButtonSecondary from '../ButtonSecondary';
import Icon from '../Icon';
import SectionHeader from '../SectionHeader';
import CreateRoomCard from './CreateRoomCard';
import JoinByCodeForm, { type JoinViewer } from './JoinByCodeForm';

export type HomeNotice = 'kicked' | 'noRooms' | 'noRoomsGuest' | null;

const NOTICE_KEYS = {
  kicked: 'notice.kicked',
  noRooms: 'notice.noRooms',
  noRoomsGuest: 'notice.noRoomsGuest',
} as const satisfies Record<Exclude<HomeNotice, null>, keyof Messages>;

/**
 * Home "race cavern" block (JOIN-01/03, SALLE-01): quick play, join by code,
 * the explorer link and the create-room card. Guests get the AUTH-03 empty
 * state instead of the create card; quick play is a server action that picks
 * the fullest joinable public room and redirects (JOIN-03).
 */
export default function RaceSection({
  viewer,
  notice,
  messages,
}: {
  viewer: JoinViewer;
  notice: HomeNotice;
  messages: Messages;
}) {
  return (
    <section
      id="race-cavern"
      className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl"
    >
      <SectionHeader
        title={messages['raceSection.title']}
        subtitle={messages['raceSection.subtitle']}
        right={<Icon name="sprint" className="text-primary text-headline-md" />}
      />

      {notice && (
        <div
          role="status"
          className="flex items-center gap-space-sm rounded border border-dwarf-gold/40 bg-dwarf-slate px-space-md py-space-sm font-body-sm text-body-sm text-dwarf-parchment"
        >
          <Icon name="info" className="text-dwarf-gold" />
          {messages[NOTICE_KEYS[notice]]}
        </div>
      )}

      <div className="grid grid-cols-1 gap-space-md md:grid-cols-3">
        {/* Quick play (JOIN-03): server action, works without JavaScript. */}
        <section
          className="flex flex-col justify-between gap-space-md rounded bg-dwarf-slate p-space-lg shadow-stone-inner"
          aria-labelledby="quick-play-title"
        >
          <div className="flex flex-col gap-space-xs">
            <h2
              id="quick-play-title"
              className="font-headline-sm text-headline-sm uppercase tracking-wide text-dwarf-gold"
            >
              {messages['raceSection.quickPlayLabel']}
            </h2>
            <p className="font-label-sm text-label-sm text-dwarf-parchmentMuted">
              {messages['raceSection.quickPlayHint']}
            </p>
          </div>
          <form action={quickPlay}>
            <ButtonPrimary type="submit" className="w-full">
              <Icon name="sprint" className="text-headline-sm" />
              {messages['raceSection.quickPlayLabel']}
            </ButtonPrimary>
          </form>
          <Link
            href="/rooms"
            className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted transition-colors hover:text-dwarf-gold"
          >
            {messages['raceSection.explorerHint']} →
          </Link>
        </section>

        {/* Join by code (JOIN-01). */}
        <JoinByCodeForm viewer={viewer} messages={messages} />

        {/* Create room (SALLE-01/05); guests see the AUTH-03 empty state. */}
        {viewer?.kind === 'user' ? (
          <CreateRoomCard messages={messages} />
        ) : (
          <section
            className="flex flex-col gap-space-md rounded bg-dwarf-slate p-space-lg shadow-stone-inner"
            aria-labelledby="create-room-guest-title"
          >
            <h2
              id="create-room-guest-title"
              className="font-headline-sm text-headline-sm uppercase tracking-wide text-outline"
            >
              {messages['raceSection.createTitle']}
            </h2>
            <p className="font-body-sm text-body-sm text-dwarf-parchmentMuted">
              {messages['raceSection.guestEmpty']}
            </p>
            <p className="font-label-sm text-label-sm text-dwarf-parchmentMuted">
              {messages['raceSection.guestEmptyHint']}
            </p>
            <div className="pt-space-xs">
              <ButtonSecondary href="/login" className="w-full">
                {messages['guestNickname.signInInstead']}
              </ButtonSecondary>
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
