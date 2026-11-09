'use client';

import { useEffect, useState } from 'react';
import type { Messages } from '../../i18n/messages';
import type { RaceProgress, RaceView } from '../../realtime/client-types';
import type { RoomStatus } from '../../realtime/protocol';
import type { RoomConfig } from '../../db/schema';
import ButtonPrimary from '../ButtonPrimary';
import ButtonSecondary from '../ButtonSecondary';
import SectionHeader from '../SectionHeader';
import OvertakeIndicator from './OvertakeIndicator';
import ProgressTrack from './ProgressTrack';
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
 *   spectator view (text visible, NO typing zone, badge);
 * - `resultats` — a clearly-marked **provisional** results placeholder
 *   (top-3 + own line). The full results screen is Phase 3 (RES-01/02);
 *   this placeholder is explicitly labelled as provisional in code and i18n.
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

const RESULT_STATUS_KEYS = {
  finished: 'race.results.status.finished',
  timeout: 'race.results.status.timeout',
  quit: 'race.results.status.quit',
} as const;

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
};

/**
 * The EN_COURSE view of a racing participant: quit button + confirmation
 * dialog + the typing zone. The parent keys this view by the race's
 * `startAt`, so a new race mounts a fresh view (the local quit switch resets
 * naturally, without a reset effect), while a confirmed quit survives within
 * the race — the player stays a spectator until the next one (COURSE-07).
 */
function RacerView({ race, config, messages, onQuitRace, onSendProgress }: RacerViewProps) {
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
      <TypingZone
        key={`${race.startAt ?? 'none'}-${race.ownProgress?.validatedChars ?? 0}`}
        text={race.text ?? ''}
        errorMode={config.errorMode}
        enabled
        initialProgress={race.ownProgress ?? undefined}
        messages={messages}
        onProgress={onSendProgress}
      />
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
  messages: Messages;
  onStartRace: () => void;
  onQuitRace: () => void;
  onSendProgress: (progress: RaceProgress) => void;
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
  messages,
  onStartRace,
  onQuitRace,
  onSendProgress,
}: RaceScreenProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Countdown ticker: the overlay re-reads the client clock 4×/s.
  useEffect(() => {
    if (roomStatus !== 'decompte') {
      return;
    }
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, [roomStatus]);

  if (roomStatus === 'en_attente' || race === null) {
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
        />
      </section>
    );
  }

  // resultats — PROVISIONAL placeholder. The full results screen with the
  // podium, the complete table, charts and relaunch is Phase 3 (RES-01/02,
  // COURSE-11); this card only proves the end-to-end data path.
  const results = race.finished?.results ?? [];
  const top3 = results.slice(0, 3);
  const ownEntry = results.find((entry) => entry.participantId === viewerParticipantId);
  return (
    <section className="flex flex-col gap-space-md">
      <div className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
        <SectionHeader title={messages['race.resultsTitle']} />
        <p
          data-testid="results-provisional"
          className="font-label-sm text-label-sm text-dwarf-parchmentMuted"
        >
          {messages['race.resultsProvisional']}
        </p>

        {top3.length > 0 && (
          <ol className="flex flex-col gap-space-xs">
            {top3.map((entry) => (
              <li
                key={entry.participantId}
                className="flex flex-wrap items-baseline justify-between gap-space-xs border-b border-dwarf-border/40 py-space-xs last:border-b-0"
              >
                <span className="font-body-sm text-body-sm text-dwarf-parchment">
                  {entry.rank}. {entry.displayName}
                </span>
                <span className="font-label-sm text-label-sm text-dwarf-gold">
                  {Math.round(entry.wpm)} {messages['race.liveWpmLabel']}
                </span>
              </li>
            ))}
          </ol>
        )}

        {ownEntry && (
          <div className="border-t border-dwarf-border pt-space-sm">
            <span className="font-label-sm text-label-sm uppercase text-dwarf-gold">
              {messages['race.resultsYourRace']}
            </span>
            <div className="flex flex-wrap gap-space-md font-label-sm text-label-sm text-dwarf-parchmentMuted">
              <span>
                {messages['race.liveWpmLabel']}: {Math.round(ownEntry.wpm)}
              </span>
              <span>
                {messages['race.liveAccuracyLabel']}: {Math.round(ownEntry.accuracy)}%
              </span>
              <span>{messages[RESULT_STATUS_KEYS[ownEntry.status]]}</span>
            </div>
          </div>
        )}
      </div>
      {race.text !== null && <RaceText text={race.text} />}
    </section>
  );
}
