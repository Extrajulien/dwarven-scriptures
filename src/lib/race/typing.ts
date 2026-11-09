import { accuracy, netWpm, rawWpm } from './stats';

/**
 * Pure typing logic for the race text (COURSE-04, CONF-08).
 *
 * A small deterministic reducer over plain data — no React, no timers, no
 * DOM — so the input rules of the typing zone can be unit-tested exactly like
 * the rest of the game logic, and the same rules can be reused by any other
 * consumer (tests, future bots, the results screen).
 *
 * ## Error modes (CONF-08) — real behavioural difference
 *
 * - `'accumulate'` (libre / errors counted): a wrong character at the caret
 *   position is counted (`totalKeystrokes + 1`), the position is **marked**
 *   as an error in `errors`, and the caret **advances past it**. Subsequent
 *   keystrokes are compared against the ORIGINAL text position
 *   (`text[currentIndex]`), so the player keeps typing freely.
 * - `'stop'` (correction obligatoire): a wrong character is counted the same
 *   way but nothing is marked and the caret is blocked until the correct
 *   character is typed.
 *
 * ## Backspace (documented choice)
 *
 * - `'accumulate'`: backspace moves the caret back one position, **never
 *   below `validatedChars`** (the validated prefix is locked), and clears
 *   the error flag on the vacated position; `totalKeystrokes` decreases but
 *   never below `correctKeystrokes`. Backspacing over a correctly typed
 *   position un-types it (it must be typed again) — that is how the caret
 *   physically reaches an earlier error.
 * - `'stop'`: backspace is counter-only — it removes the last *incorrect*
 *   keystroke from `totalKeystrokes` (floored at `correctKeystrokes`) and
 *   never moves the caret; validated characters can never be un-validated.
 *
 * ## Finishing (COURSE-09 interpretation)
 *
 * The text is complete when `validatedChars === text.length` — in
 * `accumulate` mode errors keep `validatedChars` pinned, so a player who
 * advanced freely past errors must backspace to them and retype the correct
 * characters to finish; otherwise the server-side time limit ends the race
 * (`timeout`). This interpretation is also documented under
 * « Choix à documenter » (CONF-08) in `doc/EXIGENCES.md`.
 *
 * ## Invariants (shared with the server, COURSE-06)
 *
 * - `validatedChars` is always the correct contiguous prefix: positions
 *   below it were typed correctly and carry no error flag.
 * - Error flags only exist in `[validatedChars, currentIndex)` (positions the
 *   caret has passed), kept as a sorted `readonly number[]`.
 * - `validatedChars <= correctKeystrokes <= totalKeystrokes` holds in every
 *   state, so the counters the client sends (`progressCounters`) stay
 *   server-valid. `correctKeystrokes` and `totalKeystrokes` are monotonically
 *   increased by typing; only `totalKeystrokes` can decrease (backspace),
 *   floored at `correctKeystrokes` — the component keeps the running maximum
 *   when sending (`TypingZone`).
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
  /** Correct keystrokes so far (every keystroke that matched its position). */
  correctKeystrokes: number;
  /** Total keystrokes so far, errors included. */
  totalKeystrokes: number;
  /** The position the next keystroke applies to. */
  currentIndex: number;
  /** True right after a wrong keystroke (updated by `typeChar` only). */
  lastError: boolean;
  /**
   * Error-marked positions, sorted ascending — only in
   * `[validatedChars, currentIndex)`. Populated in `accumulate` mode; always
   * empty in `stop` mode.
   */
  errors: readonly number[];
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
 * callers can never produce an out-of-range state. The server does not carry
 * per-position error marks, so a resumed state starts with none.
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
    errors: [],
  };
}

/**
 * The pure reducer: one keystroke (`typeChar`) or one `backspace`. It never
 * mutates the previous state, is deterministic, and returns the *same*
 * reference when the action has no effect (text complete, empty keystroke,
 * keystroke beyond the text end, backspace with nothing to do) so callers can
 * detect "nothing changed". The switch is exhaustive over the action union.
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
  // The text is complete, the keystroke is not a single printable character
  // (the UI filters those out; the reducer stays defensive), or the caret is
  // at/past the text end (an error at the last character must be corrected
  // with backspace — there is nothing to type beyond the text).
  if (isComplete(state) || char.length !== 1 || state.currentIndex >= state.text.length) {
    return state;
  }

  const expected = state.text[state.currentIndex];
  if (char === expected) {
    // The correct character at the caret. When the caret sits on the first
    // unvalidated position (an error the player just came back to, or plain
    // forward typing), the validated prefix extends; correctly typed
    // characters *beyond* an error are counted but not validated — the
    // prefix stays pinned until every earlier error is corrected.
    const atPrefix = state.currentIndex === state.validatedChars;
    return {
      ...state,
      validatedChars: atPrefix ? state.validatedChars + 1 : state.validatedChars,
      correctKeystrokes: state.correctKeystrokes + 1,
      totalKeystrokes: state.totalKeystrokes + 1,
      currentIndex: state.currentIndex + 1,
      lastError: false,
    };
  }

  // Wrong character: counted and flagged, and the caret advances past it
  // (free advancement). In `stop` mode the caret must NOT advance — the same
  // counters, but no error mark and a blocked caret.
  if (state.errorMode === 'stop') {
    return {
      ...state,
      totalKeystrokes: state.totalKeystrokes + 1,
      lastError: true,
    };
  }

  return {
    ...state,
    totalKeystrokes: state.totalKeystrokes + 1,
    currentIndex: state.currentIndex + 1,
    lastError: true,
    errors: insertError(state.errors, state.currentIndex),
  };
}

function backspace(state: TypingState): TypingState {
  if (state.errorMode === 'stop') {
    // Counter-only backspace (documented): removes the last *incorrect*
    // keystroke from the counter, never below the correct count, and never
    // moves the caret — validated characters are locked.
    if (state.totalKeystrokes <= state.correctKeystrokes) {
      return state;
    }
    return { ...state, totalKeystrokes: state.totalKeystrokes - 1 };
  }

  // Accumulate mode: move the caret back one position, never below the
  // validated prefix; the vacated position loses its error flag (if any) and
  // its typed state — it must be typed again. totalKeystrokes decreases but
  // never below correctKeystrokes (correct keystrokes stay locked).
  if (state.currentIndex <= state.validatedChars) {
    return state;
  }
  const vacated = state.currentIndex - 1;
  return {
    ...state,
    currentIndex: vacated,
    errors: state.errors.filter((position) => position !== vacated),
    totalKeystrokes: Math.max(state.correctKeystrokes, state.totalKeystrokes - 1),
  };
}

/** Inserts a position into the sorted error array (no duplicates). */
function insertError(errors: readonly number[], position: number): readonly number[] {
  if (errors.includes(position)) {
    return errors;
  }
  const next = [...errors];
  const index = next.findIndex((entry) => entry > position);
  if (index === -1) {
    next.push(position);
  } else {
    next.splice(index, 0, position);
  }
  return next;
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
