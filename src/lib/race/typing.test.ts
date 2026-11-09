/**
 * @jest-environment node
 *
 * Unit tests for the pure typing reducer (COURSE-04, CONF-08): the two error
 * modes now differ in real behaviour — `accumulate` advances freely past
 * marked errors while `stop` blocks — plus the documented backspace
 * semantics, the character classes (spaces, accents, case), completeness
 * (finish requires correcting remaining errors in accumulate mode), and the
 * live stats math (Annexe A) computed by `liveStats` on the current
 * counters.
 */

import {
  applyTextDelta,
  createTypingState,
  errorKeyFor,
  isComplete,
  liveStats,
  progressCounters,
  typingReducer,
  type TypingState,
} from './typing';

function stateFor(text: string, errorMode: 'accumulate' | 'stop' = 'accumulate'): TypingState {
  return createTypingState({ text, errorMode });
}

/** Types `chars` one at a time and returns the final state. */
function typeAll(initial: TypingState, chars: string[]): TypingState {
  return chars.reduce<TypingState>(
    (state, char) => typingReducer(state, { type: 'typeChar', char }),
    initial,
  );
}

/** Applies backspace `times` times. */
function backspaces(initial: TypingState, times: number): TypingState {
  let state = initial;
  for (let i = 0; i < times; i += 1) {
    state = typingReducer(state, { type: 'backspace' });
  }
  return state;
}

describe('createTypingState', () => {
  test('starts empty on the text', () => {
    const state = stateFor('dwarf');
    expect(state).toEqual({
      text: 'dwarf',
      errorMode: 'accumulate',
      validatedChars: 0,
      correctKeystrokes: 0,
      totalKeystrokes: 0,
      currentIndex: 0,
      lastError: false,
      errors: [],
      keyErrors: {},
    });
  });

  test('restores resume counters and clamps them into the text length', () => {
    const resumed = createTypingState({
      text: 'abc',
      errorMode: 'stop',
      initialProgress: { validatedChars: 2, correctKeystrokes: 2, totalKeystrokes: 5 },
    });
    expect(resumed.validatedChars).toBe(2);
    expect(resumed.currentIndex).toBe(2);
    expect(resumed.correctKeystrokes).toBe(2);
    expect(resumed.totalKeystrokes).toBe(5);
    // The server carries no per-position error marks: a resume starts clean.
    expect(resumed.errors).toEqual([]);

    const clamped = createTypingState({
      text: 'abc',
      errorMode: 'stop',
      initialProgress: { validatedChars: 99, correctKeystrokes: 99, totalKeystrokes: 99 },
    });
    expect(clamped.validatedChars).toBe(3);
    expect(clamped.currentIndex).toBe(3);
    expect(isComplete(clamped)).toBe(true);
  });
});

describe('typeChar — correct keystrokes', () => {
  test('validates the position, advances and counts the keystroke', () => {
    const next = typingReducer(stateFor('ab'), { type: 'typeChar', char: 'a' });
    expect(next.validatedChars).toBe(1);
    expect(next.correctKeystrokes).toBe(1);
    expect(next.totalKeystrokes).toBe(1);
    expect(next.currentIndex).toBe(1);
    expect(next.lastError).toBe(false);
    expect(next.errors).toEqual([]);
    // validatedChars stays the correct contiguous prefix length.
    expect(next.validatedChars).toBe(next.currentIndex);
  });

  test('space characters count as characters (Annexe A)', () => {
    const state = stateFor('a b');
    expect(typingReducer(state, { type: 'typeChar', char: ' ' }).validatedChars).toBe(0);
    const done = typeAll(state, ['a', ' ', 'b']);
    expect(done.validatedChars).toBe(3);
    expect(isComplete(done)).toBe(true);
  });

  test('accents match exactly (é only validates é)', () => {
    const state = stateFor('é');
    expect(typingReducer(state, { type: 'typeChar', char: 'e' }).validatedChars).toBe(0);
    expect(typingReducer(state, { type: 'typeChar', char: 'é' }).validatedChars).toBe(1);
  });

  test('matching is case-sensitive (a does not validate A)', () => {
    const state = stateFor('A');
    expect(typingReducer(state, { type: 'typeChar', char: 'a' }).validatedChars).toBe(0);
    expect(typingReducer(state, { type: 'typeChar', char: 'A' }).validatedChars).toBe(1);
  });
});

describe('accumulate mode — free advancement past errors', () => {
  test('a wrong char is counted and marked, and the caret ADVANCES past it', () => {
    const wrong = typingReducer(stateFor('ab', 'accumulate'), { type: 'typeChar', char: 'x' });
    expect(wrong.validatedChars).toBe(0); // nothing validated
    expect(wrong.currentIndex).toBe(1); // the caret moved past the error
    expect(wrong.correctKeystrokes).toBe(0);
    expect(wrong.totalKeystrokes).toBe(1);
    expect(wrong.lastError).toBe(true);
    expect(wrong.errors).toEqual([0]); // the position is marked
  });

  test('subsequent chars compare against the ORIGINAL text position', () => {
    // text "ab": 'x' is wrong at 0 (caret → 1), then 'b' is correct at
    // position 1 and advances — but the validated prefix stays pinned at 0.
    const state = typeAll(stateFor('ab', 'accumulate'), ['x', 'b']);
    expect(state.currentIndex).toBe(2);
    expect(state.correctKeystrokes).toBe(1);
    expect(state.totalKeystrokes).toBe(2);
    expect(state.validatedChars).toBe(0);
    expect(state.errors).toEqual([0]);
    expect(isComplete(state)).toBe(false);
  });

  test('errors beyond the prefix stay marked and block validatedChars growth', () => {
    const state = typeAll(stateFor('abcd', 'accumulate'), ['x', 'b', 'y', 'd']);
    expect(state.currentIndex).toBe(4);
    expect(state.validatedChars).toBe(0);
    expect(state.errors).toEqual([0, 2]);
    expect(state.correctKeystrokes).toBe(2); // 'b' and 'd' were correct
    expect(isComplete(state)).toBe(false);
  });

  test('finish requires correcting remaining errors (COURSE-09 interpretation)', () => {
    // Typed to the very end with one error left: not complete, and further
    // keystrokes at/past the end are ignored — only backspace + correction.
    const atEnd = typeAll(stateFor('ab', 'accumulate'), ['x', 'b']);
    expect(atEnd.currentIndex).toBe(2);
    expect(typingReducer(atEnd, { type: 'typeChar', char: 'c' })).toBe(atEnd);

    const corrected = typeAll(backspaces(atEnd, 2), ['a', 'b']);
    expect(corrected.validatedChars).toBe(2);
    expect(corrected.errors).toEqual([]);
    expect(isComplete(corrected)).toBe(true);
  });

  test('correction flow: backspace, retype, validatedChars grows, error cleared', () => {
    let state = typingReducer(stateFor('ab', 'accumulate'), { type: 'typeChar', char: 'x' });
    expect(state.errors).toEqual([0]);
    expect(state.currentIndex).toBe(1);

    state = typingReducer(state, { type: 'backspace' });
    expect(state.currentIndex).toBe(0); // caret back on the errored position
    expect(state.errors).toEqual([]); // flag cleared on the vacated position
    expect(state.validatedChars).toBe(0); // still locked

    state = typingReducer(state, { type: 'typeChar', char: 'a' });
    expect(state.validatedChars).toBe(1);
    expect(state.correctKeystrokes).toBe(1);
    expect(state.currentIndex).toBe(1);

    state = typingReducer(state, { type: 'typeChar', char: 'b' });
    expect(state.validatedChars).toBe(2);
    expect(isComplete(state)).toBe(true);
    // The wrong keystroke was undone by backspace: 2 correct / 2 total.
    expect(state.totalKeystrokes).toBe(2);
  });
});

describe('stop mode — blocked at errors', () => {
  test('wrong attempts keep counting and never advance (blocked)', () => {
    let state = stateFor('ab', 'stop');
    state = typingReducer(state, { type: 'typeChar', char: 'z' });
    state = typingReducer(state, { type: 'typeChar', char: 'y' });
    state = typingReducer(state, { type: 'typeChar', char: 'x' });
    expect(state.validatedChars).toBe(0);
    expect(state.currentIndex).toBe(0);
    expect(state.totalKeystrokes).toBe(3);
    expect(state.correctKeystrokes).toBe(0);
    expect(state.errors).toEqual([]); // nothing is ever marked in stop mode

    const corrected = typingReducer(state, { type: 'typeChar', char: 'a' });
    expect(corrected.validatedChars).toBe(1);
    expect(corrected.totalKeystrokes).toBe(4);
    expect(corrected.lastError).toBe(false);
  });

  test('the two modes now differ in real behaviour on the same input', () => {
    const accumulate = typeAll(stateFor('ab', 'accumulate'), ['x', 'a']);
    const stop = typeAll(stateFor('ab', 'stop'), ['x', 'a']);
    // Accumulate: advanced freely; 'x' marked at 0, 'a' wrong at 1 too.
    expect(accumulate.currentIndex).toBe(2);
    expect(accumulate.validatedChars).toBe(0);
    expect(accumulate.errors).toEqual([0, 1]);
    // Stop: blocked at 0 until the correct char ('a') validates position 0.
    expect(stop.currentIndex).toBe(1);
    expect(stop.validatedChars).toBe(1);
    expect(stop.errors).toEqual([]);
  });
});

describe('backspace (documented choices)', () => {
  test('accumulate: moves the caret back and clears the flag on the vacated position', () => {
    const withError = typingReducer(stateFor('ab'), { type: 'typeChar', char: 'x' });
    const afterBackspace = typingReducer(withError, { type: 'backspace' });
    expect(afterBackspace.currentIndex).toBe(0);
    expect(afterBackspace.errors).toEqual([]);
    expect(afterBackspace.totalKeystrokes).toBe(0);
    // No un-validation: the validated prefix is locked.
    expect(afterBackspace.validatedChars).toBe(0);
    expect(afterBackspace.correctKeystrokes).toBe(0);
  });

  test('accumulate: never moves below validatedChars (locked prefix)', () => {
    const typed = typeAll(stateFor('abc'), ['a', 'b']);
    const afterBackspace = typingReducer(typed, { type: 'backspace' });
    expect(afterBackspace).toBe(typed); // no-op at the validated prefix

    // With an error at the end, the caret can only come back to index 2.
    const withError = typingReducer(typed, { type: 'typeChar', char: 'x' });
    expect(withError.currentIndex).toBe(3);
    const once = typingReducer(withError, { type: 'backspace' });
    expect(once.currentIndex).toBe(2);
    expect(once.errors).toEqual([]);
    expect(typingReducer(once, { type: 'backspace' })).toBe(once);
    expect(once.validatedChars).toBe(2); // never un-validated
  });

  test('accumulate: totalKeystrokes decreases but never below correctKeystrokes', () => {
    let state = typeAll(stateFor('abc'), ['x', 'b']); // err@0, correct@1
    expect(state.totalKeystrokes).toBe(2);
    expect(state.correctKeystrokes).toBe(1);

    state = typingReducer(state, { type: 'backspace' }); // vacate 1 (correct)
    expect(state.totalKeystrokes).toBe(1); // floored at correctKeystrokes
    expect(state.currentIndex).toBe(1);

    state = typingReducer(state, { type: 'backspace' }); // vacate 0 (error)
    expect(state.totalKeystrokes).toBe(1); // still floored
    expect(state.errors).toEqual([]);
    expect(state.currentIndex).toBe(0);
    expect(state.totalKeystrokes).toBeGreaterThanOrEqual(state.correctKeystrokes);
    expect(state.validatedChars).toBeLessThanOrEqual(state.totalKeystrokes);
  });

  test('stop: backspace is counter-only and never moves the caret', () => {
    const withError = typingReducer(stateFor('ab', 'stop'), { type: 'typeChar', char: 'z' });
    const afterBackspace = typingReducer(withError, { type: 'backspace' });
    expect(afterBackspace.totalKeystrokes).toBe(0);
    expect(afterBackspace.currentIndex).toBe(0); // still blocked at the error
    expect(afterBackspace.validatedChars).toBe(0);
    expect(afterBackspace.correctKeystrokes).toBe(0);
  });

  test('is a no-op on a fresh state in both modes', () => {
    const fresh = stateFor('abc');
    expect(typingReducer(fresh, { type: 'backspace' })).toBe(fresh);
    const freshStop = stateFor('abc', 'stop');
    expect(typingReducer(freshStop, { type: 'backspace' })).toBe(freshStop);
  });
});

describe('completeness and determinism', () => {
  test('isComplete is true exactly when every character is validated', () => {
    expect(isComplete(stateFor('abc'))).toBe(false);
    expect(isComplete(typeAll(stateFor('abc'), ['a', 'b']))).toBe(false);
    expect(isComplete(typeAll(stateFor('abc'), ['a', 'b', 'c']))).toBe(true);
  });

  test('keystrokes after completion are no-ops (same reference)', () => {
    const done = typeAll(stateFor('ab'), ['a', 'b']);
    expect(typingReducer(done, { type: 'typeChar', char: 'c' })).toBe(done);
    expect(typingReducer(done, { type: 'backspace' })).toBe(done);
  });

  test('non-single-character actions are no-ops (same reference)', () => {
    const fresh = stateFor('abc');
    expect(typingReducer(fresh, { type: 'typeChar', char: '' })).toBe(fresh);
    expect(typingReducer(fresh, { type: 'typeChar', char: 'ab' })).toBe(fresh);
  });

  test('the reducer is pure: the previous state is never mutated', () => {
    const before = typeAll(stateFor('abc'), ['a']);
    const snapshot = { ...before, errors: [...before.errors] };
    typingReducer(before, { type: 'typeChar', char: 'x' });
    typingReducer(before, { type: 'backspace' });
    expect(before).toEqual(snapshot);
  });
});

describe('per-key error counts (RES-03 heatmap data)', () => {
  test('only WRONG keystrokes are recorded, and they accumulate per key', () => {
    // text "abc": 'x' wrong at 0, 'b' correct at 1, 'y' wrong at 1.
    const state = typeAll(stateFor('abc', 'accumulate'), ['x', 'b', 'y']);
    expect(state.keyErrors).toEqual({ x: 1, y: 1 });
    expect(state.correctKeystrokes).toBe(1);
  });

  test('stop mode records the same per-key errors (blocked but counted)', () => {
    let state = stateFor('ab', 'stop');
    state = typingReducer(state, { type: 'typeChar', char: 'z' });
    state = typingReducer(state, { type: 'typeChar', char: 'z' });
    state = typingReducer(state, { type: 'typeChar', char: 'w' });
    expect(state.keyErrors).toEqual({ z: 2, w: 1 });
    expect(state.errors).toEqual([]); // stop mode never marks positions
  });

  test('letters are lower-cased: X and x are the same physical key', () => {
    expect(errorKeyFor('X')).toBe('x');
    expect(errorKeyFor('a')).toBe('a');
    const state = typeAll(stateFor('A', 'stop'), ['x', 'X']);
    expect(state.keyErrors).toEqual({ x: 2 });
  });

  test('digits, punctuation and spaces keep their own keys', () => {
    expect(errorKeyFor('5')).toBe('5');
    expect(errorKeyFor(';')).toBe(';');
    expect(errorKeyFor(' ')).toBe(' ');
    let state = stateFor('a b', 'stop');
    state = typingReducer(state, { type: 'typeChar', char: '5' });
    state = typingReducer(state, { type: 'typeChar', char: '5' });
    state = typingReducer(state, { type: 'typeChar', char: ';' });
    expect(state.keyErrors).toEqual({ 5: 2, ';': 1 });
  });

  test('backspace and correct keystrokes never touch the map', () => {
    let state = stateFor('ab', 'accumulate');
    state = typingReducer(state, { type: 'typeChar', char: 'x' }); // wrong
    state = typingReducer(state, { type: 'backspace' }); // vacate the error
    state = typingReducer(state, { type: 'typeChar', char: 'a' }); // correct
    expect(state.keyErrors).toEqual({ x: 1 }); // the historical error stays
    expect(state.correctKeystrokes).toBe(1);
  });

  test('the map is immutable: the previous state is never mutated', () => {
    const before = stateFor('ab', 'stop');
    const beforeSnapshot = { ...before.keyErrors };
    const after = typingReducer(before, { type: 'typeChar', char: 'z' });
    expect(before.keyErrors).toEqual({});
    expect(beforeSnapshot).toEqual({});
    expect(after.keyErrors).toEqual({ z: 1 });
  });

  test('a fresh state and a resume start with an empty map', () => {
    expect(stateFor('abc').keyErrors).toEqual({});
    expect(
      createTypingState({
        text: 'abc',
        errorMode: 'accumulate',
        initialProgress: { validatedChars: 2, correctKeystrokes: 2, totalKeystrokes: 4 },
      }).keyErrors,
    ).toEqual({});
  });
});

describe('liveStats (Annexe A on the current counters)', () => {
  test('net/raw WPM and accuracy follow the Annexe A formulas', () => {
    // "abc def" = 7 chars; 1 error, then corrected: 7 correct / 8 total.
    let state = stateFor('abc def', 'stop');
    state = typingReducer(state, { type: 'typeChar', char: 'x' }); // error (blocked)
    state = typeAll(state, ['a', 'b', 'c', ' ', 'd', 'e', 'f']);

    const stats = liveStats(state, 60_000);
    // net WPM = 7 ÷ 5 ÷ 1 min = 1.4; raw WPM = 8 ÷ 5 ÷ 1 = 1.6.
    expect(stats.netWpm).toBe(1.4);
    expect(stats.rawWpm).toBe(1.6);
    // accuracy = 7 ÷ 8 × 100 = 87.5.
    expect(stats.accuracy).toBe(87.5);
  });

  test('scales with the elapsed time (half a minute doubles the rate)', () => {
    const state = typeAll(stateFor('abcdefghij'), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
    const oneMinute = liveStats(state, 60_000);
    const halfMinute = liveStats(state, 30_000);
    expect(oneMinute.netWpm).toBe(2); // 10 ÷ 5 ÷ 1
    expect(halfMinute.netWpm).toBe(4); // 10 ÷ 5 ÷ 0.5
  });

  test('is zero (not Infinity) when nothing was typed or no time elapsed', () => {
    const fresh = liveStats(stateFor('abc'), 60_000);
    expect(fresh).toEqual({ netWpm: 0, rawWpm: 0, accuracy: 0 });
    const typed = liveStats(typeAll(stateFor('abc'), ['a']), 0);
    expect(typed).toEqual({ netWpm: 0, rawWpm: 0, accuracy: 100 });
  });

  test('progressCounters mirrors the state counters (COURSE-06 shape)', () => {
    const state = typeAll(stateFor('ab', 'stop'), ['z', 'a']);
    expect(progressCounters(state)).toEqual({
      validatedChars: 1,
      correctKeystrokes: 1,
      totalKeystrokes: 2,
    });
  });
});

describe('applyTextDelta (BONUS-04 text adjustments)', () => {
  test('addWords appends the words with a separator space and preserves the whole state', () => {
    let state = typeAll(stateFor('le roi nain'), ['l', 'e']);
    state = typingReducer(state, { type: 'typeChar', char: 'z' }); // error at 2, caret 3
    const before = { ...state };

    const next = applyTextDelta(state, { words: ['forge', 'rune'] });

    expect(next.text).toBe('le roi nain forge rune');
    // Everything except the text survives: counters, caret, marks, heatmap.
    expect(next.validatedChars).toBe(2);
    expect(next.correctKeystrokes).toBe(2);
    expect(next.totalKeystrokes).toBe(3);
    expect(next.currentIndex).toBe(3);
    expect(next.errors).toEqual([2]);
    expect(next.keyErrors).toEqual({ z: 1 });
    expect(next.errorMode).toBe('accumulate');
    // Pure: the previous state is untouched.
    expect(state).toEqual(before);
  });

  test('addWords with no words changes nothing (same reference)', () => {
    const state = stateFor('le roi');
    expect(applyTextDelta(state, { words: [] })).toBe(state);
  });

  test('removeWords removes words beyond the caret, never before it', () => {
    let state = typeAll(stateFor('un deux trois quatre'), ['u', 'n', ' ']); // caret 3
    state = typingReducer(state, { type: 'typeChar', char: 'z' }); // error at 3, caret 4

    // More words requested than remain: only what exists is removed, and the
    // typed prefix (with its error mark) is untouched.
    const next = applyTextDelta(state, { wordCount: 10 });

    expect(next.text).toBe('un deux');
    expect(next.validatedChars).toBe(3);
    expect(next.currentIndex).toBe(4);
    expect(next.errors).toEqual([3]);
    expect(next.correctKeystrokes).toBe(3);
    expect(next.totalKeystrokes).toBe(4);
  });

  test('removeWords clamps: a single remaining word or an empty suffix removes nothing', () => {
    const almostDone = typeAll(
      stateFor('bonjour le monde'),
      ['b', 'o', 'n', 'j', 'o', 'u', 'r', ' ', 'l', 'e', ' '],
    );
    expect(applyTextDelta(almostDone, { wordCount: 3 })).toBe(almostDone);

    const done = typeAll(stateFor('bonjour'), ['b', 'o', 'n', 'j', 'o', 'u', 'r']);
    expect(applyTextDelta(done, { wordCount: 3 })).toBe(done);
  });

  test('completion follows the adjusted length: growth reopens the text, shrinkage shortens it', () => {
    // Growth: a completed text becomes incomplete again with the extra words.
    const complete = typeAll(stateFor('bonjour'), ['b', 'o', 'n', 'j', 'o', 'u', 'r']);
    expect(isComplete(complete)).toBe(true);
    const grown = applyTextDelta(complete, { words: ['nain'] });
    expect(grown.text).toBe('bonjour nain');
    expect(isComplete(grown)).toBe(false);
    const refinished = typeAll(grown, [' ', 'n', 'a', 'i', 'n']);
    expect(isComplete(refinished)).toBe(true);
    expect(refinished.validatedChars).toBe(grown.text.length);

    // Shrinkage: the remaining work is measured against the new effective
    // length, so the player finishes after typing the shrunken text.
    const beforeShrink = typeAll(
      stateFor('bonjour le monde'),
      ['b', 'o', 'n', 'j', 'o', 'u', 'r', ' '],
    );
    const shrunk = applyTextDelta(beforeShrink, { wordCount: 1 });
    expect(shrunk.text).toBe('bonjour le');
    expect(isComplete(shrunk)).toBe(false);
    const finished = typeAll(shrunk, ['l', 'e']);
    expect(isComplete(finished)).toBe(true);
    expect(finished.validatedChars).toBe(10); // the new effective length
  });

  test('the reducer dispatches applyTextDelta actions', () => {
    const grown = typingReducer(stateFor('bonjour'), {
      type: 'applyTextDelta',
      delta: { words: ['nain'] },
    });
    expect(grown.text).toBe('bonjour nain');
    const shrunk = typingReducer(grown, { type: 'applyTextDelta', delta: { wordCount: 1 } });
    expect(shrunk.text).toBe('bonjour');
  });
});
