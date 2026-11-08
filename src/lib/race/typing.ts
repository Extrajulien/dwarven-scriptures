import { accuracy, netWpm, rawWpm } from './stats';

/**
 * Pure typing logic for the race text (COURSE-04, CONF-08 groundwork).
 *
 * A small deterministic reducer over plain data — no React, no timers, no
 * DOM — so the input rules of the typing zone can be unit-tested exactly like
 * the rest of the game logic, and the same rules can be reused by any other
 * consumer (tests, future bots, the results screen).
 *
 * ## Error modes (CONF-08)
 *
 * - `'accumulate'` (libre / errors counted): a wrong character at the current
 *   position is counted as an incorrect keystroke and the position is
 *   *marked* as an error (`lastError`), but the caret does NOT advance past
 *   it — typing the correct character validates the position and advances.
 * - `'stop'` (correction obligatoire): a wrong character is counted exactly
 *   the same way, but the position is not marked as an error; the input is
 *   simply blocked until the correct character is typed.
 *
 * The counter behaviour is therefore identical in both modes — the only
 * difference is presentation (the UI renders the pending position red in
 * `accumulate` mode, see `TypingZone`). This follows the SP-2C spec ("the
 * input does NOT advance, next correct char advances") and keeps
 * `validatedChars` equal to the correct contiguous prefix length in every
 * state, which is the invariant the server's auto-finish relies on.
 *
 * ## Backspace (documented choice)
 *
 * Backspace can **never un-validate** a character and never moves the caret
 * backwards: validated characters are locked in. Its only effect is to
 * remove the *last incorrect keystroke* from `totalKeystrokes`, and never
 * below `correctKeystrokes`, so the server invariants
 * (`correctKeystrokes <= totalKeystrokes`, `validatedChars <= totalKeystrokes`)
 * always hold for the counters the client sends. Because an error blocks the
 * caret until it is corrected, positional backspacing is never needed.
 *
 * ## Counter contract (shared with the server, COURSE-06)
 *
 * `validatedChars` and `correctKeystrokes` are monotonically increasing;
 * `totalKeystrokes` counts every keystroke (errors included) and can only go
 * down through {@link backspace}, never below `correctKeystrokes`.
 */

/** The two error modes of CONF-08 (`errorMode` in the room config). */
export type ErrorMode = 'accumulate' | 'stop';

/** The full typing state of one participant on one race text. */
export type TypingState = {
  /** The race text (the same payload every participant received, GAME-1). */
  text: string;
  /** The room-configured error mode (CONF-08). */
  errorMode: ErrorMode;
  /** Correct contiguous prefix length — what the participant has validated. */
  validatedChars: number;
  /** Correct keystrokes so far (every keystroke that validated a character). */
  correctKeystrokes: number;
  /** Total keystrokes so far, errors included. */
  totalKeystrokes: number;
  /** The position the next keystroke applies to; always == `validatedChars`. */
  currentIndex: number;
  /** True right after a wrong keystroke at `currentIndex` (until corrected). */
  lastError: boolean;
};

export type TypingAction = { type: 'typeChar'; char: string } | { type: 'backspace' };

/** Cumulative counters the client sends to the server (COURSE-06 shape). */
export type TypingProgressCounters = {
  validatedChars: number;
  correctKeystrokes: number;
  totalKeystrokes: number;
};

/**
 * Builds a fresh typing state for a race text. `initialProgress` restores
 * the cumulative counters the server sent on a mid-race reconnect
 * (COURSE-08 resume snapshot), clamped into `[0, text.length]` so defensive
 * callers can never produce an out-of-range state.
 */
export function createTypingState(params: {
  text: string;
  errorMode: ErrorMode;
  initialProgress?: TypingProgressCounters;
}): TypingState {
  const validatedChars = Math.min(
    params.text.length,
    Math.max(0, params.initialProgress?.validatedChars ?? 0),
  );
  const correctKeystrokes = Math.max(0, params.initialProgress?.correctKeystrokes ?? 0);
  const totalKeystrokes = Math.max(correctKeystrokes, params.initialProgress?.totalKeystrokes ?? 0);
  return {
    text: params.text,
    errorMode: params.errorMode,
    validatedChars,
    correctKeystrokes,
    totalKeystrokes,
    currentIndex: validatedChars,
    lastError: false,
  };
}

/**
 * The pure reducer: one keystroke (`typeChar`) or one `backspace`. It never
 * mutates the previous state, is deterministic, and returns the *same*
 * reference when the action has no effect (text complete, empty keystroke,
 * backspace with nothing to remove) so callers can detect "nothing changed".
 * The switch is exhaustive over the action union.
 */
export function typingReducer(state: TypingState, action: TypingAction): TypingState {
  switch (action.type) {
    case 'typeChar':
      return typeChar(state, action.char);
    case 'backspace':
      return backspace(state);
    default: {
      // Exhaustiveness guard: a new action type must be handled here.
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

function typeChar(state: TypingState, char: string): TypingState {
  // The text is complete, or the keystroke is not a single printable
  // character (the UI filters those out; the reducer stays defensive).
  if (isComplete(state) || char.length !== 1) {
    return state;
  }

  const expected = state.text[state.currentIndex];
  if (expected === undefined) {
    // Defensive: cannot happen while `currentIndex <= validatedChars <=
    // text.length`, but the reducer must stay total.
    return state;
  }

  if (char === expected) {
    // The correct character validates the pending position and advances.
    return {
      ...state,
      validatedChars: state.validatedChars + 1,
      correctKeystrokes: state.correctKeystrokes + 1,
      totalKeystrokes: state.totalKeystrokes + 1,
      currentIndex: state.currentIndex + 1,
      lastError: false,
    };
  }

  // Wrong character: counted as a keystroke and flagged, but never
  // validated — the caret stays until the correct character is typed
  // (both modes; the UI marks the position red in `accumulate` mode).
  return {
    ...state,
    totalKeystrokes: state.totalKeystrokes + 1,
    lastError: true,
  };
}

function backspace(state: TypingState): TypingState {
  // Documented choice (see the module header): only removes the last
  // *incorrect* keystroke from the counter; it can never un-validate a
  // validated character and never moves the caret back. The floor at
  // `correctKeystrokes` keeps `correct <= total` so the counters stay
  // server-valid (COURSE-06).
  if (state.totalKeystrokes <= state.correctKeystrokes) {
    return state;
  }
  return { ...state, totalKeystrokes: state.totalKeystrokes - 1 };
}

/** The participant validated the whole text (COURSE-06 auto-finish). */
export function isComplete(state: TypingState): boolean {
  return state.validatedChars >= state.text.length;
}

/** Live stats for one state (unrounded; display rounding is a UI concern). */
export type LiveStats = {
  netWpm: number;
  rawWpm: number;
  accuracy: number;
};

/**
 * Annexe A live readout on the current counters, verbatim from `stats.ts`:
 * net WPM = validated chars ÷ 5 ÷ minutes, raw WPM = total keystrokes ÷ 5 ÷
 * minutes, accuracy = correct ÷ total × 100. `elapsedMs` is the time since
 * typing began (the caller decides the origin).
 */
export function liveStats(state: TypingState, elapsedMs: number): LiveStats {
  return {
    netWpm: netWpm({ correctChars: state.validatedChars, elapsedMs }),
    rawWpm: rawWpm({ totalChars: state.totalKeystrokes, elapsedMs }),
    accuracy: accuracy({
      correctKeystrokes: state.correctKeystrokes,
      totalKeystrokes: state.totalKeystrokes,
    }),
  };
}

/** The cumulative counters to send to the server (COURSE-06). */
export function progressCounters(state: TypingState): TypingProgressCounters {
  return {
    validatedChars: state.validatedChars,
    correctKeystrokes: state.correctKeystrokes,
    totalKeystrokes: state.totalKeystrokes,
  };
}
