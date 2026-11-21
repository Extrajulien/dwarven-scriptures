'use client';

import type { Messages } from '../../i18n/messages';
import { localizeBotDisplayName } from '../../lib/race/bot-display';
import type { RankedTrackParticipant } from '../../lib/race/track';
import type { RaceTrackParticipant } from '../../realtime/client-types';
import { resolveCellSprites } from '../../sprites/autoTileEvaluator';
import { LayeredTileCell } from '../../sprites/LayeredTileCell';
import { buildNormalGrid, NORMAL_GRID_COLUMNS } from '../../lib/race/mine-view';
import UserAvatar from '../UserAvatar';
import GuestAvatar from '../rooms/GuestAvatar';

/**
 * One participant's tile-based progress rectangle (DES-04, COURSE-05).
 *
 * - `normal` (3 tiles high): the camera-follows miner — profile picture (a
 *   little smaller than a tile) centered on the current block of the center
 *   column, floor behind, streamed tiles ahead up to the last column, then
 *   floor again (the end of the tunnel).
 * - `condensed` (1 tile high): a full-width progress bar — the mined floor
 *   fills from the left proportionally to the participant's progression, the
 *   miner rides the boundary, and the player name sits in the top-left corner.
 *
 * The component is presentational: it derives the render window from the
 * participant's `position` + `track` via the pure `mine-view` builders, and
 * never mutates or re-derives competitive values (COURSE-06).
 */

const TILE_SIZE = 32;

function ParticipantAvatar({
  participant,
  pfpUrl,
  sizeClass,
}: {
  participant: RaceTrackParticipant;
  pfpUrl?: string | null;
  sizeClass: string;
}) {
  switch (participant.kind) {
    case 'user':
      return (
        <UserAvatar
          pfpUrl={pfpUrl ?? null}
          username={participant.displayName}
          className={sizeClass}
          iconClassName="text-headline-sm"
        />
      );
    case 'guest':
      return <GuestAvatar seed={participant.participantId} className={sizeClass} />;
    case 'bot':
      // Distinct muted stone rune (BOT-04).
      return (
        <span
          data-testid="track-marker-bot"
          aria-hidden="true"
          className={`flex items-center justify-center rounded border border-dwarf-border bg-dwarf-basalt font-display text-dwarf-parchmentMuted ${sizeClass}`}
        >
          {'ᛝ'}
        </span>
      );
  }
}

export type TileRaceProgressProps = {
  participant: RankedTrackParticipant;
  variant: 'normal' | 'condensed';
  isLocal: boolean;
  finishRank: number | null;
  pfpUrl?: string | null;
  bonusFlash?: boolean;
  messages: Messages;
};

export default function TileRaceProgress({
  participant,
  variant,
  isLocal,
  finishRank,
  pfpUrl,
  bonusFlash = false,
  messages,
}: TileRaceProgressProps) {
  const displayName =
    participant.kind === 'bot'
      ? localizeBotDisplayName(participant.displayName, messages)
      : participant.displayName;
  const gold = participant.gold ?? 0;
  const ariaLabel = [
    `${messages['track.rankLabel']} ${participant.rank}`,
    displayName,
    `${Math.round(participant.wpm)} ${messages['race.liveWpmLabel']}`,
    `${gold} ${messages['track.goldLabel']}`,
    finishRank !== null ? `${messages['track.finishLabel']} ${finishRank}` : null,
  ]
    .filter(Boolean)
    .join(' — ');

  const isTop3 = participant.rank <= 3;

  if (variant === 'condensed') {
    const progressFraction =
      participant.totalLength > 0
        ? Math.min(1, Math.max(0, participant.position / participant.totalLength))
        : 0;
    const boundaryPct = progressFraction * 100;

    return (
      <div
        data-testid={`track-row-${participant.participantId}`}
        data-rank={participant.rank}
        data-local={isLocal ? 'true' : 'false'}
        data-variant="condensed"
        data-finished={participant.finished ? 'true' : 'false'}
        data-bonus-flash={bonusFlash ? 'true' : 'false'}
        role="group"
        aria-label={ariaLabel}
        className={`flex w-full min-w-0 flex-col gap-space-xs rounded border border-dwarf-border/40 bg-dwarf-slate px-space-sm py-space-xs ${
          bonusFlash ? 'ring-2 ring-dwarf-rune-bright animate-pulse' : ''
        }`}
      >
        <div className="flex w-full min-w-0 items-center justify-between gap-space-xs">
          <span className="min-w-0 truncate font-label-sm text-label-sm text-dwarf-parchment">
            <span className="font-mono text-dwarf-gold">{participant.rank}.</span> {displayName}
            {isLocal && (
              <span className="ml-space-xs font-label-sm text-label-sm text-dwarf-gold">
                ({messages['track.youTag']})
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-space-sm font-label-sm text-label-sm text-dwarf-parchmentMuted">
            <span data-testid="top3-wpm">
              {Math.round(participant.wpm)} {messages['race.liveWpmLabel']}
            </span>
            <span data-testid="track-gold" className="text-dwarf-gold">
              {gold} {messages['track.goldLabel']}
            </span>
          </span>
        </div>

        <div className="relative h-8 w-full overflow-hidden rounded-sm border border-dwarf-border bg-dwarf-basalt">
          <div
            data-testid="track-progress-fill"
            className="absolute inset-y-0 left-0 bg-dwarf-track"
            style={{ width: `${boundaryPct}%` }}
          />
          <div
            data-testid="track-miner"
            aria-hidden="true"
            className="absolute"
            style={{ left: `${boundaryPct}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
          >
            <ParticipantAvatar participant={participant} pfpUrl={pfpUrl} sizeClass="h-6 w-6" />
          </div>
        </div>
      </div>
    );
  }

  // Normal (3-high) variant.
  const view = buildNormalGrid(participant);
  return (
    <div
      data-testid={`track-row-${participant.participantId}`}
      data-rank={participant.rank}
      data-local={isLocal ? 'true' : 'false'}
      data-variant="normal"
      data-top3={isTop3 ? 'true' : 'false'}
      data-finished={participant.finished ? 'true' : 'false'}
      data-bonus-flash={bonusFlash ? 'true' : 'false'}
      role="group"
      aria-label={ariaLabel}
      className={`flex min-w-0 flex-col gap-space-xs rounded bg-surface-container-lowest p-space-xs shadow-xl ${
        isLocal
          ? 'ring-2 ring-dwarf-gold'
          : bonusFlash
            ? 'ring-2 ring-dwarf-rune-bright animate-pulse'
            : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-space-sm">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-dwarf-border bg-dwarf-basalt font-mono text-label-sm text-dwarf-gold">
          {participant.rank}
        </span>
        {finishRank !== null && (
          <span
            data-testid="track-finish-badge"
            className="rounded bg-dwarf-gold px-1 font-mono text-[10px] font-bold leading-4 text-dwarf-abyss"
          >
            {finishRank}
          </span>
        )}
        <span
          className={`min-w-0 flex-1 truncate text-left font-body-sm text-body-sm ${
            isTop3 || isLocal ? 'text-dwarf-gold' : 'text-dwarf-parchment'
          }`}
        >
          {displayName}
          {isLocal && (
            <span
              data-testid="track-you-tag"
              className="ml-space-xs rounded bg-dwarf-gold px-1 font-label-sm text-label-sm font-bold uppercase text-dwarf-abyss"
            >
              {messages['track.youTag']}
            </span>
          )}
        </span>
        <span
          data-testid="track-wpm-chip"
          className="max-w-full truncate rounded bg-dwarf-slate px-1 font-label-sm text-label-sm text-on-surface"
        >
          {Math.round(participant.wpm)} {messages['race.liveWpmLabel']}
        </span>
        <span
          data-testid="track-gold"
          className="shrink-0 font-label-sm text-label-sm text-dwarf-gold"
        >
          {gold} {messages['track.goldLabel']}
        </span>
      </div>

      <div className="relative overflow-hidden rounded-sm border border-dwarf-border bg-dwarf-track">
        <div
          className="inline-grid"
          style={{
            gridTemplateColumns: `repeat(${NORMAL_GRID_COLUMNS}, ${TILE_SIZE}px)`,
          }}
        >
          {view.grid.map((row, r) =>
            row.map((_, c) => (
              <LayeredTileCell
                key={`${r}-${c}`}
                layers={resolveCellSprites(view.grid, r, c)}
                scale={1}
              />
            )),
          )}
        </div>
        <div
          data-testid="track-miner"
          aria-hidden="true"
          className="pointer-events-none absolute flex items-center justify-center"
          style={{
            left: view.miner.col * TILE_SIZE,
            top: view.miner.row * TILE_SIZE,
            width: TILE_SIZE,
            height: TILE_SIZE,
          }}
        >
          <ParticipantAvatar participant={participant} pfpUrl={pfpUrl} sizeClass="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}
