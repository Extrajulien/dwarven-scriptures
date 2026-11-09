'use client';

import type { Locale, Messages } from '../../i18n/messages';
import { formatNumber } from '../../i18n/format';
import type { RaceResultEntry } from '../../realtime/protocol';
import UserAvatar from '../UserAvatar';
import GuestAvatar from '../rooms/GuestAvatar';

/**
 * Top-3 podium (RES-01): three dwarf stone pedestals — 1st in the middle
 * (tallest, gold-edged), 2nd left, 3rd right. Sprite/stone styling only, no
 * emojis (DES-04). The final standings come from the server-validated
 * `raceFinished` payload (COURSE-10); the podium only presents them.
 */

/** Visual order of the three pedestals (1st in the middle). */
const PODIUM_ORDER = [2, 1, 3] as const;

const PLACE_HEIGHTS: Record<number, string> = {
  1: 'h-40 sm:h-44',
  2: 'h-28 sm:h-32',
  3: 'h-20 sm:h-24',
};

function ParticipantAvatar({
  entry,
  pfpUrls,
}: {
  entry: RaceResultEntry;
  pfpUrls: Record<string, string | null>;
}) {
  if (entry.kind === 'guest') {
    return <GuestAvatar seed={entry.participantId} className="h-12 w-12 text-headline-md" />;
  }
  return (
    <UserAvatar
      pfpUrl={pfpUrls[entry.participantId] ?? null}
      username={entry.displayName}
      className="h-12 w-12"
      iconClassName="text-headline-md"
    />
  );
}

export default function ResultsPodium({
  results,
  messages,
  locale,
  pfpUrls,
}: {
  results: RaceResultEntry[];
  messages: Messages;
  locale: Locale;
  pfpUrls: Record<string, string | null>;
}) {
  const top3 = results.slice(0, 3);
  if (top3.length === 0) {
    return null;
  }
  const byRank = new Map(top3.map((entry) => [entry.rank, entry] as const));

  return (
    <section
      data-testid="results-podium"
      aria-label={messages['results.podium.title']}
      className="rounded bg-surface-container-lowest p-space-lg shadow-xl"
    >
      <h2 className="font-label-md text-label-md uppercase text-dwarf-gold">
        {messages['results.podium.title']}
      </h2>
      <div className="flex items-end justify-center gap-space-md pt-space-lg">
        {PODIUM_ORDER.map((rank) => {
          const entry = byRank.get(rank);
          if (!entry) {
            return null;
          }
          const isWinner = rank === 1;
          return (
            <div
              key={entry.participantId}
              data-testid="results-podium-place"
              data-rank={rank}
              className="flex w-28 min-w-0 flex-col items-center gap-space-sm sm:w-36"
            >
              <div className="flex flex-col items-center gap-space-xs text-center">
                <ParticipantAvatar entry={entry} pfpUrls={pfpUrls} />
                <span className="max-w-full truncate font-body-sm text-body-sm text-dwarf-parchment">
                  {entry.displayName}
                  {entry.kind === 'bot' && (
                    <span className="ml-space-xs font-label-sm text-label-sm text-dwarf-magma">
                      {messages['results.botTag']}
                    </span>
                  )}
                </span>
                <span
                  data-testid="results-podium-wpm"
                  className={`font-label-md text-label-md uppercase ${
                    isWinner ? 'text-dwarf-gold' : 'text-dwarf-parchmentMuted'
                  }`}
                >
                  {formatNumber(Math.round(entry.wpm), locale)} {messages['race.liveWpmLabel']}
                </span>
              </div>
              <div
                className={`flex w-full items-start justify-center rounded-t border border-b-0 pt-space-sm shadow-stone-inner ${PLACE_HEIGHTS[rank]} ${
                  isWinner
                    ? 'border-dwarf-gold bg-dwarf-basalt'
                    : 'border-dwarf-border bg-dwarf-slate'
                }`}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded border font-mono font-bold ${
                    isWinner
                      ? 'border-dwarf-gold bg-dwarf-gold text-dwarf-goldInk'
                      : 'border-dwarf-border bg-dwarf-basalt text-dwarf-parchmentMuted'
                  }`}
                >
                  {formatNumber(rank, locale)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
