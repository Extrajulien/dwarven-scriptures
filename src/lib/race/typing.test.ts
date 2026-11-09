/**
 * @jest-environment node
 *
 * Unit tests for the pure typing reducer (COURSE-04, CONF-04/08): the
 * error modes (accumulate vs stop), the documented backspace semantics, the
 * character classes (spaces, accents, case), completeness, and the live
 * stats math (Annexe A) computed by `liveStats` on the current counters.
 */

import {
  createTypingState,
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

describe('typeChar — wrong keystrokes in both error modes', () => {
  test('accumulate: a wrong char is counted and marked but never advances', () => {
    const wrong = typingReducer(stateFor('ab', 'accumulate'), { type: 'typeChar', char: 'z' });
    expect(wrong.validatedChars).toBe(0);
    expect(wrong.currentIndex).toBe(0);
    expect(wrong.correctKeystrokes).toBe(0);
    expect(wrong.totalKeystrokes).toBe(1);
    expect(wrong.lastError).toBe(true);

    // The next correct char at the same position validates it and advances.
    const corrected = typingReducer(wrong, { type: 'typeChar', char: 'a' });
    expect(corrected.validatedChars).toBe(1);
    expect(corrected.currentIndex).toBe(1);
    expect(corrected.correctKeystrokes).toBe(1);
    expect(corrected.totalKeystrokes).toBe(2);
    expect(corrected.lastError).toBe(false);
  });

  test('stop: wrong attempts keep counting and never advance (blocked)', () => {
    let state = stateFor('ab', 'stop');
    state = typingReducer(state, { type: 'typeChar', char: 'z' });
    state = typingReducer(state, { type: 'typeChar', char: 'y' });
    state = typingReducer(state, { type: 'typeChar', char: 'x' });
    expect(state.validatedChars).toBe(0);
    expect(state.currentIndex).toBe(0);
    expect(state.totalKeystrokes).toBe(3);
    expect(state.correctKeystrokes).toBe(0);

    const corrected = typingReducer(state, { type: 'typeChar', char: 'a' });
    expect(corrected.validatedChars).toBe(1);
    expect(corrected.totalKeystrokes).toBe(4);
    expect(corrected.lastError).toBe(false);
  });

  test('the counter behaviour is identical in both modes (only the marking differs)', () => {
    const accumulate = typeAll(stateFor('abc', 'accumulate'), ['x', 'a', 'y', 'b', 'c']);
    const stop = typeAll(stateFor('abc', 'stop'), ['x', 'a', 'y', 'b', 'c']);
    const counters = (state: TypingState) => ({
      validatedChars: state.validatedChars,
      correctKeystrokes: state.correctKeystrokes,
      totalKeystrokes: state.totalKeystrokes,
      currentIndex: state.currentIndex,
      lastError: state.lastError,
    });
    expect(counters(accumulate)).toEqual(counters(stop));
    expect(accumulate.validatedChars).toBe(3);
    expect(accumulate.correctKeystrokes).toBe(3);
    expect(accumulate.totalKeystrokes).toBe(5);
    expect(isComplete(accumulate)).toBe(true);
  });
});

describe('backspace (documented choice)', () => {
  test('removes the last incorrect keystroke from the counter only', () => {
    const withError = typingReducer(stateFor('ab'), { type: 'typeChar', char: 'z' });
    const afterBackspace = typingReducer(withError, { type: 'backspace' });
    expect(afterBackspace.totalKeystrokes).toBe(0);
    // Everything else is untouched: no un-validation, no caret move.
    expect(afterBackspace.validatedChars).toBe(0);
    expect(afterBackspace.currentIndex).toBe(0);
    expect(afterBackspace.correctKeystrokes).toBe(0);
  });

  test('can never un-validate a validated character or move the caret back', () => {
    const typed = typeAll(stateFor('abc'), ['a', 'b']);
    const afterBackspace = typingReducer(typed, { type: 'backspace' });
    expect(afterBackspace.validatedChars).toBe(2);
    expect(afterBackspace.currentIndex).toBe(2);
    expect(afterBackspace).toBe(typed); // no-op: every keystroke was correct
  });

  test('floors at the correct keystroke count (server invariants hold)', () => {
    let state = typeAll(stateFor('ab'), ['z', 'a', 'b']);
    expect(state.totalKeystrokes).toBe(3);
    state = typingReducer(state, { type: 'backspace' });
    expect(state.totalKeystrokes).toBe(2);
    state = typingReducer(state, { type: 'backspace' });
    expect(state.totalKeystrokes).toBe(2); // floor: correctKeystrokes === 2
    expect(state.totalKeystrokes).toBeGreaterThanOrEqual(state.correctKeystrokes);
    expect(state.validatedChars).toBeLessThanOrEqual(state.totalKeystrokes);
  });

  test('is a no-op on a fresh state', () => {
    const fresh = stateFor('abc');
    expect(typingReducer(fresh, { type: 'backspace' })).toBe(fresh);
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
    const snapshot = { ...before };
    typingReducer(before, { type: 'typeChar', char: 'x' });
    typingReducer(before, { type: 'backspace' });
    expect(before).toEqual(snapshot);
  });
});

describe('liveStats (Annexe A on the current counters)', () => {
  test('net/raw WPM and accuracy follow the Annexe A formulas', () => {
    // "abc def" = 7 chars; 1 error, then corrected: 7 correct / 8 total.
    let state = stateFor('abc def');
    state = typingReducer(state, { type: 'typeChar', char: 'x' }); // error
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
    const state = typeAll(stateFor('ab'), ['z', 'a']);
    expect(progressCounters(state)).toEqual({
      validatedChars: 1,
      correctKeystrokes: 1,
      totalKeystrokes: 2,
    });
  });
});
