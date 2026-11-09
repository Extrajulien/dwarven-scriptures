'use client';

import type { Locale, Messages } from '../../i18n/messages';
import { formatNumber } from '../../i18n/format';
import { localizeBotDisplayName } from '../../lib/race/bot-display';
import type { RaceResultEntry } from '../../realtime/protocol';
import UserAvatar from '../UserAvatar';
import GuestAvatar from '../rooms/GuestAvatar';

/**
 * Complete results table (RES-02): rank, participant (avatar + name; bots get
 * a stone rune, the localized level label and the BOT tag — BOT-04), net WPM,
 * raw WPM, accuracy, errors, time and localized status, plus the bonuses
 * column (always 0 until Phase 4 — the label is localized). All numbers go
 * through `src/i18n/format.ts` so fr/en viewers get their own separators
 * (I18N-03). The local player's row is highlighted.
 */

const STATUS_KEYS = {
  finished: 'race.results.status.finished',
  timeout: 'race.results.status.timeout',
  quit: 'race.results.status.quit',
} as const;

/** Elapsed time as locale-formatted seconds (e.g. `20,5 s` in fr). */
export function formatElapsedSeconds(ms: number, locale: Locale): string {
  const seconds = Math.max(0, ms) / 1_000;
  return `${formatNumber(seconds, locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} s`;
}

export default function ResultsTable({
  results,
  localParticipantId,
  messages,
  locale,
  pfpUrls,
}: {
  results: RaceResultEntry[];
  localParticipantId: string;
  messages: Messages;
  locale: Locale;
  pfpUrls: Record<string, string | null>;
}) {
  return (
    <section className="overflow-hidden rounded bg-surface-container-lowest shadow-xl">
      <div className="overflow-x-auto">
        <table data-testid="results-table" className="w-full min-w-[640px] border-collapse text-left">
          <caption className="sr-only">{messages['results.table.caption']}</caption>
          <thead>
            <tr className="border-b border-dwarf-border bg-dwarf-slate font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted">
              <th scope="col" className="px-space-md py-space-sm">
                {messages['results.table.rank']}
              </th>
              <th scope="col" className="px-space-md py-space-sm">
                {messages['results.table.participant']}
              </th>
              <th scope="col" className="px-space-md py-space-sm text-right">
                {messages['results.table.wpm']}
              </th>
              <th scope="col" className="px-space-md py-space-sm text-right">
                {messages['results.table.rawWpm']}
              </th>
              <th scope="col" className="px-space-md py-space-sm text-right">
                {messages['results.table.accuracy']}
              </th>
              <th scope="col" className="px-space-md py-space-sm text-right">
                {messages['results.table.errors']}
              </th>
              <th scope="col" className="px-space-md py-space-sm text-right">
                {messages['results.table.time']}
              </th>
              <th scope="col" className="px-space-md py-space-sm">
                {messages['results.table.status']}
              </th>
              <th scope="col" className="px-space-md py-space-sm text-right">
                {messages['results.table.bonuses']}
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((entry) => {
              const isLocal = entry.participantId === localParticipantId;
              return (
                <tr
                  key={entry.participantId}
                  data-testid="results-row"
                  data-rank={entry.rank}
                  data-local={isLocal ? 'true' : 'false'}
                  className={`border-b border-dwarf-border/40 last:border-b-0 ${
                    isLocal ? 'bg-dwarf-slate/60' : ''
                  }`}
                >
                  <td className="px-space-md py-space-sm font-mono font-bold text-dwarf-gold">
                    {formatNumber(entry.rank, locale)}
                  </td>
                  <td className="px-space-md py-space-sm">
                    <div className="flex min-w-0 items-center gap-space-sm">
                      {entry.kind === 'guest' ? (
                        <GuestAvatar
                          seed={entry.participantId}
                          className="h-8 w-8 shrink-0 text-body-md"
                        />
                      ) : entry.kind === 'bot' ? (
                        <span
                          data-testid="results-bot-rune"
                          aria-hidden="true"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-dwarf-border bg-dwarf-basalt font-display text-body-md text-dwarf-parchmentMuted"
                        >
                          {'ᛝ'}
                        </span>
                      ) : (
                        <UserAvatar
                          pfpUrl={pfpUrls[entry.participantId] ?? null}
                          username={entry.displayName}
                          className="h-8 w-8 shrink-0"
                          iconClassName="text-body-md"
                        />
                      )}
                      <span className="truncate font-body-sm text-body-sm text-dwarf-parchment">
                        {entry.kind === 'bot'
                          ? localizeBotDisplayName(entry.displayName, messages)
                          : entry.displayName}
                        {isLocal && (
                          <span className="ml-space-xs font-label-sm text-label-sm text-dwarf-gold">
                            ({messages['track.youTag']})
                          </span>
                        )}
                        {entry.kind === 'bot' && (
                          <span className="ml-space-xs rounded bg-dwarf-basalt px-space-xs font-label-sm text-label-sm uppercase text-dwarf-magma">
                            {messages['results.botTag']}
                          </span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-space-md py-space-sm text-right font-mono font-bold text-dwarf-gold">
                    {formatNumber(Math.round(entry.wpm), locale)}
                  </td>
                  <td className="px-space-md py-space-sm text-right font-mono text-dwarf-parchment">
                    {formatNumber(Math.round(entry.rawWpm), locale)}
                  </td>
                  <td className="px-space-md py-space-sm text-right font-mono text-dwarf-parchment">
                    {formatNumber(Math.round(entry.accuracy), locale)} %
                  </td>
                  <td className="px-space-md py-space-sm text-right font-mono text-dwarf-parchment">
                    {formatNumber(entry.errors, locale)}
                  </td>
                  <td className="px-space-md py-space-sm text-right font-mono text-dwarf-parchment">
                    {formatElapsedSeconds(entry.finishedAtMs, locale)}
                  </td>
                  <td className="px-space-md py-space-sm">
                    <span
                      data-testid="results-status"
                      className={`rounded px-space-xs py-px font-label-sm text-label-sm uppercase ${
                        entry.status === 'finished'
                          ? 'bg-dwarf-rune-badge text-dwarf-rune-bright'
                          : entry.status === 'timeout'
                            ? 'bg-secondary-container/60 text-secondary'
                            : 'bg-dwarf-basalt text-dwarf-parchmentMuted'
                      }`}
                    >
                      {messages[STATUS_KEYS[entry.status]]}
                    </span>
                  </td>
                  {/* Bonuses arrive in Phase 4 (BONUS-01..04): always 0 for now. */}
                  <td
                    data-testid="results-bonuses"
                    className="px-space-md py-space-sm text-right font-mono text-dwarf-parchmentMuted"
                  >
                    {formatNumber(0, locale)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
