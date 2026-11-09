'use client';

import type { ReactNode } from 'react';
import type { Locale, Messages } from '../../i18n/messages';
import { formatNumber } from '../../i18n/format';
import { errorKeyFor } from '../../lib/race/typing';
import Icon from '../Icon';

/**
 * Per-race keyboard heatmap for the LOCAL player (RES-03): the per-key error
 * counts recorded by the typing reducer during the race (`TypingState
 * .keyErrors`, client-side — no server round-trip) tint the keys of a
 * QWERTY layout drawn in the same visual style as the account-page
 * `KeyboardHeatmap` (whose data remains account-side and untouched). Keys
 * are identified with `errorKeyFor` (letters lower-cased); the layout rows
 * mirror the account heatmap so the two screens read alike.
 *
 * `keyErrors: null` = no local data (spectator / late joiner): an honest
 * "unavailable" state is shown instead of a fabricated keyboard.
 */

type Tone = 'plain' | 'few' | 'many' | 'top';

const TONE_CLASSES: Record<Tone, string> = {
  plain: 'border border-outline-variant bg-surface-container-high text-on-surface-variant',
  few: 'border border-primary/60 bg-primary/20 text-primary',
  many: 'border border-error/70 bg-error/20 text-error',
  // Solid error fill: the previous /60 tint put `on-surface` text below WCAG
  // AA in BOTH themes (A11Y-01 — computed in src/theme/contrast.test.ts).
  top: 'border border-error bg-error text-on-error',
};

const TONE_LABEL_CLASSES: Record<Tone, string> = {
  plain: 'text-on-surface-variant',
  few: 'text-primary',
  many: 'text-error',
  top: 'text-error',
};

/** Error-count buckets: 0 → plain, 1–2 → few, 3–5 → many, 6+ → top. */
export function toneForErrorCount(count: number): Tone {
  if (count <= 0) {
    return 'plain';
  }
  if (count <= 2) {
    return 'few';
  }
  if (count <= 5) {
    return 'many';
  }
  return 'top';
}

const LEGEND_TONES: Array<{ tone: Tone; labelKey: keyof Messages }> = [
  { tone: 'plain', labelKey: 'results.heatmap.legend.zero' },
  { tone: 'few', labelKey: 'results.heatmap.legend.few' },
  { tone: 'many', labelKey: 'results.heatmap.legend.many' },
  { tone: 'top', labelKey: 'results.heatmap.legend.top' },
];

/** The physical layout, one row per line — same rows as the account heatmap. */
const KEY_ROWS: string[][] = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
  [' '],
];

/** Display label of a heatmap key (letters upper-cased, space labeled). */
export function heatmapKeyLabel(key: string, messages: Messages): string {
  if (key === ' ') {
    return messages['account.heatmap.key.space'];
  }
  if (key.length === 1 && /[a-z]/.test(key)) {
    return key.toUpperCase();
  }
  return key;
}

function DataKey({
  children,
  tone,
  dataKey,
  count,
  className = '',
}: {
  children: ReactNode;
  tone: Tone;
  /** The normalized heatmap key (letters lower-cased, space = ' '). */
  dataKey?: string;
  count?: number;
  className?: string;
}) {
  return (
    <div
      data-testid={dataKey !== undefined ? 'results-heatmap-key' : undefined}
      data-key={dataKey}
      data-count={count}
      data-tone={tone}
      className={`flex h-9 w-8 items-center justify-center rounded sm:h-10 sm:w-10 ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

function ModifierKey({ children, className }: { children: ReactNode; className?: string }) {
  return <DataKey tone="plain" className={className}>{children}</DataKey>;
}

export default function RaceKeyboardHeatmap({
  keyErrors,
  messages,
  locale,
}: {
  /** Per-key error counts of the local session; `null` = unavailable. */
  keyErrors: Readonly<Record<string, number>> | null;
  messages: Messages;
  locale: Locale;
}) {
  if (keyErrors === null) {
    return (
      <section
        data-testid="results-heatmap"
        className="flex flex-col gap-space-sm rounded bg-surface-container-lowest p-space-lg shadow-xl"
      >
        <div className="flex items-center gap-space-sm">
          <Icon name="keyboard" className="text-headline-sm text-secondary" />
          <h2 className="font-label-md text-label-md uppercase text-on-surface">
            {messages['results.heatmap.title']}
          </h2>
        </div>
        <p
          data-testid="results-heatmap-unavailable"
          className="font-body-sm text-body-sm text-dwarf-parchmentMuted"
        >
          {messages['results.heatmap.unavailable']}
        </p>
      </section>
    );
  }

  const countFor = (key: string): number => keyErrors[errorKeyFor(key)] ?? 0;
  const entries = Object.entries(keyErrors);
  const maxCount = entries.reduce((max, [, count]) => Math.max(max, count), 0);
  const weakest = maxCount > 0 ? entries.find(([, count]) => count === maxCount) : undefined;

  return (
    <section
      data-testid="results-heatmap"
      className="flex flex-col gap-space-sm rounded bg-surface-container-lowest p-space-lg shadow-xl"
    >
      <div className="flex flex-col justify-between gap-space-sm border-b border-outline-variant pb-space-sm sm:flex-row sm:items-center">
        <div className="flex items-center gap-space-sm">
          <Icon name="keyboard" className="text-headline-sm text-secondary" />
          <div className="flex flex-col">
            <h2 className="font-label-md text-label-md uppercase text-on-surface">
              {messages['results.heatmap.title']}
            </h2>
            <span className="font-label-sm text-label-sm text-outline">
              {messages['results.heatmap.caption']}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-space-md font-mono font-label-sm text-label-sm uppercase tracking-wider">
          <span className="text-outline">{messages['results.heatmap.legendLabel']}:</span>
          {LEGEND_TONES.map(({ tone, labelKey }) => (
            <div key={tone} className="flex items-center gap-space-xs">
              <span className={`h-3 w-3 rounded ${TONE_CLASSES[tone]}`} aria-hidden="true" />
              <span className={`font-bold ${TONE_LABEL_CLASSES[tone]}`}>
                {messages[labelKey]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest p-space-sm sm:p-space-md">
        <div className="mx-auto w-fit min-w-[480px] select-none space-y-1.5 font-mono text-body-sm font-bold">
          <div className="flex justify-center gap-1.5">
            {KEY_ROWS[0].map((key) => (
              <DataKey key={key} tone={toneForErrorCount(countFor(key))} dataKey={errorKeyFor(key)} count={countFor(key)}>
                {key}
              </DataKey>
            ))}
            <ModifierKey className="w-14 font-label-sm text-label-sm uppercase tracking-wider sm:w-16">
              {messages['account.heatmap.key.back']}
            </ModifierKey>
          </div>
          <div className="flex justify-center gap-1.5">
            <ModifierKey className="w-12 font-label-sm text-label-sm uppercase tracking-wider sm:w-14">
              {messages['account.heatmap.key.tab']}
            </ModifierKey>
            {KEY_ROWS[1].map((key) => (
              <DataKey key={key} tone={toneForErrorCount(countFor(key))} dataKey={errorKeyFor(key)} count={countFor(key)}>
                {key}
              </DataKey>
            ))}
          </div>
          <div className="flex justify-center gap-1.5">
            <ModifierKey className="w-14 font-label-sm text-label-sm uppercase tracking-wider sm:w-16">
              {messages['account.heatmap.key.caps']}
            </ModifierKey>
            {KEY_ROWS[2].map((key) => (
              <DataKey key={key} tone={toneForErrorCount(countFor(key))} dataKey={errorKeyFor(key)} count={countFor(key)}>
                {key}
              </DataKey>
            ))}
            <ModifierKey className="w-16 font-label-sm text-label-sm uppercase tracking-wider sm:w-20">
              {messages['account.heatmap.key.enter']}
            </ModifierKey>
          </div>
          <div className="flex justify-center gap-1.5">
            <ModifierKey className="w-16 font-label-sm text-label-sm uppercase tracking-wider sm:w-20">
              {messages['account.heatmap.key.shift']}
            </ModifierKey>
            {KEY_ROWS[3].map((key) => (
              <DataKey key={key} tone={toneForErrorCount(countFor(key))} dataKey={errorKeyFor(key)} count={countFor(key)}>
                {key}
              </DataKey>
            ))}
            <ModifierKey className="w-16 font-label-sm text-label-sm uppercase tracking-wider sm:w-20">
              {messages['account.heatmap.key.shift']}
            </ModifierKey>
          </div>
          <div className="flex justify-center gap-1.5 pt-0.5">
            <ModifierKey className="w-12 font-label-sm text-label-sm uppercase tracking-wider sm:w-14">
              {messages['account.heatmap.key.ctrl']}
            </ModifierKey>
            <ModifierKey className="w-12 font-label-sm text-label-sm uppercase tracking-wider sm:w-14">
              {messages['account.heatmap.key.alt']}
            </ModifierKey>
            <DataKey
              tone={toneForErrorCount(countFor(' '))}
              dataKey=" "
              count={countFor(' ')}
              className="w-40 font-label-sm text-label-sm uppercase tracking-widest sm:w-56"
            >
              {messages['account.heatmap.key.space']}
            </DataKey>
            <ModifierKey className="w-12 font-label-sm text-label-sm uppercase tracking-wider sm:w-14">
              {messages['account.heatmap.key.alt']}
            </ModifierKey>
            <ModifierKey className="w-12 font-label-sm text-label-sm uppercase tracking-wider sm:w-14">
              {messages['account.heatmap.key.ctrl']}
            </ModifierKey>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-space-xs font-mono text-body-sm text-outline">
        {weakest ? (
          <div
            data-testid="results-heatmap-weakest"
            className="flex items-center gap-space-sm"
          >
            <span className="font-bold text-error">{messages['results.heatmap.weakestLabel']}</span>
            <span className="font-bold text-on-surface">
              {heatmapKeyLabel(weakest[0], messages)} · {formatNumber(weakest[1], locale)}
            </span>
          </div>
        ) : (
          <div
            data-testid="results-heatmap-no-errors"
            className="font-bold text-dwarf-rune-bright"
          >
            {messages['results.heatmap.noErrors']}
          </div>
        )}
      </div>
    </section>
  );
}
