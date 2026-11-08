import {
  COMPLEXITY_THRESHOLDS,
  LONG_WORD_MIN_LETTERS,
  type ComplexityLevel,
} from '../text-metrics';

/**
 * Seeded, deterministic generator for random-word race texts (CONF-03/06).
 *
 * Everything is driven by a tiny mulberry32 PRNG — no dependencies, no
 * `Math.random`, no Date: the same `{ seed, language, complexity, wordCount,
 * options, dictionaryWords }` always produces the same text, byte for byte,
 * which makes the generator unit-testable and lets the server re-derive a
 * race text from its seed alone (BOT-05-style reproducibility).
 *
 * Option semantics (CONF-06):
 *
 * - `punctuation` — sentences of 5–12 words end with a period (most likely),
 *   exclamation mark or question mark, drawn deterministically.
 * - `capitals` — the first word of the body and of each sentence is
 *   capitalized; otherwise everything stays lowercase.
 * - `numbers` — with ~1/12 probability per slot a word is replaced by a
 *   number drawn from {@link FIXED_NUMBERS}; a number still occupies exactly
 *   one word slot, so `wordCount` is always respected.
 * - `accents` — French dictionaries carry accented words; with the option
 *   off, {@link stripAccents} deterministically replaces accented characters
 *   with their unaccented equivalents.
 *
 * Complexity (CONF-05): words are drawn from the *bucket* matching the
 * requested level, reusing the measurable thresholds of
 * `src/lib/text-metrics.ts` — at most `avgWordLength.facileMax` (4.3, i.e.
 * ≤ 4 letters) is facile, at least {@link LONG_WORD_MIN_LETTERS} (8 letters)
 * is difficile, and in between is moyen. When the provided dictionary holds
 * no word of the requested band, the whole dictionary is used as a fallback
 * so generation never crashes. The dictionaries are pre-filtered at seed
 * level (profanity-free, `src/db/seed.ts`); this module performs no content
 * filtering of its own.
 */

/** Number words injected when the `numbers` option is on (fixed list). */
export const FIXED_NUMBERS = [
  '2',
  '3',
  '5',
  '7',
  '11',
  '13',
  '42',
  '100',
  '365',
  '2026',
] as const;

const SENTENCE_END_MARKS = ['.', '!', '?'] as const;

/** Weight of the period among the sentence-end marks. */
const PERIOD_WEIGHT = 0.8;
/** Weight of the exclamation mark (the rest goes to the question mark). */
const EXCLAMATION_WEIGHT = 0.9;

/** Probability that a word slot holds an injected number. */
const NUMBER_WORD_PROBABILITY = 1 / 12;

const MIN_SENTENCE_WORDS = 5;
const MAX_SENTENCE_WORDS = 12;

const LETTERS = /\p{L}/gu;

/** Combining diacritical marks (U+0300–U+036F) removed by `stripAccents`. */
const COMBINING_MARKS = /[\u0300-\u036F]/g;

/** Letters that do not decompose under NFD and need an explicit mapping. */
const NON_DECOMPOSABLE: Record<string, string> = {
  'œ': 'oe',
  'Œ': 'OE',
  'æ': 'ae',
  'Æ': 'AE',
};

/**
 * mulberry32 PRNG: returns a function producing floats in `[0, 1)`. The seed
 * is coerced to a uint32, so any integer seed works and negative seeds wrap
 * deterministically.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically replaces accented characters with their unaccented
 * equivalents: first NFD decomposition (é → e + combining mark → e), then an
 * explicit map for the letters NFD does not decompose (œ → oe, æ → ae).
 */
export function stripAccents(text: string): string {
  const decomposed = text.normalize('NFD').replace(COMBINING_MARKS, '');
  return decomposed.replace(/[œŒæÆ]/g, (character) => NON_DECOMPOSABLE[character] ?? character);
}

/** Letters of a word (punctuation and digits never count, CONF-05). */
function letterCountOf(word: string): number {
  return word.match(LETTERS)?.length ?? 0;
}

/**
 * Whether a single word belongs to the requested complexity band, derived
 * from the measurable thresholds of `src/lib/text-metrics.ts`: ≤ 4 letters
 * (the `avgWordLength.facileMax` ceiling) is facile, ≥
 * {@link LONG_WORD_MIN_LETTERS} letters is difficile, in between is moyen.
 */
export function wordMatchesComplexity(word: string, complexity: ComplexityLevel): boolean {
  const letters = letterCountOf(word);

  if (letters <= Math.floor(COMPLEXITY_THRESHOLDS.avgWordLength.facileMax)) {
    return complexity === 'facile';
  }
  if (letters >= LONG_WORD_MIN_LETTERS) {
    return complexity === 'difficile';
  }
  return complexity === 'moyen';
}

/**
 * The words of a dictionary that fall in the requested complexity bucket
 * (CONF-05). Falls back to the whole dictionary when the bucket is empty so
 * generation never crashes on an uncooperative word list.
 */
export function wordsForComplexity(
  dictionaryWords: readonly string[],
  complexity: ComplexityLevel,
): string[] {
  const bucket = dictionaryWords.filter((word) => wordMatchesComplexity(word, complexity));
  return bucket.length > 0 ? bucket : [...dictionaryWords];
}

export type RandomTextOptions = {
  punctuation: boolean;
  numbers: boolean;
  capitals: boolean;
  accents: boolean;
};

export type GenerateRandomRaceTextParams = {
  language: 'fr' | 'en';
  complexity: ComplexityLevel;
  /** Number of words in the generated text (a number occupies one slot). */
  wordCount: number;
  options: RandomTextOptions;
  /** Word pool, normally `getDictionaryWords({ language, complexity })`. */
  dictionaryWords: readonly string[];
  seed: number;
};

export type WordSource = 'dictionary' | 'number';

/** One generated word, as it appears in the body, plus where it came from. */
export type PerWordSource = {
  word: string;
  source: WordSource;
};

export type GeneratedRaceText = {
  /** The full text to type, words separated by single spaces. */
  body: string;
  /** One entry per word of `body`, in order. */
  perWordSource: PerWordSource[];
};

function pickSentenceEndMark(random: () => number): string {
  const roll = random();
  if (roll < PERIOD_WEIGHT) {
    return SENTENCE_END_MARKS[0];
  }
  if (roll < EXCLAMATION_WEIGHT) {
    return SENTENCE_END_MARKS[1];
  }
  return SENTENCE_END_MARKS[2];
}

function sentenceLengthOf(random: () => number): number {
  const span = MAX_SENTENCE_WORDS - MIN_SENTENCE_WORDS + 1;
  return MIN_SENTENCE_WORDS + Math.floor(random() * span);
}

function capitalize(word: string): string {
  if (word.length === 0) {
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function assertWordCount(wordCount: number): void {
  if (!Number.isSafeInteger(wordCount) || wordCount < 1) {
    throw new RangeError('wordCount must be a positive integer');
  }
}

function assertSeed(seed: number): void {
  if (typeof seed !== 'number' || !Number.isFinite(seed)) {
    throw new RangeError('seed must be a finite number');
  }
}

/**
 * Generates one random-mode race text (CONF-03/06). Deterministic: identical
 * inputs produce an identical `body` and `perWordSource`; a different seed
 * produces a different draw.
 */
export function generateRandomRaceText(params: GenerateRandomRaceTextParams): GeneratedRaceText {
  assertWordCount(params.wordCount);
  assertSeed(params.seed);

  if (params.language !== 'fr' && params.language !== 'en') {
    throw new RangeError('language must be "fr" or "en"');
  }

  const pool = wordsForComplexity(params.dictionaryWords, params.complexity);
  if (pool.length === 0) {
    throw new RangeError('dictionaryWords must contain at least one word');
  }

  const random = createSeededRandom(params.seed);

  // First pass: pick the raw words and the sentence boundaries. Both are
  // decided before any transformation so the transforms stay independent of
  // the draw.
  const rawWords: string[] = [];
  const sources: WordSource[] = [];
  const sentenceEnds = new Set<number>();

  let remainingInSentence = params.options.punctuation ? sentenceLengthOf(random) : params.wordCount;
  for (let index = 0; index < params.wordCount; index += 1) {
    if (params.options.numbers && random() < NUMBER_WORD_PROBABILITY) {
      const numberIndex = Math.floor(random() * FIXED_NUMBERS.length);
      rawWords.push(FIXED_NUMBERS[numberIndex]);
      sources.push('number');
    } else {
      rawWords.push(pool[Math.floor(random() * pool.length)]);
      sources.push('dictionary');
    }

    remainingInSentence -= 1;
    if (params.options.punctuation && remainingInSentence === 0 && index < params.wordCount - 1) {
      sentenceEnds.add(index);
      remainingInSentence = sentenceLengthOf(random);
    }
  }

  // Second pass: apply the option transforms and assemble the body.
  const finalWords: string[] = [];
  for (let index = 0; index < rawWords.length; index += 1) {
    let word = rawWords[index];

    if (params.language === 'fr' && !params.options.accents) {
      word = stripAccents(word);
    }

    const isSentenceStart = index === 0 || sentenceEnds.has(index - 1);
    if (params.options.capitals && isSentenceStart) {
      word = capitalize(word);
    }

    // Sentence ends are marked mid-text, and the final word always carries
    // the closing mark so the generated text reads as a finished sentence.
    const isSentenceEnd =
      params.options.punctuation && (sentenceEnds.has(index) || index === rawWords.length - 1);
    const mark = isSentenceEnd ? pickSentenceEndMark(random) : '';
    finalWords.push(word + mark);
  }

  return {
    body: finalWords.join(' '),
    perWordSource: finalWords.map((word, index) => ({
      // The mark is attached to the word; perWordSource carries the plain
      // word as typed (punctuation is part of the text, not of the word).
      word: word.replace(/[.!?]$/, ''),
      source: sources[index],
    })),
  };
}
