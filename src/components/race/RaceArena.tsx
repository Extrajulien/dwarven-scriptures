'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Messages } from '../../i18n/messages';
import type { MemberInfo } from '../../realtime/protocol';
import { useRoomSocket } from '../../realtime/useRoomSocket';
import { storeRaceKeyErrors } from '../../lib/race/key-errors-store';
import ButtonPrimary from '../ButtonPrimary';
import ButtonSecondary from '../ButtonSecondary';
import BonusAnnouncer from './BonusAnnouncer';
import MobileRaceGate from './MobileRaceGate';
import OvertakeIndicator from './OvertakeIndicator';
import ProgressTrack from './ProgressTrack';
import { BONUS_MARKER_FLASH_MS, countdownSecondsRemaining } from './RaceScreen';
import Top3Panel from './Top3Panel';
import TypingZone from './TypingZone';

export type RaceArenaViewer =
  | { kind: 'user'; publicId: string; username: string }
  | { kind: 'guest'; nickname: string; guestToken: string };

type RaceArenaProps = {
  /** The room this race belongs to — also the return destination. */
  roomPublicId: string;
  /** Join credential: an active member reconnects with the room code. */
  roomCode: string;
  viewer: RaceArenaViewer;
  /** The viewer's room role; spectators never get a typing zone. */
  viewerRole: 'participant' | 'spectator';
  messages: Messages;
};

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-surface px-margin py-space-lg">
      {children}
    </main>
  );
}

/**
 * The full-screen race arena (`/race/[publicId]`) — the centered racing
 * surface that replaces the room-embedded race: the live track block (overtake
 * alerts, top-3, bonus announcements, progress track), the typing zone and
 * the "give up" button. Spectators (and a racer who gave up) keep the track
 * block as their leaderboard while the race runs.
 *
 * Navigation (COURSE-09): the arena exists only while a race is running.
 * Any terminal condition — the race finished (`raceFinished`, all humans
 * done), the race aborted, the room closed, or the member was kicked — sends
 * the viewer back to the room (`/rooms/[publicId]`) or home.
 */
export default function RaceArena({
  roomPublicId,
  roomCode,
  viewer,
  viewerRole,
  messages,
}: RaceArenaProps) {
  const router = useRouter();
  const { status, snapshot, error, race, join, quitRace, sendRaceProgress } = useRoomSocket();
  // RES-03: the LOCAL session's per-key error counts, fed by the typing zone
  // and handed to the results view (via session storage) when the race ends.
  const keyErrorsRef = useRef<Readonly<Record<string, number>>>({});
  const [quitLocal, setQuitLocal] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // BONUS-03: a fresh bonus event makes the targeted track marker glow for
  // ~2 s (mirrors RaceScreen's marker flash).
  const [prevBonusCount, setPrevBonusCount] = useState(0);
  const [flashTargetId, setFlashTargetId] = useState<string | null>(null);
  const bonusCount = race?.bonusLog.length ?? 0;
  if (prevBonusCount !== bonusCount) {
    setPrevBonusCount(bonusCount);
    const latest = race?.bonusLog[bonusCount - 1];
    if (latest !== undefined) {
      setFlashTargetId(latest.targetParticipantId);
    }
  }
  useEffect(() => {
    if (flashTargetId === null) {
      return;
    }
    const timer = setTimeout(() => setFlashTargetId(null), BONUS_MARKER_FLASH_MS);
    return () => clearTimeout(timer);
  }, [flashTargetId]);

  useEffect(() => {
    // React StrictMode (dev) remounts run mount → cleanup → mount; the hook's
    // cleanup closes the socket, so re-joining here is required (same pattern
    // as RoomLobby).
    join({ code: roomCode });
  }, [join, roomCode]);

  useEffect(() => {
    // The arena only exists while a race is running. Every terminal condition
    // bounces the member out: kicked → home with notice, any other fatal join
    // error → home, room closed / waiting / finished → back to the room.
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
    if (roomStatus === 'resultats') {
      router.replace(`/rooms/${roomPublicId}/results`);
      return;
    }
    if (race?.phase === 'resultats') {
      // RES-03: hand the local racer's per-key errors to the results view.
      storeRaceKeyErrors(roomPublicId, keyErrorsRef.current);
      router.replace(`/rooms/${roomPublicId}/results`);
      return;
    }
  }, [error, status, snapshot, race, roomPublicId, router]);

  // Countdown ticker (COURSE-03): the overlay re-reads the client clock 4×/s.
  useEffect(() => {
    if (race?.phase !== 'decompte') {
      return;
    }
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, [race?.phase]);

  const viewerParticipantId = viewer.kind === 'user' ? viewer.publicId : viewer.guestToken;
  const pfpUrls: Record<string, string | null> = Object.fromEntries(
    (snapshot?.members ?? [])
      .filter((member): member is Extract<MemberInfo, { kind: 'user' }> => member.kind === 'user')
      .map((member) => [member.publicId, member.pfpUrl]),
  );

  // Pre-join / reconnecting before the snapshot, or the resume snapshot still
  // in flight (a room racing in DÉCOMPTE/EN_COURSE answers `rejoinRace` with
  // a `raceSnapshot` right after the `roomSnapshot`).
  if (snapshot === null || race === null || race.phase === 'resultats') {
    return (
      <Centered>
        <p role="status" className="font-label-md text-label-md uppercase text-dwarf-parchmentMuted">
          {status === 'reconnecting' ? messages['lobby.reconnecting'] : messages['lobby.connecting']}
        </p>
      </Centered>
    );
  }

  const isRacing =
    race.phase === 'en_course' &&
    viewerRole === 'participant' &&
    !quitLocal &&
    race.ownProgress !== null;

  return (
    <Centered>
      <div className="flex w-full max-w-4xl flex-col items-center gap-space-lg">
        {race.phase === 'decompte' && (
          <>
            {race.text !== null && (
              <div className="w-full rounded bg-surface-container-lowest p-space-lg shadow-xl">
                <p
                  data-testid="race-text"
                  className="font-mono text-lg leading-relaxed break-words whitespace-pre-wrap text-on-surface-variant"
                >
                  {race.text}
                </p>
              </div>
            )}
            <div data-testid="countdown-overlay" className="flex flex-col items-center gap-space-sm">
              <span
                data-testid="countdown-number"
                className="font-mono text-6xl font-bold text-primary"
              >
                {Math.max(1, countdownSecondsRemaining(race.startAt, nowMs) ?? 1)}
              </span>
              <span className="font-label-md text-label-md uppercase text-on-surface-variant">
                {messages['race.countdownGetReady']}
              </span>
            </div>
          </>
        )}

        {race.phase === 'en_course' && (
          <>
            <div className="flex w-full min-w-0 flex-col gap-space-md">
              <OvertakeIndicator
                participants={race.participants}
                localParticipantId={viewerParticipantId}
                finishRanks={race.finishRanks}
                messages={messages}
              />
              <Top3Panel
                participants={race.participants}
                finishRanks={race.finishRanks}
                localParticipantId={viewerParticipantId}
                variant={viewerRole === 'participant' ? 'condensed' : 'normal'}
                pfpUrls={pfpUrls}
                flashParticipantId={flashTargetId}
                messages={messages}
              />
              <BonusAnnouncer
                bonusLog={race.bonusLog}
                participants={race.participants}
                localParticipantId={viewerParticipantId}
                messages={messages}
              />
              <ProgressTrack
                participants={race.participants}
                localParticipantId={viewerParticipantId}
                viewerRole={viewerRole}
                finishRanks={race.finishRanks}
                pfpUrls={pfpUrls}
                flashParticipantId={flashTargetId}
                messages={messages}
              />
            </div>

            {isRacing ? (
              <>
                {!confirmQuit ? (
                  <ButtonSecondary type="button" onClick={() => setConfirmQuit(true)}>
                    {messages['race.quitButton']}
                  </ButtonSecondary>
                ) : (
                  <div
                    data-testid="quit-confirm"
                    className="flex flex-col items-center gap-space-sm rounded bg-surface-container-lowest p-space-md shadow-xl"
                  >
                    <p role="alert" className="text-center font-label-sm text-label-sm text-dwarf-magma">
                      {messages['race.confirmQuitBody']}
                    </p>
                    <div className="flex gap-space-sm">
                      <ButtonPrimary
                        type="button"
                        onClick={() => {
                          setConfirmQuit(false);
                          setQuitLocal(true);
                          quitRace();
                        }}
                        className="px-space-sm py-space-xs"
                      >
                        {messages['lobby.confirm']}
                      </ButtonPrimary>
                      <ButtonSecondary
                        type="button"
                        onClick={() => setConfirmQuit(false)}
                        className="px-space-sm py-space-xs"
                      >
                        {messages['lobby.cancel']}
                      </ButtonSecondary>
                    </div>
                  </div>
                )}

                {/* DES-06: on mobile the typing zone is replaced by the
                    physical-keyboard notice; the track and the give-up button
                    stay available. */}
                <MobileRaceGate messages={messages}>
                  <TypingZone
                    key={`${race.startAt ?? 'none'}-${race.ownProgress?.validatedChars ?? 0}`}
                    text={race.text ?? ''}
                    errorMode={snapshot.room.config.errorMode}
                    enabled
                    initialProgress={race.ownProgress ?? undefined}
                    messages={messages}
                    onProgress={sendRaceProgress}
                    onKeyErrors={(errors) => {
                      keyErrorsRef.current = errors;
                    }}
                    bonusEvents={race.bonusLog.filter(
                      (event) => event.targetParticipantId === viewerParticipantId,
                    )}
                  />
                </MobileRaceGate>
              </>
            ) : (
              <div className="flex flex-col items-center gap-space-sm rounded bg-surface-container-lowest p-space-md shadow-xl">
                <span
                  data-testid="spectator-badge"
                  className="rounded bg-dwarf-basalt px-space-md py-space-xs font-label-md text-label-md uppercase text-dwarf-gold shadow-stone-inner"
                >
                  {messages['race.spectatorBadge']}
                </span>
                <p className="text-center font-label-md text-label-md text-dwarf-parchmentMuted">
                  {messages['race.spectatorViewHint']}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Centered>
  );
}
