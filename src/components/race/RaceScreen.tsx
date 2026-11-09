'use client';

import { useEffect, useState } from 'react';
import type { Locale, Messages } from '../../i18n/messages';
import type { RaceProgress, RaceView } from '../../realtime/client-types';
import type { RoomStatus } from '../../realtime/protocol';
import type { RoomConfig } from '../../db/schema';
import ButtonPrimary from '../ButtonPrimary';
import ButtonSecondary from '../ButtonSecondary';
import SectionHeader from '../SectionHeader';
import MobileRaceGate from './MobileRaceGate';
import OvertakeIndicator from './OvertakeIndicator';
import ProgressTrack from './ProgressTrack';
import ResultsScreen from './ResultsScreen';
import Top3Panel from './Top3Panel';
import TypingZone from './TypingZone';

/**
 * The race screen (COURSE-03, GAME-1, COURSE-07 groundwork): the room page's
 * socket state is passed in as plain props (the hook lives in `RoomLobby`, so
 * there is exactly one WebSocket per client) and this component renders, per
 * room status:
 *
 * - `en_attente` — the launch panel: the host's `startRace` button, disabled
 *   with a reason when fewer than 2 participants are present (COURSE-02);
 * - `decompte` — the 3-2-1 countdown overlay, derived client-side from
 *   `race.startAt` and the client clock (no new server messages; the same
 *   math as `countdownSecondsRemaining` in `src/lib/race/state.ts`); the
 *   text is revealed (COURSE-03) but not yet typable;
 * - `en_course` — the `TypingZone` for a racing participant (via the keyed
 *   {@link RacerView}, so the local quit switch resets per race), or a
 *   spectator view (text visible, NO typing zone, badge). On mobile
 *   viewports (DES-06) the typing zone is replaced by
 *   {@link MobileRaceGate}'s physical-keyboard notice while the track and
 *   top-3 stay visible; the quit button and the host's start button are not
 *   typing input and remain available;
 * - `resultats` — the full results screen (RES-01..04): podium, complete
 *   table, WPM-over-time chart for all participants and the local player's
 *   keyboard heatmap, with the personal-record indicator. A viewer who
 *   joined after the race (no `raceFinished` payload) sees the honest
 *   "results unavailable" state — replay arrives with SP-3B persistence.
 *
 * All participants see the same text because every client renders
 * `race.text` from the same `countdownStarted`/`raceSnapshot` payload
 * (GAME-1, server-verified in SP-2B).
 */

/** Countdown length (COURSE-03: 3, 2, 1) — mirrored from `state.ts`. */
export const COUNTDOWN_SECONDS = 3;

/**
 * Seconds left on the countdown from `race.startAt` and the client clock —
 * the client-side re-implementation of the server's pure helper (same math:
 * `ceil(remaining / 1000)` clamped to `3…0`). `null` when there is no
 * typing start yet.
 */
export function countdownSecondsRemaining(startAt: string | null, nowMs: number): number | null {
  if (startAt === null) {
    return null;
  }
  const startAtMs = new Date(startAt).getTime();
  const remainingMs = startAtMs - nowMs;
  const seconds = Math.ceil(remainingMs / 1_000);
  return Math.min(COUNTDOWN_SECONDS, Math.max(0, seconds));
}

/** The race text as plain, read-only stone panel (spectator/result views). */
function RaceText({ text }: { text: string }) {
  return (
    <div className="rounded bg-surface-container-lowest p-space-lg shadow-xl">
      <p
        data-testid="race-text"
        className="font-mono text-lg leading-relaxed break-words whitespace-pre-wrap text-on-surface-variant"
      >
        {text}
      </p>
    </div>
  );
}

type RacerViewProps = {
  race: RaceView;
  config: RoomConfig;
  messages: Messages;
  onQuitRace: () => void;
  onSendProgress: (progress: RaceProgress) => void;
  onKeyErrors: (errors: Readonly<Record<string, number>>) => void;
};

/**
 * The EN_COURSE view of a racing participant: quit button + confirmation
 * dialog + the typing zone. The parent keys this view by the race's
 * `startAt`, so a new race mounts a fresh view (the local quit switch resets
 * naturally, without a reset effect), while a confirmed quit survives within
 * the race — the player stays a spectator until the next one (COURSE-07).
 */
function RacerView({ race, config, messages, onQuitRace, onSendProgress, onKeyErrors }: RacerViewProps) {
  const [confirmQuit, setConfirmQuit] = useState(false);
  // Local "instant spectator" switch: confirming the quit dialog flips the
  // local view to spectator immediately (the server then announces
  // `participantQuit` and the authoritative state follows).
  const [quitLocal, setQuitLocal] = useState(false);

  const handleQuit = () => {
    setConfirmQuit(false);
    setQuitLocal(true);
    onQuitRace();
  };

  if (quitLocal) {
    return (
      <section className="flex flex-col gap-space-md">
        <div className="flex flex-wrap items-center gap-space-md rounded bg-surface-container-lowest p-space-md shadow-xl">
          <span
            data-testid="spectator-badge"
            className="rounded bg-dwarf-basalt px-space-md py-space-xs font-label-md text-label-md uppercase text-dwarf-gold shadow-stone-inner"
          >
            {messages['race.spectatorBadge']}
          </span>
          <p className="font-label-md text-label-md text-dwarf-parchmentMuted">
            {messages['race.spectatorViewHint']}
          </p>
        </div>
        {race.text !== null && <RaceText text={race.text} />}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-space-md">
      {!confirmQuit ? (
        <div className="flex justify-end">
          <ButtonSecondary type="button" onClick={() => setConfirmQuit(true)}>
            {messages['race.quitButton']}
          </ButtonSecondary>
        </div>
      ) : (
        <div
          data-testid="quit-confirm"
          className="flex flex-col gap-space-sm rounded bg-surface-container-lowest p-space-md shadow-xl"
        >
          <p role="alert" className="font-label-sm text-label-sm text-dwarf-magma">
            {messages['race.confirmQuitBody']}
          </p>
          <div className="flex gap-space-sm">
            <ButtonPrimary type="button" onClick={handleQuit} className="px-space-sm py-space-xs">
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
      {/* DES-06: on mobile the typing zone is replaced by the physical-
          keyboard notice; the track + top-3 (and the quit button) stay.
          On desktop the zone renders exactly as before. */}
      <MobileRaceGate messages={messages}>
        <TypingZone
          key={`${race.startAt ?? 'none'}-${race.ownProgress?.validatedChars ?? 0}`}
          text={race.text ?? ''}
          errorMode={config.errorMode}
          enabled
          initialProgress={race.ownProgress ?? undefined}
          messages={messages}
          onProgress={onSendProgress}
          onKeyErrors={onKeyErrors}
        />
      </MobileRaceGate>
    </section>
  );
}

export type RaceScreenProps = {
  roomStatus: RoomStatus;
  /** The live race view from the socket; `null` while waiting. */
  race: RaceView | null;
  /** The room config snapshot (drives the typing zone's error mode, CONF-08). */
  config: RoomConfig;
  /** The viewer's own role in this room (participant vs spectator). */
  viewerRole: 'participant' | 'spectator';
  isHost: boolean;
  /** Present members with the participant role (bots are not members). */
  participantCount: number;
  /** The viewer's public id (users) or guest token (guests), for the own results line. */
  viewerParticipantId: string;
  /** participantId → profile picture URL for user participants (track avatars). */
  pfpUrls?: Record<string, string | null>;
  /** The viewer's pre-race personal best net WPM (RES-04); `null` for guests. */
  bestWpm: number | null;
  messages: Messages;
  /** Active UI locale, for the locale-aware result formatting (I18N-03). */
  locale: Locale;
  onStartRace: () => void;
  onQuitRace: () => void;
  onSendProgress: (progress: RaceProgress) => void;
  /** COURSE-11: the host closes the room from the results screen. */
  onCloseRoom: () => void;
  /** COURSE-11: non-hosts leave the room from the results screen. */
  onLeaveRoom: () => void;
};

export default function RaceScreen({
  roomStatus,
  race,
  config,
  viewerRole,
  isHost,
  participantCount,
  viewerParticipantId,
  pfpUrls = {},
  bestWpm,
  messages,
  locale,
  onStartRace,
  onQuitRace,
  onSendProgress,
  onCloseRoom,
  onLeaveRoom,
}: RaceScreenProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  // RES-03: the LOCAL session's per-key error counts, fed by the typing zone
  // on every wrong keystroke (client-side; the server only sees counters).
  const [keyErrors, setKeyErrors] = useState<Readonly<Record<string, number>>>({});

  // Countdown ticker: the overlay re-reads the client clock 4×/s.
  useEffect(() => {
    if (roomStatus !== 'decompte') {
      return;
    }
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, [roomStatus]);

  if (roomStatus === 'resultats') {
    // RES-01..04: the full results screen from the `raceFinished` payload.
    // A viewer who joined after the race never received that payload
    // (replay is SP-3B persistence) — show the honest empty state.
    const finished = race?.finished ?? null;
    if (finished === null) {
      return (
        <section className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
          <SectionHeader title={messages['results.unavailable']} />
          <p
            data-testid="results-unavailable"
            className="font-body-sm text-body-sm text-dwarf-parchmentMuted"
          >
            {messages['results.unavailableHint']}
          </p>
        </section>
      );
    }
    return (
      <ResultsScreen
        results={finished}
        localParticipantId={viewerParticipantId}
        pfpUrls={pfpUrls}
        keyErrors={viewerRole === 'participant' ? keyErrors : null}
        bestWpm={bestWpm}
        messages={messages}
        locale={locale}
        isHost={isHost}
        participantCount={participantCount}
        onRelaunch={onStartRace}
        onCloseRoom={onCloseRoom}
        onLeaveRoom={onLeaveRoom}
      />
    );
  }

  if (roomStatus === 'en_attente' || roomStatus === 'fermee' || race === null) {
    // Waiting: the host launches (COURSE-02 gating), everyone else waits.
    const needsMore = participantCount < 2;
    return (
      <section className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
        <SectionHeader title={messages['race.waitingTitle']} />
        {isHost ? (
          <div className="flex flex-col gap-space-sm">
            <ButtonPrimary type="button" disabled={needsMore} onClick={onStartRace}>
              {messages['race.startButton']}
            </ButtonPrimary>
            {needsMore && (
              <p
                data-testid="race-need-participants"
                className="font-label-sm text-label-sm text-dwarf-magma"
              >
                {messages['race.needParticipants']}
              </p>
            )}
          </div>
        ) : (
          <p className="font-label-md text-label-md text-dwarf-parchmentMuted">
            {messages['race.waitingHost']}
          </p>
        )}
      </section>
    );
  }

  if (roomStatus === 'decompte') {
    // COURSE-03: text revealed, countdown derived from startAt + client clock.
    const seconds = countdownSecondsRemaining(race.startAt, nowMs) ?? 1;
    return (
      <section className="relative flex flex-col gap-space-md">
        {race.text !== null && <RaceText text={race.text} />}
        <div
          data-testid="countdown-overlay"
          className="absolute inset-0 z-10 flex items-center justify-center rounded bg-background/85"
        >
          <div className="flex flex-col items-center gap-space-sm">
            <span
              data-testid="countdown-number"
              className="font-mono font-bold text-headline-xl-mobile text-primary sm:text-headline-xl"
            >
              {Math.max(1, seconds)}
            </span>
            <span className="font-label-md text-label-md uppercase text-on-surface-variant">
              {messages['race.countdownGetReady']}
            </span>
          </div>
        </div>
      </section>
    );
  }

  if (roomStatus === 'en_course') {
    // COURSE-05 / GAME-2/3: the track block (overtake warning + live top-3 +
    // the dwarf-cave progress track) rides above the typing work for every
    // viewer — participants AND spectators — fed by the same `raceTick` data.
    const trackBlock = (
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
          messages={messages}
        />
        <ProgressTrack
          participants={race.participants}
          lastTickAt={race.lastTickAt}
          totalLength={race.totalLength}
          localParticipantId={viewerParticipantId}
          finishRanks={race.finishRanks}
          pfpUrls={pfpUrls}
          messages={messages}
        />
      </div>
    );
    if (viewerRole === 'spectator') {
      // Spectator: the track + top-3 stay visible, text visible, NO typing zone.
      return (
        <section className="flex w-full min-w-0 flex-col gap-space-md">
          {trackBlock}
          <div className="flex flex-wrap items-center gap-space-md rounded bg-surface-container-lowest p-space-md shadow-xl">
            <span
              data-testid="spectator-badge"
              className="rounded bg-dwarf-basalt px-space-md py-space-xs font-label-md text-label-md uppercase text-dwarf-gold shadow-stone-inner"
            >
              {messages['race.spectatorBadge']}
            </span>
            <p className="font-label-md text-label-md text-dwarf-parchmentMuted">
              {messages['race.spectatorViewHint']}
            </p>
          </div>
          {race.text !== null && <RaceText text={race.text} />}
        </section>
      );
    }
    return (
      <section className="flex w-full min-w-0 flex-col gap-space-md">
        {trackBlock}
        <RacerView
          key={race.startAt ?? 'racer'}
          race={race}
          config={config}
          messages={messages}
          onQuitRace={onQuitRace}
          onSendProgress={onSendProgress}
          onKeyErrors={setKeyErrors}
        />
      </section>
    );
  }

  // Every non-resultats status below requires a live race view: the resultats
  // branch above handles the finished race, the en_attente branch above the
  // waiting room — what remains is the racing view.
  throw new Error('unreachable: unexpected room status in RaceScreen');
}
