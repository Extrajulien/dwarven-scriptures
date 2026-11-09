/**
 * @jest-environment node
 *
 * Unit tests for the Annexe A formulas (COURSE-04 groundwork, COURSE-10):
 * net WPM, raw WPM, accuracy and progression, exactly as fixed by the
 * assignment so results stay comparable everywhere.
 */

import { accuracy, elapsedMinutes, netWpm, progression, rawWpm } from './stats';

describe('elapsedMinutes', () => {
  test('converts milliseconds to minutes', () => {
    expect(elapsedMinutes(60_000)).toBe(1);
    expect(elapsedMinutes(30_000)).toBe(0.5);
    expect(elapsedMinutes(0)).toBe(0);
  });
});

describe('netWpm (Annexe A)', () => {
  test('correctly typed characters ÷ 5 ÷ elapsed minutes', () => {
    // 250 correct chars in 1 minute → 50 words → 50 WPM.
    expect(netWpm({ correctChars: 250, elapsedMs: 60_000 })).toBe(50);
  });

  test('half a minute doubles the rate', () => {
    expect(netWpm({ correctChars: 250, elapsedMs: 30_000 })).toBe(100);
  });

  test('is zero when nothing was typed correctly', () => {
    expect(netWpm({ correctChars: 0, elapsedMs: 60_000 })).toBe(0);
  });

  test('is zero (not Infinity) when no time has elapsed', () => {
    expect(netWpm({ correctChars: 250, elapsedMs: 0 })).toBe(0);
    expect(netWpm({ correctChars: 250, elapsedMs: -5 })).toBe(0);
  });

  test('clamps negative character counts', () => {
    expect(netWpm({ correctChars: -10, elapsedMs: 60_000 })).toBe(0);
  });

  test('keeps full precision (no premature rounding)', () => {
    // 100 chars in 3 minutes → 100/5/3 = 6.666...
    expect(netWpm({ correctChars: 100, elapsedMs: 180_000 })).toBeCloseTo(6.6666666, 5);
  });
});

describe('rawWpm (Annexe A)', () => {
  test('total typed characters ÷ 5 ÷ elapsed minutes, errors included', () => {
    expect(rawWpm({ totalChars: 300, elapsedMs: 60_000 })).toBe(60);
  });

  test('is zero when nothing was typed or no time elapsed', () => {
    expect(rawWpm({ totalChars: 0, elapsedMs: 60_000 })).toBe(0);
    expect(rawWpm({ totalChars: 300, elapsedMs: 0 })).toBe(0);
  });

  test('differs from net WPM when errors were typed', () => {
    const input = { elapsedMs: 60_000 };
    expect(rawWpm({ ...input, totalChars: 300 })).toBeGreaterThan(
      netWpm({ ...input, correctChars: 290 }),
    );
  });
});

describe('accuracy (Annexe A)', () => {
  test('correct keystrokes ÷ total keystrokes × 100', () => {
    expect(accuracy({ correctKeystrokes: 95, totalKeystrokes: 100 })).toBe(95);
    expect(accuracy({ correctKeystrokes: 1, totalKeystrokes: 4 })).toBe(25);
    expect(accuracy({ correctKeystrokes: 100, totalKeystrokes: 100 })).toBe(100);
  });

  test('is zero when nothing has been typed', () => {
    expect(accuracy({ correctKeystrokes: 0, totalKeystrokes: 0 })).toBe(0);
  });

  test('never exceeds 100 even for inconsistent counters', () => {
    expect(accuracy({ correctKeystrokes: 120, totalKeystrokes: 100 })).toBe(100);
  });

  test('clamps negative correct keystrokes', () => {
    expect(accuracy({ correctKeystrokes: -5, totalKeystrokes: 100 })).toBe(0);
  });
});

describe('progression (Annexe A, BONUS-04)', () => {
  test('validated characters ÷ total text length as a 0..1 ratio', () => {
    expect(progression({ validatedChars: 25, totalTextLength: 100 })).toBe(0.25);
    expect(progression({ validatedChars: 100, totalTextLength: 100 })).toBe(1);
    expect(progression({ validatedChars: 0, totalTextLength: 100 })).toBe(0);
  });

  test('takes the bonus-adjusted length as an explicit parameter', () => {
    // A bonus lengthened the text by 20 chars: the same validated count now
    // sits at a lower ratio (the caller passes the adjusted length).
    expect(progression({ validatedChars: 30, totalTextLength: 120 })).toBe(0.25);
    // A bonus shortened the text by 20 chars.
    expect(progression({ validatedChars: 30, totalTextLength: 80 })).toBe(0.375);
  });

  test('is zero when the text length is zero (nothing to type)', () => {
    expect(progression({ validatedChars: 5, totalTextLength: 0 })).toBe(0);
  });

  test('clamps to 1 when the counters overshoot', () => {
    expect(progression({ validatedChars: 150, totalTextLength: 100 })).toBe(1);
  });

  test('spaces count as characters: they are part of validatedChars', () => {
    // "abc def" has 7 characters including the space; typing all 7 = 100 %.
    expect(progression({ validatedChars: 7, totalTextLength: 7 })).toBe(1);
    expect(progression({ validatedChars: 3, totalTextLength: 7 })).toBe(3 / 7);
  });
});
