/**
 * @jest-environment node
 *
 * Unit tests for coherent-passage selection (CONF-02/04/05/06/07). Pure
 * ranking over synthetic candidates — no database involved.
 */

import {
  countOptionMismatches,
  pickCoherentText,
  rankCandidates,
  type CoherentCandidate,
  type TextSelectionConfig,
} from './text-select';

const CONFIG: TextSelectionConfig = {
  textLanguage: 'fr',
  textComplexity: 'moyen',
  wordCount: 60,
  options: {
    punctuation: true,
    numbers: false,
    capitals: true,
    accents: true,
  },
};

function candidate(overrides: Partial<CoherentCandidate> = {}): CoherentCandidate {
  return {
    id: 1,
    title: 'Passage',
    body: 'Un passage.',
    language: 'fr',
    complexity: 'moyen',
    wordCount: 60,
    hasPunctuation: true,
    hasNumbers: false,
    hasCapitals: true,
    hasAccents: true,
    ...overrides,
  };
}

describe('countOptionMismatches (CONF-06/07)', () => {
  test('zero when every option matches its flag', () => {
    expect(countOptionMismatches(candidate(), CONFIG.options)).toBe(0);
  });

  test('counts an option turned on whose flag is absent', () => {
    expect(
      countOptionMismatches(candidate({ hasCapitals: false }), CONFIG.options),
    ).toBe(1);
  });

  test('counts an option turned off whose flag is present', () => {
    expect(
      countOptionMismatches(candidate({ hasNumbers: true }), CONFIG.options),
    ).toBe(1);
  });

  test('counts every mismatch', () => {
    expect(
      countOptionMismatches(
        candidate({
          hasPunctuation: false,
          hasNumbers: true,
          hasCapitals: false,
          hasAccents: false,
        }),
        CONFIG.options,
      ),
    ).toBe(4);
  });
});

describe('rankCandidates', () => {
  test('a language mismatch always loses to a language match (CONF-02)', () => {
    const wrongLanguage = candidate({ id: 2, title: 'Aaa', language: 'en' });
    const rightLanguage = candidate({ id: 1, title: 'Zzz', wordCount: 999 });

    expect(rankCandidates([wrongLanguage, rightLanguage], CONFIG).map((entry) => entry.id)).toEqual([
      1, 2,
    ]);
  });

  test('a complexity mismatch loses to a complexity match (CONF-05)', () => {
    const wrongComplexity = candidate({ id: 2, title: 'Aaa', complexity: 'difficile' });
    const rightComplexity = candidate({ id: 1, title: 'Zzz', wordCount: 999 });

    expect(
      rankCandidates([wrongComplexity, rightComplexity], CONFIG).map((entry) => entry.id),
    ).toEqual([1, 2]);
  });

  test('the closest word count wins (CONF-04)', () => {
    const far = candidate({ id: 1, title: 'Aaa', wordCount: 200 });
    const close = candidate({ id: 2, title: 'Zzz', wordCount: 64 });

    expect(rankCandidates([far, close], CONFIG).map((entry) => entry.id)).toEqual([2, 1]);
  });

  test('at equal word count, fewer option mismatches win (CONF-06)', () => {
    const mismatching = candidate({
      id: 1,
      title: 'Aaa',
      hasPunctuation: false,
      hasCapitals: false,
      hasAccents: false,
    });
    const matching = candidate({ id: 2, title: 'Zzz' });

    expect(rankCandidates([mismatching, matching], CONFIG).map((entry) => entry.id)).toEqual([
      2, 1,
    ]);
  });

  test('option compatibility breaks a word-count tie before the title', () => {
    const farButCompatible = candidate({ id: 1, title: 'Aaa', wordCount: 55, hasNumbers: true });
    const closeButMismatching = candidate({ id: 2, title: 'Bbb', wordCount: 55 });

    // Both are 5 words away; the first has one option mismatch → second wins.
    expect(rankCandidates([farButCompatible, closeButMismatching], CONFIG).map((entry) => entry.id)).toEqual([
      2, 1,
    ]);
  });

  test('title sorts ascending as the final tie-break (deterministic)', () => {
    const beta = candidate({ id: 1, title: 'Bêta' });
    const alpha = candidate({ id: 2, title: 'Alpha' });

    expect(rankCandidates([beta, alpha], CONFIG).map((entry) => entry.id)).toEqual([2, 1]);
  });

  test('does not mutate the input list', () => {
    const input = [candidate({ id: 1, title: 'B' }), candidate({ id: 2, title: 'A' })];
    const snapshot = [...input];

    rankCandidates(input, CONFIG);
    expect(input).toEqual(snapshot);
  });

  test('returns an empty ranking for an empty candidate list', () => {
    expect(rankCandidates([], CONFIG)).toEqual([]);
  });
});

describe('pickCoherentText', () => {
  test('returns the best-ranked candidate', () => {
    const best = candidate({ id: 7, title: 'Alpha', wordCount: 58 });
    const worst = candidate({ id: 8, title: 'Zulu', wordCount: 200, language: 'en' });

    expect(pickCoherentText([worst, best], CONFIG)?.id).toBe(7);
  });

  test('returns null when there is no candidate at all', () => {
    expect(pickCoherentText([], CONFIG)).toBeNull();
  });
});
