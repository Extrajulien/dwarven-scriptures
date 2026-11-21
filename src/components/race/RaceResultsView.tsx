'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { Locale, Messages } from '../../i18n/messages';
import type { MemberInfo } from '../../realtime/protocol';
import { useRoomSocket } from '../../realtime/useRoomSocket';
import { readRaceKeyErrors } from '../../lib/race/key-errors-store';
import { closeRoom, leaveRoom } from '../../app/rooms/actions';
import ButtonSecondary from '../ButtonSecondary';
import SectionHeader from '../SectionHeader';
import ResultsScreen from './ResultsScreen';

export type RaceResultsViewer =
  | { kind: 'user'; publicId: string; username: string }
  | { kind: 'guest'; nickname: string; guestToken: string };

type RaceResultsViewProps = {
  /** The room this race belongs to — also the "return to room" destination. */
  roomPublicId: string;
  /** Join credential: an active member reconnects with the room code. */
  roomCode: string;
  viewer: RaceResultsViewer;
  /** The viewer's room role; spectators never get a keyboard heatmap. */
  viewerRole: 'participant' | 'spectator';
  /** The viewer's pre-race personal best net WPM (RES-04); `null` for guests. */
  viewerBestWpm: number | null;
  messages: Messages;
  locale: Locale;
};

/**
 * The dedicated race-results view (`/rooms/[publicId]/results`, RES-01..04,
 * COURSE-11): joins the room socket and shows only the results screen — no
 * lobby chrome. The standings arrive as the server's replayed `raceFinished`
 * (COURSE-11 replay, RES-05); the local per-key heatmap comes from the
 * session-storage map the race arena wrote on finish (`RES-03`, client-side).
 *
 * Navigation: the view exists only while the room shows results. A relaunch
 * (`decompte`/`en_course`) sends the member to the arena; a closed or waiting
 * room sends them back to the lobby; a kicked member is sent home.
 */
export default function RaceResultsView({
  roomPublicId,
  roomCode,
  viewer,
  viewerRole,
  viewerBestWpm,
  messages,
  locale,
}: RaceResultsViewProps) {
  const router = useRouter();
  const { status, snapshot, error, race, join, leave } = useRoomSocket();

  useEffect(() => {
    // React StrictMode (dev) remounts run mount → cleanup → mount; the hook's
    // cleanup closes the socket, so re-joining here is required (same pattern
    // as RoomLobby and RaceArena).
    join({ code: roomCode });
  }, [join, roomCode]);

  useEffect(() => {
    // The results view only exists while the room shows results. Any terminal
    // condition bounces the member out: kicked → home with notice, a fatal
    // join error → home, closed/waiting → the room lobby, and a relaunch →
    // the arena.
    if (error?.code === 'kicked') {
      router.replace('/race?notice=kicked');
      return;
    }
    if (error?.fatal) {
      router.replace('/');
      return;
    }
    if (status === 'closed') {
      router.replace(`/rooms/${roomPublicId}`);
      return;
    }
    const roomStatus = snapshot?.room.status ?? null;
    if (roomStatus === 'en_attente' || roomStatus === 'fermee') {
      router.replace(`/rooms/${roomPublicId}`);
      return;
    }
    if (race?.phase === 'decompte' || race?.phase === 'en_course') {
      router.replace(`/race/${roomPublicId}`);
      return;
    }
  }, [error, status, snapshot, race, roomPublicId, router]);

  const handleReturnToRoom = () => {
    router.replace(`/rooms/${roomPublicId}`);
  };

  const handleCloseRoom = async () => {
    await closeRoom({ roomPublicId: snapshot?.room.publicId ?? roomPublicId });
    // The hub broadcasts roomClosed; leaving the socket stops any reconnect.
    leave();
    router.replace(`/rooms/${roomPublicId}`);
  };

  const handleLeaveRoom = async () => {
    await leaveRoom({ roomPublicId: snapshot?.room.publicId ?? roomPublicId });
    leave();
    router.replace('/');
  };

  if (snapshot === null) {
    return (
      <div className="flex flex-col items-center gap-space-md py-space-xl" role="status">
        <p className="font-label-md text-label-md uppercase text-dwarf-parchmentMuted">
          {status === 'reconnecting' ? messages['lobby.reconnecting'] : messages['lobby.connecting']}
        </p>
      </div>
    );
  }

  const finished = race?.finished ?? null;

  if (finished !== null) {
    const isHost = viewer.kind === 'user' && snapshot.room.host.publicId === viewer.publicId;
    const viewerParticipantId = viewer.kind === 'user' ? viewer.publicId : viewer.guestToken;
    const pfpUrls: Record<string, string | null> = Object.fromEntries(
      (snapshot.members ?? [])
        .filter((member): member is Extract<MemberInfo, { kind: 'user' }> => member.kind === 'user')
        .map((member) => [member.publicId, member.pfpUrl]),
    );
    return (
      <ResultsScreen
        results={finished}
        localParticipantId={viewerParticipantId}
        pfpUrls={pfpUrls}
        keyErrors={viewerRole === 'participant' ? readRaceKeyErrors(roomPublicId) : null}
        bestWpm={viewerBestWpm}
        messages={messages}
        locale={locale}
        isHost={isHost}
        onReturnToRoom={handleReturnToRoom}
        onCloseRoom={() => void handleCloseRoom()}
        onLeaveRoom={() => void handleLeaveRoom()}
      />
    );
  }

  // No finished payload yet. A relaunch or a non-resultats room is handled by
  // the navigation effect above; keep a neutral state instead of flashing the
  // "unavailable" screen while that redirect lands.
  if (
    race?.phase === 'decompte' ||
    race?.phase === 'en_course' ||
    snapshot.room.status !== 'resultats'
  ) {
    return (
      <div className="flex flex-col items-center gap-space-md py-space-xl" role="status">
        <p className="font-label-md text-label-md uppercase text-dwarf-parchmentMuted">
          {status === 'reconnecting' ? messages['lobby.reconnecting'] : messages['lobby.connecting']}
        </p>
      </div>
    );
  }

  // Room is in `resultats` but no payload is in memory (e.g. server restart).
  // The persisted `/races/[publicId]` replay remains available from history.
  return (
    <section className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
      <SectionHeader title={messages['results.unavailable']} />
      <p
        data-testid="results-unavailable"
        className="font-body-sm text-body-sm text-dwarf-parchmentMuted"
      >
        {messages['results.unavailableHint']}
      </p>
      <div className="flex flex-wrap items-center gap-space-sm">
        <ButtonSecondary type="button" onClick={handleReturnToRoom}>
          {messages['results.returnToRoom']}
        </ButtonSecondary>
      </div>
    </section>
  );
}
