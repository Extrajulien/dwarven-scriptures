/**
 * WPM / accuracy / progression formulas (Annexe A of `doc/EXIGENCES.md`).
 *
 * The assignment fixes these formulas so results are comparable across the
 * whole application — every phase must use this module verbatim rather than
 * re-deriving its own math:
 *
 * - net WPM   = correctly typed characters ÷ 5 ÷ elapsed minutes
 * - raw WPM   = total typed characters ÷ 5 ÷ elapsed minutes
 * - accuracy  = correct keystrokes ÷ total keystrokes × 100
 * - progression = validated characters ÷ total text length (bonus-adjusted)
 *
 * Spaces count as characters. "Total text length" is passed in by the caller
 * so a bonus that adds or removes words (BONUS-04) is accounted for before
 * the division — the formula itself stays untouched.
 *
 * All functions are pure and return unrounded numbers: display rounding
 * (locale, decimals) is a UI concern, while callers that persist values keep
 * the full precision.
 */

const CHARS_PER_WORD = 5;
const MS_PER_MINUTE = 60_000;

/** Minutes elapsed from a millisecond duration (a named intermediate step). */
export function elapsedMinutes(elapsedMs: number): number {
  return elapsedMs / MS_PER_MINUTE;
}

/**
 * Net WPM: correctly typed characters ÷ 5 ÷ elapsed minutes. Returns `0`
 * when no time has elapsed (division by zero would otherwise yield
 * `Infinity`); negative inputs are clamped to `0`.
 */
export function netWpm(input: { correctChars: number; elapsedMs: number }): number {
  return wpmFromChars(input.correctChars, input.elapsedMs);
}

/**
 * Raw WPM: total typed characters ÷ 5 ÷ elapsed minutes, errors included.
 * Same guards as {@link netWpm}.
 */
export function rawWpm(input: { totalChars: number; elapsedMs: number }): number {
  return wpmFromChars(input.totalChars, input.elapsedMs);
}

function wpmFromChars(chars: number, elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 0;
  }
  const safeChars = Math.max(0, chars);
  return safeChars / CHARS_PER_WORD / elapsedMinutes(elapsedMs);
}

/**
 * Accuracy: correct keystrokes ÷ total keystrokes × 100. Returns `0` when
 * nothing has been typed yet; correct keystrokes above the total are clamped
 * to the total so accuracy can never exceed 100.
 */
export function accuracy(input: { correctKeystrokes: number; totalKeystrokes: number }): number {
  const total = Number.isFinite(input.totalKeystrokes) ? input.totalKeystrokes : 0;
  if (total <= 0) {
    return 0;
  }
  const correct = Number.isFinite(input.correctKeystrokes)
    ? Math.min(Math.max(0, input.correctKeystrokes), total)
    : 0;
  return (correct / total) * 100;
}

/**
 * Progression: validated characters ÷ total text length, expressed as a
 * ratio between `0` and `1`. `totalTextLength` is the **bonus-adjusted**
 * length (BONUS-04): the caller passes the current length of the text, so
 * words added or removed by a bonus are reflected before the division.
 * Spaces count as characters, exactly like every other validated character.
 */
export function progression(input: {
  validatedChars: number;
  totalTextLength: number;
}): number {
  const total = Number.isFinite(input.totalTextLength) ? input.totalTextLength : 0;
  if (total <= 0) {
    return 0;
  }
  const validated = Number.isFinite(input.validatedChars) ? input.validatedChars : 0;
  const ratio = validated / total;
  return Math.min(1, Math.max(0, ratio));
}
