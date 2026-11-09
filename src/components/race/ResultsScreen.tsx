'use client';

import type { Locale, Messages } from '../../i18n/messages';
import { formatNumber } from '../../i18n/format';
import type { RaceResultsView } from '../../realtime/client-types';
import SectionHeader from '../SectionHeader';
import RaceKeyboardHeatmap from './RaceKeyboardHeatmap';
import ResultsPodium from './ResultsPodium';
import ResultsTable from './ResultsTable';
import ResultsWpmChart from './ResultsWpmChart';

/**
 * The full results screen (RES-01..04): podium, complete table, the
 * WPM-over-time chart for every participant and the local player's keyboard
 * heatmap, plus the personal-record indicator. All data comes from the
 * server-validated `raceFinished` payload (COURSE-10) — the screen only
 * presents it; the per-key heatmap is the one client-side piece (the local
 * typing session's error counts, RES-03).
 *
 * Personal record (RES-04): `bestWpm` is the viewer's pre-race best (loaded
 * from the account profile by the room page); a beaten record shows the
 * badge. `null`/`0` (guests have no stats — AUTH-03, or no prior race)
 * hides the indicator. SP-3B's persistence will refresh this value after
 * each race; the comparison itself is final.
 */

export type ResultsScreenProps = {
  results: RaceResultsView;
  localParticipantId: string;
  pfpUrls?: Record<string, string | null>;
  /** Per-key error counts of the local session; `null` = unavailable. */
  keyErrors: Readonly<Record<string, number>> | null;
  /** The viewer's pre-race personal best (net WPM); `null` when unknown. */
  bestWpm: number | null;
  messages: Messages;
  locale: Locale;
};

/** RES-04 logic (pure, exported for tests): a record is beaten strictly. */
export function recordBeaten(
  ownWpm: number | null,
  bestWpm: number | null,
): boolean {
  return ownWpm !== null && bestWpm !== null && bestWpm > 0 && ownWpm > bestWpm;
}

export default function ResultsScreen({
  results,
  localParticipantId,
  pfpUrls = {},
  keyErrors,
  bestWpm,
  messages,
  locale,
}: ResultsScreenProps) {
  const ownEntry = results.results.find(
    (entry) => entry.participantId === localParticipantId,
  );
  const isRecord = recordBeaten(ownEntry?.wpm ?? null, bestWpm);

  return (
    <section className="flex w-full min-w-0 flex-col gap-space-md">
      <div className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
        <SectionHeader title={messages['results.title']} />
        {isRecord && ownEntry && bestWpm !== null && (
          <div
            data-testid="results-record"
            role="status"
            className="flex flex-wrap items-center gap-space-sm rounded border border-dwarf-gold bg-dwarf-gold/15 px-space-md py-space-sm"
          >
            <span className="font-label-md text-label-md uppercase text-dwarf-gold">
              {messages['results.record.beaten']}
            </span>
            <span className="font-label-sm text-label-sm text-dwarf-parchmentMuted">
              {messages['results.record.previousBest']}: {formatNumber(Math.round(bestWpm), locale)}{' '}
              {messages['race.liveWpmLabel']}
            </span>
          </div>
        )}
        <ResultsPodium results={results.results} messages={messages} locale={locale} pfpUrls={pfpUrls} />
        <ResultsTable
          results={results.results}
          localParticipantId={localParticipantId}
          messages={messages}
          locale={locale}
          pfpUrls={pfpUrls}
        />
      </div>
      <div className="grid grid-cols-1 gap-space-md lg:grid-cols-2">
        <ResultsWpmChart results={results.results} messages={messages} locale={locale} />
        <RaceKeyboardHeatmap keyErrors={keyErrors} messages={messages} locale={locale} />
      </div>
    </section>
  );
}
