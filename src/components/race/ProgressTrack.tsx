'use client';

import { useMemo } from 'react';
import type { Messages } from '../../i18n/messages';
import { deriveRanking, type RankedTrackParticipant } from '../../lib/race/track';
import type { RaceTrackParticipant } from '../../realtime/client-types';
import TileRaceProgress from './TileRaceProgress';

/**
 * The tile-based progress track (DES-04, COURSE-05): every racing participant
 * mines their own row. The camera-follows "normal" (3-high) rectangle is the
 * local player's own progress visualizer while racing, and the "condensed"
 * (1-high) rectangle renders everyone else compactly so the track never eats
 * the screen.
 *
 * Role-based composition:
 * - **participant** — the local player gets a normal row (clearly "yours"),
 *   the other non-top-3 players get condensed rows (the top-3 live in
 *   {@link Top3Panel}).
 * - **spectator** — ranks 4+ get condensed rows (the top-3 are normal in
 *   {@link Top3Panel}).
 *
 * The server stays authoritative (COURSE-06): this component only *presents*
 * the tick's positions/track window and never produces competitive values.
 */

export type ProgressTrackProps = {
  participants: RaceTrackParticipant[];
  localParticipantId: string;
  /** Drives the normal-vs-condensed composition (racer vs spectator). */
  viewerRole: 'participant' | 'spectator';
  finishRanks: Record<string, number>;
  pfpUrls?: Record<string, string | null>;
  /** BONUS-03: the participant a bonus just hit — its row glows ~2 s. */
  flashParticipantId?: string | null;
  messages: Messages;
};

export default function ProgressTrack({
  participants,
  localParticipantId,
  viewerRole,
  finishRanks,
  pfpUrls = {},
  flashParticipantId = null,
  messages,
}: ProgressTrackProps) {
  const finishOrder = useMemo(
    () => new Map(Object.entries(finishRanks).map(([key, rank]) => [key, rank] as const)),
    [finishRanks],
  );
  const ranking = useMemo(() => deriveRanking(participants, finishOrder), [participants, finishOrder]);

  if (participants.length === 0) {
    return null;
  }

  const top3Ids = new Set(ranking.slice(0, 3).map((entry) => entry.participantId));

  const localEntry: RankedTrackParticipant | null =
    viewerRole === 'participant'
      ? (ranking.find((entry) => entry.participantId === localParticipantId) ?? null)
      : null;

  const condensedRows: RankedTrackParticipant[] =
    viewerRole === 'participant'
      ? ranking.filter(
          (entry) => entry.participantId !== localParticipantId && !top3Ids.has(entry.participantId),
        )
      : ranking.slice(3);

  const localRank = localEntry?.rank ?? null;

  return (
    <section
      data-testid="progress-track"
      aria-label={messages['track.title']}
      className="flex w-full min-w-0 flex-col gap-space-sm rounded bg-surface-container-lowest p-space-md shadow-xl"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-space-xs">
        <h2 className="font-label-md text-label-md uppercase text-dwarf-gold">
          {messages['track.title']}
        </h2>
        <span className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted">
          {messages['track.liveHint']}
        </span>
      </div>

      {localEntry !== null && (
        <TileRaceProgress
          participant={localEntry}
          variant="normal"
          isLocal
          finishRank={finishRanks[localEntry.participantId] ?? null}
          pfpUrl={pfpUrls[localEntry.participantId]}
          bonusFlash={localEntry.participantId === flashParticipantId}
          messages={messages}
        />
      )}

      {condensedRows.length > 0 && (
        <ol className="flex flex-col gap-space-xs">
          {condensedRows.map((entry) => (
            <li key={entry.participantId} className="min-w-0">
              <TileRaceProgress
                participant={entry}
                variant="condensed"
                isLocal={false}
                finishRank={finishRanks[entry.participantId] ?? null}
                pfpUrl={pfpUrls[entry.participantId]}
                bonusFlash={entry.participantId === flashParticipantId}
                messages={messages}
              />
            </li>
          ))}
        </ol>
      )}

      {/* GAME-3 tie-in: the local rank changes are announced to screen readers. */}
      <span aria-live="polite" data-testid="track-rank-announcer" className="sr-only">
        {localRank !== null ? `${messages['track.rankLabel']} ${localRank}` : ''}
      </span>
    </section>
  );
}
