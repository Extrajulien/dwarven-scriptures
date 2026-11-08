/**
 * @jest-environment node
 *
 * Unit tests for the measurable text-complexity helpers (CONF-05). These are
 * pure functions, so no mocking is needed; the same functions are used by the
 * seed script to justify the stored `complexity` of every corpus passage.
 */

import {
  classifyComplexity,
  COMPLEXITY_THRESHOLDS,
  computeTextMetrics,
  countWords,
  type ComplexityLevel,
  type TextMetrics,
} from './text-metrics';

describe('countWords', () => {
  test('counts whitespace-separated tokens', () => {
    expect(countWords('le chat dort')).toBe(3);
  });

  test('collapses runs of whitespace and newlines', () => {
    expect(countWords('  one\ttwo\n\nthree  ')).toBe(3);
  });

  test('returns zero for an empty or blank body', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n ')).toBe(0);
  });
});

describe('computeTextMetrics', () => {
  test('measures word count, length and ratios on plain text', () => {
    // 3 words: 2 + 4 + 4 letters = 10 -> avg 3.33; no long words, no specials.
    const metrics = computeTextMetrics('le chat dort');

    expect(metrics.wordCount).toBe(3);
    expect(metrics.avgWordLength).toBe(3.33);
    expect(metrics.longWordRatio).toBe(0);
    expect(metrics.specialCharRatio).toBe(0);
    expect(metrics.hasPunctuation).toBe(false);
    expect(metrics.hasNumbers).toBe(false);
    expect(metrics.hasCapitals).toBe(false);
    expect(metrics.hasAccents).toBe(false);
  });

  test('letter count ignores punctuation inside words', () => {
    // "chat" and "dort,": the comma is punctuation, not a letter.
    const metrics = computeTextMetrics('le chat dort,');

    expect(metrics.avgWordLength).toBe(3.33);
    expect(metrics.specialCharRatio).toBeGreaterThan(0);
    expect(metrics.hasPunctuation).toBe(true);
  });

  test('detects numbers, capitals and precomposed accents', () => {
    const metrics = computeTextMetrics("Bonjour, l'été 2024 !");

    expect(metrics.hasNumbers).toBe(true);
    expect(metrics.hasCapitals).toBe(true);
    expect(metrics.hasAccents).toBe(true);
    expect(metrics.hasPunctuation).toBe(true);
  });

  test('detects combining-mark accents', () => {
    // "e" + U+0301 is an accented e without a precomposed codepoint.
    const metrics = computeTextMetrics('cafe\u0301');

    expect(metrics.hasAccents).toBe(true);
  });

  test('counts long words (>= 8 letters) in the ratio', () => {
    const metrics = computeTextMetrics('antidisestablishmentarianism cat dog cat');

    // 1 of 4 words is long.
    expect(metrics.longWordRatio).toBe(0.25);
  });

  test('computes the special-character ratio over the whole body', () => {
    // "hi, there!" -> 10 characters, of which ',' and '!' are special.
    const metrics = computeTextMetrics('hi, there!');

    expect(metrics.specialCharRatio).toBe(0.2);
  });

  test('rounds ratios instead of leaking float noise', () => {
    const metrics = computeTextMetrics('a'.repeat(3));

    expect(metrics.avgWordLength).toBe(3);
    expect(metrics.longWordRatio).toBe(0);
    expect(metrics.specialCharRatio).toBe(0);
  });

  test('returns zeroed metrics for an empty body', () => {
    const metrics = computeTextMetrics('');

    expect(metrics).toEqual({
      wordCount: 0,
      avgWordLength: 0,
      longWordRatio: 0,
      specialCharRatio: 0,
      hasPunctuation: false,
      hasNumbers: false,
      hasCapitals: false,
      hasAccents: false,
    });
  });
});

describe('classifyComplexity', () => {
  const facile: Pick<TextMetrics, 'avgWordLength' | 'longWordRatio' | 'specialCharRatio'> = {
    avgWordLength: 3.8,
    longWordRatio: 0.02,
    specialCharRatio: 0.01,
  };

  const moyen: Pick<TextMetrics, 'avgWordLength' | 'longWordRatio' | 'specialCharRatio'> = {
    avgWordLength: 4.4,
    longWordRatio: 0.1,
    specialCharRatio: 0.04,
  };

  const difficile: Pick<TextMetrics, 'avgWordLength' | 'longWordRatio' | 'specialCharRatio'> = {
    avgWordLength: 5.0,
    longWordRatio: 0.15,
    specialCharRatio: 0.03,
  };

  test('classifies the three canonical profiles', () => {
    expect(classifyComplexity(facile)).toBe<ComplexityLevel>('facile');
    expect(classifyComplexity(moyen)).toBe<ComplexityLevel>('moyen');
    expect(classifyComplexity(difficile)).toBe<ComplexityLevel>('difficile');
  });

  test('votes facile at the facile ceilings (<= thresholds)', () => {
    const atCeilings = {
      avgWordLength: COMPLEXITY_THRESHOLDS.avgWordLength.facileMax,
      longWordRatio: COMPLEXITY_THRESHOLDS.longWordRatio.facileMax,
      specialCharRatio: COMPLEXITY_THRESHOLDS.specialCharRatio.facileMax,
    };

    expect(classifyComplexity(atCeilings)).toBe('facile');
  });

  test('votes difficile at the difficile floors (>= thresholds)', () => {
    const atFloors = {
      avgWordLength: COMPLEXITY_THRESHOLDS.avgWordLength.difficileMin,
      longWordRatio: COMPLEXITY_THRESHOLDS.longWordRatio.difficileMin,
      specialCharRatio: COMPLEXITY_THRESHOLDS.specialCharRatio.difficileMin,
    };

    expect(classifyComplexity(atFloors)).toBe('difficile');
  });

  test('weights the word-length vote double', () => {
    // avgWordLength alone in the moyen band: 1 * 2 = 2 points -> moyen,
    // while a single moyen longWordRatio (0.1) with everything else facile
    // only reaches 1 point -> facile.
    expect(
      classifyComplexity({ avgWordLength: 4.4, longWordRatio: 0, specialCharRatio: 0 }),
    ).toBe('moyen');
    expect(
      classifyComplexity({ avgWordLength: 4, longWordRatio: 0.1, specialCharRatio: 0 }),
    ).toBe('facile');
  });

  test('two difficile metrics outvote a facile third one', () => {
    expect(
      classifyComplexity({ avgWordLength: 5, longWordRatio: 0.2, specialCharRatio: 0.01 }),
    ).toBe('difficile');
  });

  test('a difficult word length plus special characters also reaches difficile', () => {
    // avg vote 2 (x2 = 4) + special vote 2 = 6 -> difficile.
    expect(
      classifyComplexity({ avgWordLength: 5, longWordRatio: 0.02, specialCharRatio: 0.08 }),
    ).toBe('difficile');
  });

  test('classifies zeroed metrics as facile', () => {
    expect(classifyComplexity({ avgWordLength: 0, longWordRatio: 0, specialCharRatio: 0 })).toBe(
      'facile',
    );
  });
});
