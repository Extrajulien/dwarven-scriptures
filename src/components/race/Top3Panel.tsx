'use client';

import { useMemo } from 'react';
import type { Messages } from '../../i18n/messages';
import { deriveRanking } from '../../lib/race/track';
import type { RaceTrackParticipant } from '../../realtime/client-types';

/**
 * Live top-3 panel (GAME-2 — the top 3 in absolute terms): a compact stone
 * panel showing ranks 1–3 with names and net WPM, derived **client-side**
 * from the latest `raceTick` participants via {@link deriveRanking} (the
 * server stays authoritative for the final standings — COURSE-10). The panel
 * updates on every tick and remains visible in spectator mode alongside the
 * track (COURSE-05).
 */

export type Top3PanelProps = {
  participants: RaceTrackParticipant[];
  finishRanks: Record<string, number>;
  localParticipantId: string;
  messages: Messages;
};

export default function Top3Panel({
  participants,
  finishRanks,
  localParticipantId,
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
        {top3.map((entry) => {
          const isLocal = entry.participantId === localParticipantId;
          return (
            <li
              key={entry.participantId}
              data-testid="top3-row"
              data-rank={entry.rank}
              data-local={isLocal ? 'true' : 'false'}
              className="flex min-w-0 items-center gap-space-sm rounded border border-dwarf-border/40 bg-dwarf-slate px-space-sm py-space-xs"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-dwarf-border bg-dwarf-basalt font-mono text-label-sm text-dwarf-gold">
                {entry.rank}
              </span>
              <span className="min-w-0 flex-1 truncate font-body-sm text-body-sm text-dwarf-parchment">
                {entry.displayName}
                {isLocal && (
                  <span className="ml-space-xs font-label-sm text-label-sm text-dwarf-gold">
                    ({messages['track.youTag']})
                  </span>
                )}
              </span>
              <span
                data-testid="top3-wpm"
                className="shrink-0 font-label-sm text-label-sm text-dwarf-gold"
              >
                {Math.round(entry.wpm)} {messages['race.liveWpmLabel']}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
