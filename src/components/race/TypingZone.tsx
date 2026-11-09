'use client';

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import type { Messages } from '../../i18n/messages';
import type { RaceProgress } from '../../realtime/client-types';
import type { BonusAppliedMessage } from '../../realtime/protocol';
import {
  createTypingState,
  isComplete,
  liveStats,
  progressCounters,
  typingReducer,
  type ErrorMode,
} from '../../lib/race/typing';

/**
 * The typing zone of the race screen (COURSE-04): renders the race text as
 * per-character states (correct / incorrect / upcoming) with a caret at the
 * current position, drives the pure `typingReducer` from keyboard events,
 * shows a live WPM/accuracy readout, and reports progress to the server
 * throttled to at most one message per {@link PROGRESS_FLUSH_INTERVAL_MS}
 * (PERF-02's ≤10 msg/s cap) with a final flush on completion and unmount.
 *
 * Error modes (CONF-08) render differently because the reducer behaves
 * differently: in `accumulate` mode every position in `state.errors` is
 * marked incorrect (red) while the caret advances freely past errors — the
 * player must backspace to them and retype the correct characters to finish
 * (see `src/lib/race/typing.ts`); in `stop` mode nothing is ever marked and
 * the caret stays blocked at the validated prefix.
 *
 * Input strategy (documented choice): a **visually-hidden real `<input>`**
 * (`sr-only`, still focusable) rather than window-level key capture. A real
 * input keeps mobile-keyboard support clean (focus opens the keyboard — the
 * physical-keyboard message of DES-06 is SP-2F) and makes paste handling
 * trivial: `onPaste` is intercepted and ignored, so a pasted text can never
 * fill the zone. The input value stays empty; every printable key is
 * `preventDefault`-ed and reduced by hand.
 *
 * Progress flushing: the reducer's counters are pure local state; they are
 * pushed through `onProgress` (the parent wires `sendRaceProgress`) at most
 * every 250 ms, immediately when the text is completed, and once more on
 * unmount if a trailing update was pending. Because the server requires
 * monotonically increasing counters (COURSE-06) while `backspace` can lower
 * the local `totalKeystrokes`, the **sent** total keeps its running maximum
 * (`sentTotalRef`) — documented deviation: the server-side accuracy may count
 * keystrokes the player removed with backspace, while the local readout uses
 * the local counters.
 *
 * Comeback bonuses (BONUS-04, SP-4C): `bonusEvents` carries the
 * `bonusApplied` events that targeted the LOCAL participant. `addWords`
 * appends the payload words and `removeWords` removes them beyond the caret
 * through the pure {@link applyTextDelta} rules (same as the server, so the
 * completion check always uses the new effective length and the sent
 * counters stay server-valid); `fog` only blurs the upcoming region for
 * `payload.durationMs` and lifts the blur when the timer elapses.
 */

/** Progress throttle window: at most one message per 250 ms (PERF-02). */
export const PROGRESS_FLUSH_INTERVAL_MS = 250;

/**
 * Pure throttle rule: flush when nothing was sent yet or the window elapsed.
 * `lastFlushMs` is `null` before the first flush.
 */
export function shouldFlush(now: number, lastFlushMs: number | null): boolean {
  return lastFlushMs === null || now - lastFlushMs >= PROGRESS_FLUSH_INTERVAL_MS;
}

type TypingZoneProps = {
  /** The race text (the shared payload, GAME-1). */
  text: string;
  /** The room-configured error mode (CONF-08). */
  errorMode: ErrorMode;
  /** Typing is accepted only while the race is in EN_COURSE for this racer. */
  enabled: boolean;
  /** Cumulative counters to resume from after a reconnect (COURSE-08). */
  initialProgress?: RaceProgress;
  messages: Messages;
  /** Progress sink; the parent wires `sendRaceProgress` from the hook. */
  onProgress: (progress: RaceProgress) => void;
  /**
   * RES-03: reports the per-key error counts on every change (wrong
   * keystrokes only). The parent keeps the latest map for the results
   * screen's keyboard heatmap — client-side, no server round-trip.
   */
  onKeyErrors?: (errors: Readonly<Record<string, number>>) => void;
  /**
   * BONUS-04: the `bonusApplied` events that targeted the LOCAL participant,
   * in order. `addWords`/`removeWords` events adjust the local text through
   * the pure reducer (mirroring the server rules, so the completion check
   * uses the new effective length); `fog` events blur the upcoming region
   * for `payload.durationMs`. The parent filters the race `bonusLog`.
   */
  bonusEvents?: BonusAppliedMessage[];
};

export default function TypingZone({
  text,
  errorMode,
  enabled,
  initialProgress,
  messages,
  onProgress,
  onKeyErrors,
  bonusEvents = [],
}: TypingZoneProps) {
  const [state, dispatch] = useReducer(
    typingReducer,
    { text, errorMode, initialProgress },
    createTypingState,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  // Local WPM/accuracy time origin: the first keystroke (documented choice —
  // the readout measures typing speed, not wall-clock race time). Both live
  // in state so the render never reads refs (react-hooks/immutability).
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const lastFlushAtRef = useRef<number | null>(null);
  const pendingRef = useRef<RaceProgress | null>(null);
  const sentTotalRef = useRef(initialProgress?.totalKeystrokes ?? 0);
  const completedRef = useRef(false);
  const onProgressRef = useRef(onProgress);
  const onKeyErrorsRef = useRef(onKeyErrors);

  // BONUS-04: adjust the local typing state when bonus events arrive.
  // Text deltas are dispatched exactly once per event through the pure
  // reducer (the applied count lives in a ref, read/written in effects only);
  // fog events arm the blur *during render* with React's documented "adjust
  // state when props change" pattern (same-value updates bail out, so the
  // pattern is idempotent under StrictMode double-rendering).
  const [processedBonusCount, setProcessedBonusCount] = useState(0);
  const [fogEvent, setFogEvent] = useState<BonusAppliedMessage | null>(null);
  const appliedTextDeltaCountRef = useRef(0);

  if (processedBonusCount !== bonusEvents.length) {
    setProcessedBonusCount(bonusEvents.length);
    // Latest wins: only the newest fog event of the batch arms the blur.
    const latestFog = [...bonusEvents]
      .reverse()
      .find(
        (event) => event.bonusType === 'fog' && event.payload.durationMs !== undefined,
      );
    if (latestFog !== undefined) {
      setFogEvent(latestFog);
    }
  }

  useEffect(() => {
    const applied = appliedTextDeltaCountRef.current;
    const pending = bonusEvents.slice(applied);
    appliedTextDeltaCountRef.current = bonusEvents.length;
    for (const event of pending) {
      if (event.bonusType === 'addWords' && event.payload.words !== undefined) {
        dispatch({ type: 'applyTextDelta', delta: { words: event.payload.words } });
      } else if (event.bonusType === 'removeWords' && event.payload.wordCount !== undefined) {
        dispatch({ type: 'applyTextDelta', delta: { wordCount: event.payload.wordCount } });
      }
    }
  }, [bonusEvents, dispatch]);

  // Fog auto-clear (BONUS-02): the blur lifts when the duration elapsed.
  useEffect(() => {
    if (fogEvent === null) {
      return;
    }
    const timer = setTimeout(() => setFogEvent(null), fogEvent.payload.durationMs ?? 0);
    return () => clearTimeout(timer);
  }, [fogEvent]);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    onKeyErrorsRef.current = onKeyErrors;
  }, [onKeyErrors]);

  // RES-03: forward the per-key error map whenever a wrong keystroke changes
  // it (the parent stores the latest value for the results heatmap).
  useEffect(() => {
    onKeyErrorsRef.current?.(state.keyErrors);
  }, [state.keyErrors]);

  /** Sends counters, keeping the total monotonic for the server (COURSE-06). */
  const flush = useCallback((counters: RaceProgress) => {
    const totalKeystrokes = Math.max(sentTotalRef.current, counters.totalKeystrokes);
    sentTotalRef.current = totalKeystrokes;
    pendingRef.current = null;
    onProgressRef.current({ ...counters, totalKeystrokes });
  }, []);

  // Throttled progress reporting + trailing flush (PERF-02).
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const current = progressCounters(state);

    if (isComplete(state)) {
      if (!completedRef.current) {
        completedRef.current = true;
        flush(current); // final flush on completion, bypassing the window
      }
      return;
    }
    if (state.totalKeystrokes === 0) {
      return; // nothing typed yet (or an untouched resume state)
    }

    const now = Date.now();
    if (shouldFlush(now, lastFlushAtRef.current)) {
      lastFlushAtRef.current = now;
      flush(current);
      return;
    }

    // Inside the window: remember the latest counters and schedule one flush
    // for when the window closes, so a trailing pause still reports the
    // final position (at most one message per window either way).
    pendingRef.current = current;
    const remaining = PROGRESS_FLUSH_INTERVAL_MS - (now - (lastFlushAtRef.current ?? now));
    const timer = setTimeout(() => {
      if (pendingRef.current) {
        lastFlushAtRef.current = Date.now();
        flush(pendingRef.current);
      }
    }, Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [state, enabled, flush]);

  // Final flush on unmount (quit / phase change) if a trailing update waits.
  useEffect(() => {
    return () => {
      const pending = pendingRef.current;
      if (pending) {
        flush(pending);
      }
    };
  }, [flush]);

  // Ticker so the WPM/accuracy readout keeps updating while the racer pauses.
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const id = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(id);
  }, [enabled]);

  // Focus management: the zone takes focus as soon as typing is allowed.
  useEffect(() => {
    if (enabled) {
      inputRef.current?.focus();
    }
  }, [enabled]);

  const complete = isComplete(state);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!enabled || complete || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      if (startedAtMs === null) {
        const now = Date.now();
        setStartedAtMs(now);
        setNowMs(now);
      }
      dispatch({ type: 'typeChar', char: event.key });
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      dispatch({ type: 'backspace' });
    }
  };

  // Paste is disabled: the text must be typed keystroke by keystroke.
  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
  };

  const elapsedMs = startedAtMs === null ? 0 : nowMs - startedAtMs;
  const stats = liveStats(state, elapsedMs);
  const wpm = Math.round(stats.netWpm);
  const accuracyPct = Math.round(stats.accuracy);

  return (
    <div className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
      {/* Live readout (client-side Annexe A stats) + screen-reader announcer. */}
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <dl className="flex flex-wrap gap-space-md font-label-sm text-label-sm uppercase">
          <div className="rounded bg-dwarf-slate px-space-sm py-space-xs text-on-surface">
            {messages['race.liveWpmLabel']}: <span data-testid="typing-wpm">{wpm}</span>
          </div>
          <div className="rounded bg-dwarf-slate px-space-sm py-space-xs text-on-surface">
            {messages['race.liveAccuracyLabel']}:{' '}
            <span data-testid="typing-accuracy">{accuracyPct}</span>%
          </div>
          <div className="rounded bg-dwarf-slate px-space-sm py-space-xs text-on-surface-variant">
            {messages['race.progressLabel']}: {state.validatedChars} / {state.text.length}
          </div>
        </dl>
        <span aria-live="polite" className="sr-only">
          {messages['race.liveWpmLabel']} {wpm}
        </span>
      </div>

      {/* The text, one span per character, with the caret on the current one. */}
      <div
        data-testid="typing-zone"
        className="relative rounded border border-dwarf-border bg-dwarf-bg p-space-md shadow-stone-inner"
        onMouseDown={(event) => {
          // Keep the hidden input focused without selecting text.
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <p
          aria-hidden="true"
          data-fog={fogEvent === null ? 'false' : 'true'}
          className="font-mono text-lg leading-relaxed break-words whitespace-pre-wrap"
          data-testid="typing-text"
        >
          {[...state.text].map((char, index) => {
            const isErrored = state.errors.includes(index);
            // Typed & unmarked: validated prefix chars, and (accumulate mode)
            // chars correctly typed beyond a pending error. Backspacing past
            // a position un-types it, so it renders as upcoming again.
            const isTypedCorrect = !isErrored && index < state.currentIndex;
            const isCaret = index === state.currentIndex && enabled && !complete;
            // BONUS-02: the fog blurs the UPCOMING region (nothing typed yet).
            const fogged = fogEvent !== null && !isErrored && !isTypedCorrect;
            const className = isErrored
              ? 'text-error'
              : isTypedCorrect
                ? 'text-primary'
                : 'text-on-surface-variant';
            return (
              <span
                key={index}
                data-char-index={index}
                data-state={isErrored ? 'incorrect' : isTypedCorrect ? 'correct' : 'upcoming'}
                data-caret={isCaret ? 'true' : undefined}
                className={`${className}${isCaret ? ' border-b-2 border-primary animate-pulse' : ''}${fogged ? ' blur-sm' : ''}`}
              >
                {char}
              </span>
            );
          })}
          {/* Trailing caret: accumulate mode with an uncorrected error on the
              last character — the caret sits at the end of the text. */}
          {enabled && !complete && state.currentIndex === state.text.length && (
            <span
              data-caret="true"
              data-char-index={state.text.length}
              className="animate-pulse border-b-2 border-primary"
            >
              {'\u00A0'}
            </span>
          )}
        </p>

        <input
          ref={inputRef}
          type="text"
          value=""
          onChange={() => {}}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={!enabled}
          autoFocus={enabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={messages['race.typingInputLabel']}
          data-testid="typing-input"
          className="sr-only"
        />
      </div>

      {complete && (
        <p role="status" className="font-label-sm text-label-sm text-dwarf-rune-bright">
          {messages['race.completeNotice']}
        </p>
      )}
    </div>
  );
}
