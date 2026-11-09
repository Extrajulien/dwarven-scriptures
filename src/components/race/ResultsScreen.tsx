'use client';

import { useState } from 'react';
import type { Locale, Messages } from '../../i18n/messages';
import { formatNumber } from '../../i18n/format';
import type { RaceResultsView } from '../../realtime/client-types';
import ButtonPrimary from '../ButtonPrimary';
import ButtonSecondary from '../ButtonSecondary';
import SectionHeader from '../SectionHeader';
import RaceKeyboardHeatmap from './RaceKeyboardHeatmap';
import ResultsPodium from './ResultsPodium';
import ResultsTable from './ResultsTable';
import ResultsWpmChart from './ResultsWpmChart';

/**
 * The full results screen (RES-01..04, COURSE-11): podium, complete table,
 * the WPM-over-time chart for every participant and the local player's
 * keyboard heatmap, plus the personal-record indicator. All data comes from
 * the server-validated `raceFinished` payload (COURSE-10) — the screen only
 * presents it; the per-key heatmap is the one client-side piece (the local
 * typing session's error counts, RES-03).
 *
 * Personal record (RES-04): `bestWpm` is the viewer's pre-race best (loaded
 * from the account profile by the room page); a beaten record shows the
 * badge. `null`/`0` (guests have no stats — AUTH-03, or no prior race)
 * hides the indicator. SP-3B's persistence will refresh this value after
 * each race; the comparison itself is final.
 *
 * COURSE-11 controls: the host can relaunch (same participants, config
 * editable again once the room returns to `en_attente` — the engine
 * re-collects participants on every `startRace`, verified in
 * `race-engine.test.ts`) or close the room; everyone else can stay or leave.
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
  // ----- COURSE-11 controls
  isHost: boolean;
  /** Present participants (for the relaunch gate, COURSE-02). */
  participantCount: number;
  onRelaunch: () => void;
  onCloseRoom: () => void;
  onLeaveRoom: () => void;
};

/** RES-04 logic (pure, exported for tests): a record is beaten strictly. */
export function recordBeaten(
  ownWpm: number | null,
  bestWpm: number | null,
): boolean {
  return ownWpm !== null && bestWpm !== null && bestWpm > 0 && ownWpm > bestWpm;
}

/** COURSE-11 action panel: relaunch/close for the host, stay/leave otherwise. */
function ResultsControls({
  isHost,
  participantCount,
  messages,
  onRelaunch,
  onCloseRoom,
  onLeaveRoom,
}: {
  isHost: boolean;
  participantCount: number;
  messages: Messages;
  onRelaunch: () => void;
  onCloseRoom: () => void;
  onLeaveRoom: () => void;
}) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  if (isHost) {
    const needsMore = participantCount < 2;
    return (
      <div
        data-testid="results-controls"
        className="flex flex-col gap-space-sm rounded bg-surface-container-lowest p-space-md shadow-xl"
      >
        <div className="flex flex-wrap items-center gap-space-sm">
          <ButtonPrimary type="button" disabled={needsMore} onClick={onRelaunch}>
            {messages['results.relaunch']}
          </ButtonPrimary>
          {!confirmClose ? (
            <ButtonSecondary type="button" onClick={() => setConfirmClose(true)}>
              {messages['results.closeRoom']}
            </ButtonSecondary>
          ) : (
            <div className="flex flex-wrap items-center gap-space-sm">
              <span role="alert" className="font-label-sm text-label-sm text-dwarf-magma">
                {messages['lobby.confirmClose']}
              </span>
              <ButtonPrimary
                type="button"
                onClick={() => {
                  setConfirmClose(false);
                  onCloseRoom();
                }}
                className="px-space-sm py-space-xs"
              >
                {messages['lobby.confirm']}
              </ButtonPrimary>
              <ButtonSecondary
                type="button"
                onClick={() => setConfirmClose(false)}
                className="px-space-sm py-space-xs"
              >
                {messages['lobby.cancel']}
              </ButtonSecondary>
            </div>
          )}
        </div>
        {needsMore && (
          <p
            data-testid="results-need-participants"
            className="font-label-sm text-label-sm text-dwarf-magma"
          >
            {messages['race.needParticipants']}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="results-controls"
      className="flex flex-wrap items-center gap-space-sm rounded bg-surface-container-lowest p-space-md shadow-xl"
    >
      <ButtonSecondary type="button">{messages['results.stay']}</ButtonSecondary>
      {!confirmLeave ? (
        <ButtonSecondary type="button" onClick={() => setConfirmLeave(true)}>
          {messages['results.leave']}
        </ButtonSecondary>
      ) : (
        <div className="flex flex-wrap items-center gap-space-sm">
          <span role="alert" className="font-label-sm text-label-sm text-dwarf-magma">
            {messages['lobby.confirmLeave']}
          </span>
          <ButtonPrimary
            type="button"
            onClick={() => {
              setConfirmLeave(false);
              onLeaveRoom();
            }}
            className="px-space-sm py-space-xs"
          >
            {messages['lobby.confirm']}
          </ButtonPrimary>
          <ButtonSecondary
            type="button"
            onClick={() => setConfirmLeave(false)}
            className="px-space-sm py-space-xs"
          >
            {messages['lobby.cancel']}
          </ButtonSecondary>
        </div>
      )}
    </div>
  );
}

export default function ResultsScreen({
  results,
  localParticipantId,
  pfpUrls = {},
  keyErrors,
  bestWpm,
  messages,
  locale,
  isHost,
  participantCount,
  onRelaunch,
  onCloseRoom,
  onLeaveRoom,
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
      <ResultsControls
        isHost={isHost}
        participantCount={participantCount}
        messages={messages}
        onRelaunch={onRelaunch}
        onCloseRoom={onCloseRoom}
        onLeaveRoom={onLeaveRoom}
      />
      <div className="grid grid-cols-1 gap-space-md lg:grid-cols-2">
        <ResultsWpmChart results={results.results} messages={messages} locale={locale} />
        <RaceKeyboardHeatmap keyErrors={keyErrors} messages={messages} locale={locale} />
      </div>
    </section>
  );
}
