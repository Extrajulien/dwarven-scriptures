/**
 * Measurable text complexity (CONF-05).
 *
 * Complexity is a property of the text, not an opinion: every passage in the
 * corpus stores the same three metrics this module computes, so the stored
 * `complexity` column is always justified by numbers. The thresholds used by
 * `classifyComplexity` are documented in `doc/database.md` and mirrored by the
 * doc comments on `src/db/schema.ts`.
 *
 * All functions are pure: they take text in, return numbers out, and never
 * touch the database, which keeps them unit-testable.
 */

export type ComplexityLevel = 'facile' | 'moyen' | 'difficile';

export type TextMetrics = {
  /** Number of whitespace-separated tokens. */
  wordCount: number;
  /** Mean number of letters per word, rounded to 2 decimals. */
  avgWordLength: number;
  /** Share of words with >= 8 letters, rounded to 4 decimals (0–1). */
  longWordRatio: number;
  /**
   * Share of characters that are neither letters, digits nor whitespace
   * (punctuation + symbols), rounded to 4 decimals (0–1).
   */
  specialCharRatio: number;
  hasPunctuation: boolean;
  hasNumbers: boolean;
  hasCapitals: boolean;
  /** French-style accents: precomposed Latin-1 letters or combining marks. */
  hasAccents: boolean;
};

export const COMPLEXITY_THRESHOLDS = {
  /** A metric below `facileMax` votes "facile"; at/above `difficileMin` votes "difficile". */
  avgWordLength: { facileMax: 4.3, difficileMin: 4.55 },
  longWordRatio: { facileMax: 0.09, difficileMin: 0.13 },
  specialCharRatio: { facileMax: 0.03, difficileMin: 0.07 },
} as const;

/**
 * Vote totals that delimit the levels once the word-length vote is doubled
 * (possible range 0–8): `<= 1` facile, `2–4` moyen, `>= 5` difficile.
 */
const FACILE_MAX_VOTE_SUM = 1;
const MOYEN_MAX_VOTE_SUM = 4;

/** Words of this many letters or more count as "long". */
const LONG_WORD_MIN_LETTERS = 8;

const LETTERS = /\p{L}/gu;

/** Punctuation and symbols (everything that is not letter, digit, whitespace). */
const NOT_LETTER_DIGIT_SPACE = /[^\p{L}\p{N}\s]/u;

/** Latin-1 precomposed accented letters (covers French accents + ç, œ, æ). */
const PRECOMPOSED_ACCENTS = /[À-ÖØ-öø-ÿœŒæÆ]/;

/** Combining diacritical marks (U+0300–U+036F), e.g. `e` + U+0301. */
const COMBINING_MARKS = /[\u0300-\u036F]/;

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function lettersIn(word: string): number {
  return word.match(LETTERS)?.length ?? 0;
}

/** The whitespace-separated tokens of a body, without empty strings. */
function tokensOf(body: string): string[] {
  return body.split(/\s+/).filter((token) => token.length > 0);
}

/** Number of whitespace-separated words. */
export function countWords(body: string): number {
  return tokensOf(body).length;
}

/**
 * Computes every measurable complexity metric for a body of text.
 *
 * Word length counts letters only (`\p{L}`), so punctuation never inflates the
 * average; the punctuation is measured separately by `specialCharRatio`.
 */
export function computeTextMetrics(body: string): TextMetrics {
  const words = tokensOf(body);
  const wordCount = words.length;

  const totalLetters = words.reduce((sum, word) => sum + lettersIn(word), 0);
  const longWords = words.filter((word) => lettersIn(word) >= LONG_WORD_MIN_LETTERS).length;

  const characters = [...body];
  const specialChars = characters.filter((character) =>
    NOT_LETTER_DIGIT_SPACE.test(character),
  ).length;

  return {
    wordCount,
    avgWordLength: wordCount > 0 ? round(totalLetters / wordCount, 2) : 0,
    longWordRatio: wordCount > 0 ? round(longWords / wordCount, 4) : 0,
    specialCharRatio:
      characters.length > 0 ? round(specialChars / characters.length, 4) : 0,
    hasPunctuation: /[\p{P}\p{S}]/u.test(body),
    hasNumbers: /[0-9]/.test(body),
    hasCapitals: /\p{Lu}/u.test(body),
    hasAccents: PRECOMPOSED_ACCENTS.test(body) || COMBINING_MARKS.test(body),
  };
}

/**
 * One metric's vote for the overall level: `0` = facile, `1` = moyen,
 * `2` = difficile. A value at or below the facile ceiling votes facile, at or
 * above the difficile floor votes difficile, and anything in between votes
 * moyen.
 */
function metricVote(
  value: number,
  facileMax: number,
  difficileMin: number,
): 0 | 1 | 2 {
  if (value <= facileMax) {
    return 0;
  }
  if (value >= difficileMin) {
    return 2;
  }
  return 1;
}

/**
 * Classifies a text from its metrics: each of the three metrics votes
 * facile/moyen/difficile (0/1/2) and the votes are summed, with the
 * word-length vote **counting double** because long words dominate typing
 * effort. Sum `<= 1` is facile, `2–4` is moyen, `>= 5` is difficile.
 * Thresholds are `COMPLEXITY_THRESHOLDS` (documented in `doc/database.md`).
 */
export function classifyComplexity(
  metrics: Pick<TextMetrics, 'avgWordLength' | 'longWordRatio' | 'specialCharRatio'>,
): ComplexityLevel {
  const voteSum =
    metricVote(
      metrics.avgWordLength,
      COMPLEXITY_THRESHOLDS.avgWordLength.facileMax,
      COMPLEXITY_THRESHOLDS.avgWordLength.difficileMin,
    ) *
      2 +
    metricVote(
      metrics.longWordRatio,
      COMPLEXITY_THRESHOLDS.longWordRatio.facileMax,
      COMPLEXITY_THRESHOLDS.longWordRatio.difficileMin,
    ) +
    metricVote(
      metrics.specialCharRatio,
      COMPLEXITY_THRESHOLDS.specialCharRatio.facileMax,
      COMPLEXITY_THRESHOLDS.specialCharRatio.difficileMin,
    );

  if (voteSum <= FACILE_MAX_VOTE_SUM) {
    return 'facile';
  }
  if (voteSum <= MOYEN_MAX_VOTE_SUM) {
    return 'moyen';
  }
  return 'difficile';
}
