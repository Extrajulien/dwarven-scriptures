'use client';

import { useMemo } from 'react';
import type { Messages } from '../../i18n/messages';
import { deriveRanking } from '../../lib/race/track';
import type { RaceTrackParticipant } from '../../realtime/client-types';
import TileRaceProgress from './TileRaceProgress';

/**
 * Live top-3 panel (GAME-2): ranks 1–3 derived **client-side** from the latest
 * `raceTick` via {@link deriveRanking}. Each row is a {@link TileRaceProgress}:
 * `condensed` (1 tile high) while the viewer is racing, `normal` (3 tiles high)
 * while spectating — so the leaders are the clearest thing on screen in
 * spectator mode (DES-04).
 */

export type Top3PanelProps = {
  participants: RaceTrackParticipant[];
  finishRanks: Record<string, number>;
  localParticipantId: string;
  /** `condensed` for racers, `normal` for spectators (default: `condensed`). */
  variant?: 'normal' | 'condensed';
  pfpUrls?: Record<string, string | null>;
  /** BONUS-03: the participant a bonus just hit — its row glows ~2 s. */
  flashParticipantId?: string | null;
  messages: Messages;
};

export default function Top3Panel({
  participants,
  finishRanks,
  localParticipantId,
  variant = 'condensed',
  pfpUrls = {},
  flashParticipantId = null,
  messages,
}: Top3PanelProps) {
  const finishOrder = useMemo(
    () => new Map(Object.entries(finishRanks).map(([key, rank]) => [key, rank] as const)),
    [finishRanks],
  );
  const ranking = useMemo(() => deriveRanking(participants, finishOrder), [participants, finishOrder]);
  const top3 = ranking.slice(0, 3);

  if (top3.length === 0) {
    return null;
  }

  return (
    <section
      data-testid="top3-panel"
      aria-label={messages['top3.title']}
      className="flex w-full min-w-0 flex-col gap-space-xs rounded bg-surface-container-lowest p-space-md shadow-xl"
    >
      <h2 className="font-label-md text-label-md uppercase text-dwarf-gold">
        {messages['top3.title']}
      </h2>
      <ol className="flex flex-col gap-space-xs">
        {top3.map((entry) => (
          <li
            key={entry.participantId}
            data-testid="top3-row"
            data-rank={entry.rank}
            data-local={entry.participantId === localParticipantId ? 'true' : 'false'}
            className="min-w-0"
          >
            <TileRaceProgress
              participant={entry}
              variant={variant}
              isLocal={entry.participantId === localParticipantId}
              finishRank={finishRanks[entry.participantId] ?? null}
              pfpUrl={pfpUrls[entry.participantId]}
              bonusFlash={entry.participantId === flashParticipantId}
              messages={messages}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
