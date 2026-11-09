/**
 * @jest-environment node
 *
 * Unit tests for the seeded random-text generator (CONF-03/05/06). The
 * generator is fully deterministic, so option toggles, word counts and
 * determinism are asserted exactly — no database needed.
 */

import {
  createSeededRandom,
  FIXED_NUMBERS,
  generateRandomRaceText,
  stripAccents,
  wordMatchesComplexity,
  wordsForComplexity,
  type RandomTextOptions,
} from './text-generator';

const FR_WORDS = [
  'le',
  'la',
  'chat',
  'café',
  'français',
  'cœur',
  'élève',
  'maison',
  'jardin',
  'extraordinaire',
];

const EN_WORDS = [
  'the',
  'and',
  'cat',
  'dog',
  'window',
  'mountain',
  'unbelievable',
];

const DEFAULT_OPTIONS: RandomTextOptions = {
  punctuation: true,
  numbers: true,
  capitals: true,
  accents: true,
};

function generate(overrides: Partial<Parameters<typeof generateRandomRaceText>[0]> = {}) {
  return generateRandomRaceText({
    language: 'fr',
    complexity: 'moyen',
    wordCount: 60,
    options: DEFAULT_OPTIONS,
    dictionaryWords: FR_WORDS,
    seed: 42,
    ...overrides,
  });
}

describe('createSeededRandom (mulberry32)', () => {
  test('produces floats in [0, 1)', () => {
    const random = createSeededRandom(1);
    for (let index = 0; index < 1_000; index += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test('is deterministic for a seed and differs across seeds', () => {
    const first = createSeededRandom(7);
    const second = createSeededRandom(7);
    const third = createSeededRandom(8);

    const draw = (random: () => number) => Array.from({ length: 10 }, () => random());
    expect(draw(first)).toEqual(draw(second));
    expect(draw(first)).not.toEqual(draw(third));
  });
});

describe('stripAccents', () => {
  test('replaces precomposed accented letters deterministically', () => {
    expect(stripAccents('café')).toBe('cafe');
    expect(stripAccents('français')).toBe('francais');
    expect(stripAccents('élève')).toBe('eleve');
    expect(stripAccents('àâäçèéêëîïôöùûüÿ')).toBe('aaaceeeeiioouuuy');
  });

  test('handles letters NFD does not decompose', () => {
    expect(stripAccents('cœur')).toBe('coeur');
    expect(stripAccents('Œuvre')).toBe('OEuvre');
    expect(stripAccents('æther')).toBe('aether');
  });

  test('handles combining marks and leaves unaccented text untouched', () => {
    expect(stripAccents('e\u0301cole')).toBe('ecole');
    expect(stripAccents('plain text')).toBe('plain text');
  });
});

describe('wordMatchesComplexity / wordsForComplexity (CONF-05)', () => {
  test('buckets single words with the text-metrics thresholds', () => {
    expect(wordMatchesComplexity('chat', 'facile')).toBe(true);
    expect(wordMatchesComplexity('chat', 'moyen')).toBe(false);
    expect(wordMatchesComplexity('maison', 'moyen')).toBe(true);
    expect(wordMatchesComplexity('maison', 'facile')).toBe(false);
    expect(wordMatchesComplexity('extraordinaire', 'difficile')).toBe(true);
    expect(wordMatchesComplexity('extraordinaire', 'moyen')).toBe(false);
  });

  test('keeps only the requested bucket, falling back to the full list when empty', () => {
    const mixed = ['chat', 'maison', 'extraordinaire'];

    expect(wordsForComplexity(mixed, 'facile')).toEqual(['chat']);
    expect(wordsForComplexity(mixed, 'moyen')).toEqual(['maison']);
    expect(wordsForComplexity(mixed, 'difficile')).toEqual(['extraordinaire']);

    // No long word in the list: fall back instead of crashing.
    expect(wordsForComplexity(['chat', 'maison'], 'difficile')).toEqual(['chat', 'maison']);
  });
});

describe('generateRandomRaceText — determinism', () => {
  test('the same seed produces byte-identical texts and sources', () => {
    const first = generate();
    const second = generate();

    expect(first).toEqual(second);
    expect(first.body).toBe(second.body);
    expect(first.perWordSource).toEqual(second.perWordSource);
  });

  test('different seeds produce different texts', () => {
    const bodies = new Set([1, 2, 3, 4, 5].map((seed) => generate({ seed }).body));
    expect(bodies.size).toBe(5);
  });

  test('different option sets change the output', () => {
    const withPunctuation = generate();
    const withoutPunctuation = generate({
      options: { ...DEFAULT_OPTIONS, punctuation: false },
    });
    expect(withPunctuation.body).not.toBe(withoutPunctuation.body);
  });
});

describe('generateRandomRaceText — wordCount (CONF-04)', () => {
  test.each([10, 60, 200])('respects wordCount = %i exactly', (wordCount) => {
    const text = generate({ wordCount });

    expect(text.body.split(' ')).toHaveLength(wordCount);
    expect(text.perWordSource).toHaveLength(wordCount);
  });

  test('rejects a non-positive or non-integer wordCount', () => {
    expect(() => generate({ wordCount: 0 })).toThrow(RangeError);
    expect(() => generate({ wordCount: -3 })).toThrow(RangeError);
    expect(() => generate({ wordCount: 1.5 })).toThrow(RangeError);
  });
});

describe('generateRandomRaceText — option toggles (CONF-06)', () => {
  test('punctuation on: sentences end with a mark, text ends with one', () => {
    const text = generate({ options: { ...DEFAULT_OPTIONS, numbers: false } });
    expect(/[.!?]$/.test(text.body)).toBe(true);
    expect(text.body.match(/[.!?]/g)?.length ?? 0).toBeGreaterThan(1);
  });

  test('punctuation off: no sentence marks anywhere', () => {
    const text = generate({ options: { ...DEFAULT_OPTIONS, punctuation: false } });
    expect(/[.!?]/.test(text.body)).toBe(false);
  });

  test('capitals on: the text starts with a capital', () => {
    const text = generate({ options: { ...DEFAULT_OPTIONS, numbers: false } });
    expect(text.body[0]).toBe(text.body[0].toUpperCase());
  });

  test('capitals off: no uppercase letter anywhere', () => {
    const text = generate({ options: { ...DEFAULT_OPTIONS, capitals: false } });
    expect(/\p{Lu}/u.test(text.body)).toBe(false);
  });

  test('numbers on: injected numbers all come from the fixed list', () => {
    const text = generate({ wordCount: 200 });
    const numberWords = text.perWordSource
      .filter((entry) => entry.source === 'number')
      .map((entry) => entry.word);

    expect(numberWords.length).toBeGreaterThan(0);
    for (const word of numberWords) {
      expect(FIXED_NUMBERS).toContain(word as (typeof FIXED_NUMBERS)[number]);
    }
  });

  test('numbers off: no digit appears', () => {
    const text = generate({ options: { ...DEFAULT_OPTIONS, numbers: false } });
    expect(/\d/.test(text.body)).toBe(false);
    expect(text.perWordSource.every((entry) => entry.source === 'dictionary')).toBe(true);
  });

  test('accents off (fr): accented characters are replaced', () => {
    const accented = ['école', 'élève', 'fenêtre', 'pêche', 'forêt', 'marché', 'château'];
    const text = generate({
      wordCount: 60,
      dictionaryWords: accented,
      options: { ...DEFAULT_OPTIONS, accents: false, punctuation: false, capitals: false, numbers: false },
    });

    expect(/[\u0300-\u036F]/u.test(text.body)).toBe(false);
    expect(/[àâäçèéêëîïôöùûüœæ]/i.test(text.body)).toBe(false);
    expect(text.body).toContain('ecole');
    expect(text.body).toContain('eleve');
    expect(text.body).toContain('fenetre');
    expect(text.body).toContain('peche');
    expect(text.body).toContain('foret');
  });

  test('accents on (fr): accented words keep their accents', () => {
    const text = generate({
      wordCount: 60,
      dictionaryWords: ['café', 'élève'],
      options: { ...DEFAULT_OPTIONS, punctuation: false, numbers: false, capitals: false },
    });

    expect(/[é]/.test(text.body)).toBe(true);
    expect(text.body).not.toContain('cafe');
  });
});

describe('generateRandomRaceText — dictionaries and complexity', () => {
  test('every word comes from the pool or the fixed numbers', () => {
    const text = generate({ wordCount: 100 });
    const allowed = new Set<string>([...FR_WORDS, ...FIXED_NUMBERS]);

    for (const entry of text.perWordSource) {
      // Sentence-start words are capitalized; compare case-insensitively.
      expect(allowed.has(entry.word.toLowerCase())).toBe(true);
    }
  });

  test('an English dictionary generates English words', () => {
    const text = generate({ language: 'en', dictionaryWords: EN_WORDS });
    const allowed = new Set<string>([...EN_WORDS, ...FIXED_NUMBERS]);

    expect(text.perWordSource.every((entry) => allowed.has(entry.word.toLowerCase()))).toBe(true);
  });

  test('difficile draws long words from a mixed dictionary', () => {
    const text = generate({
      complexity: 'difficile',
      wordCount: 60,
      dictionaryWords: ['chat', 'maison', 'extraordinaire', 'incroyablement'],
      options: { ...DEFAULT_OPTIONS, numbers: false, capitals: false },
    });

    const dictionaryWords = text.perWordSource
      .filter((entry) => entry.source === 'dictionary')
      .map((entry) => entry.word);
    expect(dictionaryWords.length).toBe(60);
    expect(dictionaryWords.every((word) => wordMatchesComplexity(word, 'difficile'))).toBe(true);
  });

  test('rejects an empty dictionary and a bad seed', () => {
    expect(() => generate({ dictionaryWords: [] })).toThrow(RangeError);
    expect(() => generate({ seed: Number.NaN })).toThrow(RangeError);
  });
});
