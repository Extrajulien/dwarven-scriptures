import type { BotLevel } from '../../db/schema';
import { netWpm } from '../race/stats';
import { createSeededRandom } from '../race/text-generator';

export type { BotLevel };

/**
 * Seeded, deterministic per-character typing schedule for bots (BOT-01/02/03/
 * 05). A schedule is the exact keystroke timeline a bot will play against the
 * race text, generated from `{ text, level, seed, errorMode }` alone — no
 * clock, no `Math.random`, no dependencies. The same inputs always produce
 * the same timeline, byte for byte (BOT-05), which makes the bot engine
 * replayable and unit-testable (ADR-011: bots drive the same race model as
 * humans, through the same cumulative counters).
 *
 * ## What the timeline models (BOT-02 — never a constant speed)
 *
 * The text is segmented into words and gaps. Every keystroke gets a time
 * `atMs` (milliseconds after the typing start) drawn from a mulberry32 PRNG
 * (the same pattern as `src/lib/race/text-generator.ts`):
 *
 * - **Base speed:** one per-bot WPM drawn from the level's typing-speed
 *   range (`baseWpmRange`), then converted to a per-character base interval
 *   (`60_000 / (wpm × 5)` ms, Annexe A "word" = 5 characters).
 * - **Bursts (accelerations):** each word is typed as a burst whose first
 *   character costs `burstStartFactor` × the base interval and whose last
 *   character costs `2 − burstStartFactor` × it, linearly in between — the
 *   ramp is time-neutral (mean multiplier 1.0), so the bot visibly
 *   accelerates through every word without drifting the mean WPM.
 * - **Hesitations:** with `hesitationChance` per word boundary, a pure pause
 *   of `hesitationFactor` × the base interval is inserted before the next
 *   word (a pause costs time but types nothing).
 * - **Hard-word slowdowns:** words of at least `hardWordLength` letters are
 *   typed at `hardWordSpeedFactor` (e.g. 0.65–0.85× the base speed for noob).
 * - **Jitter:** every keystroke interval is multiplied by a seeded uniform
 *   factor in {@link CHAR_JITTER_RANGE} (±20 %), so no two intervals are
 *   equal.
 * - **Sentence pauses:** after `.`, `!` or `?`, a short natural pause
 *   (`PUNCTUATION_PAUSE_FACTOR` × the base interval) is added.
 *
 * ## Errors (BOT-03)
 *
 * Each letter is mistyped with probability `errorRate`: the bot types the
 * WRONG character first (`error` step — `totalKeystrokes` only), waits a
 * level-scaled correction delay (`correctionDelayFactor` × the base
 * interval), then types the correct character (`correction` step —
 * `validatedChars`/`correctKeystrokes`/`totalKeystrokes` all advance). Only
 * letters error (spaces and punctuation are always `correct`).
 *
 * **`errorMode` semantics (documented choice):** both modes produce the same
 * natural timeline today — immediate correction. In `stop` the bot cannot
 * advance past the error until the correct key (natural); in `accumulate` it
 * corrects immediately too, which is valid typing under that mode and keeps
 * `validatedChars === correctKeystrokes`, so the counters stay valid for
 * both modes. The parameter is validated and plumbed through so a future
 * `accumulate` variant (keep going, backspace later) never changes the
 * engine contract.
 */

/** Accepted error modes (CONF-08); see the module note on why they coincide. */
export type BotErrorMode = 'accumulate' | 'stop';

export type BotStepKind = 'correct' | 'error' | 'correction';

/** One keystroke of the bot timeline (BOT-01). */
export type BotScheduleStep = {
  /** 0-based character index in the race text (spaces count, Annexe A). */
  index: number;
  /** Milliseconds after the typing start at which the keystroke happens. */
  atMs: number;
  kind: BotStepKind;
};

/** The complete keystroke timeline of one bot for one race text. */
export type BotSchedule = {
  steps: BotScheduleStep[];
};

/**
 * Level parameters mapping BOT-01's indicative ranges to schedule knobs.
 * `baseWpmRange` is the per-bot *typing* speed: it sits deliberately above
 * the EXIGENCES target range so that the achieved **net** WPM (Annexe A,
 * errors/hesitations/slowdowns included) lands inside the documented target
 * band on representative texts (verified by `schedule.test.ts`).
 */
export type BotLevelParams = {
  /** Per-bot typing-speed WPM range drawn from (seeded). */
  baseWpmRange: readonly [number, number];
  /** Probability that a letter is mistyped (BOT-01 indicative error rate). */
  errorRate: number;
  /** Correction delay after an error, as a multiple of the base interval. */
  correctionDelayFactor: readonly [number, number];
  /** Words of at least this many letters count as "hard" (BOT-02). */
  hardWordLength: number;
  /** Typing-speed factor on hard words (< 1 = slower). */
  hardWordSpeedFactor: readonly [number, number];
  /** Probability of a hesitation pause before a word (BOT-02). */
  hesitationChance: number;
  /** Hesitation length, as a multiple of the base interval. */
  hesitationFactor: readonly [number, number];
  /** Interval multiplier of the first character of a word burst (≥ 1). */
  burstStartFactor: number;
};

/**
 * BOT-01 → schedule parameter mapping (the chosen values, documented in
 * ADR-011 and `doc/EXIGENCES.md`):
 *
 * | Level        | EXIGENCES net WPM | typing WPM   | errorRate | correction |
 * | ------------ | ----------------- | ------------ | --------- | ---------- |
 * | noob         | 10–20             | 15–25        | 12 %      | 1.0–2.0×   |
 * | debutant     | 20–35             | 27–38        | 8 %       | 0.8–1.6×   |
 * | intermediaire| 35–60             | 45–62        | 5 %       | 0.7–1.4×   |
 * | expert       | 70–100            | 84–100       | 2 %       | 0.5–1.1×   |
 * | impossible   | 140+              | 165–230      | 0.5 %     | 0.4–0.9×   |
 *
 * The typing-WPM offset above the target band compensates the time lost to
 * errors, hesitations and hard-word slowdowns (the honest "adjustment" the
 * EXIGENCES allow to document). The harder the text, the lower the achieved
 * WPM — that is BOT-02 working as specified.
 */
export const BOT_LEVEL_PARAMS: Record<BotLevel, BotLevelParams> = {
  noob: {
    baseWpmRange: [15, 25],
    errorRate: 0.12,
    correctionDelayFactor: [1.0, 2.0],
    hardWordLength: 6,
    hardWordSpeedFactor: [0.65, 0.85],
    hesitationChance: 0.1,
    hesitationFactor: [1.5, 2.5],
    burstStartFactor: 1.6,
  },
  debutant: {
    baseWpmRange: [27, 38],
    errorRate: 0.08,
    correctionDelayFactor: [0.8, 1.6],
    hardWordLength: 7,
    hardWordSpeedFactor: [0.7, 0.88],
    hesitationChance: 0.08,
    hesitationFactor: [1.4, 2.2],
    burstStartFactor: 1.5,
  },
  intermediaire: {
    baseWpmRange: [45, 62],
    errorRate: 0.05,
    correctionDelayFactor: [0.7, 1.4],
    hardWordLength: 8,
    hardWordSpeedFactor: [0.75, 0.9],
    hesitationChance: 0.06,
    hesitationFactor: [1.3, 2.0],
    burstStartFactor: 1.4,
  },
  expert: {
    baseWpmRange: [84, 100],
    errorRate: 0.02,
    correctionDelayFactor: [0.5, 1.1],
    hardWordLength: 9,
    hardWordSpeedFactor: [0.8, 0.92],
    hesitationChance: 0.04,
    hesitationFactor: [1.2, 1.8],
    burstStartFactor: 1.3,
  },
  impossible: {
    baseWpmRange: [165, 230],
    errorRate: 0.005,
    correctionDelayFactor: [0.4, 0.9],
    hardWordLength: 10,
    hardWordSpeedFactor: [0.85, 0.95],
    hesitationChance: 0.02,
    hesitationFactor: [1.2, 1.6],
    burstStartFactor: 1.2,
  },
};

/** Per-keystroke jitter range (±20 % around the computed interval). */
export const CHAR_JITTER_RANGE: readonly [number, number] = [0.8, 1.2];

/** Sentence-end pause after `.`, `!`, `?`, as a multiple of the base interval. */
export const PUNCTUATION_PAUSE_FACTOR: readonly [number, number] = [0.4, 1.0];

/** Characters after which a natural sentence pause is taken. */
const SENTENCE_END = new Set(['.', '!', '?']);

/** Word characters: letters only (accents included), everything else is a gap. */
const WORD_LETTERS = /\p{L}+/gu;

const MS_PER_MINUTE = 60_000;

function assertBotErrorMode(errorMode: BotErrorMode): void {
  if (errorMode !== 'accumulate' && errorMode !== 'stop') {
    throw new Error(`bot schedule: unknown errorMode ${JSON.stringify(errorMode)}`);
  }
}

/**
 * BOT-01/02/03/05: generates the deterministic keystroke timeline of one bot.
 *
 * `seed` is coerced to a uint32 by the mulberry32 PRNG, so any integer seed
 * works. `errorMode` is validated; see the module note — both modes currently
 * yield the same natural (immediate-correction) timeline.
 */
export function generateBotSchedule(options: {
  text: string;
  level: BotLevel;
  seed: number;
  errorMode: BotErrorMode;
}): BotSchedule {
  assertBotErrorMode(options.errorMode);
  const { text, level, seed } = options;
  const rand = createSeededRandom(seed);
  const params = BOT_LEVEL_PARAMS[level];

  const [minWpm, maxWpm] = params.baseWpmRange;
  const baseWpm = minWpm + rand() * (maxWpm - minWpm);
  const baseIntervalMs = MS_PER_MINUTE / (baseWpm * 5);
  const rampAmplitude = params.burstStartFactor - 1;

  const uniform = (min: number, max: number): number => min + rand() * (max - min);
  const jitter = (): number => uniform(CHAR_JITTER_RANGE[0], CHAR_JITTER_RANGE[1]);

  const steps: BotScheduleStep[] = [];
  let atMs = 0;

  const push = (index: number, kind: BotStepKind): void => {
    steps.push({ index, atMs: Math.round(atMs), kind });
  };

  const typeGapCharacter = (index: number, character: string): void => {
    push(index, 'correct');
    atMs += baseIntervalMs * jitter();
    if (SENTENCE_END.has(character)) {
      atMs += baseIntervalMs * uniform(PUNCTUATION_PAUSE_FACTOR[0], PUNCTUATION_PAUSE_FACTOR[1]);
    }
  };

  const typeWord = (start: number, end: number): void => {
    const length = end - start;
    const isHard = length >= params.hardWordLength;
    const speedFactor = isHard
      ? uniform(params.hardWordSpeedFactor[0], params.hardWordSpeedFactor[1])
      : 1;

    for (let offset = 0; offset < length; offset++) {
      const index = start + offset;
      // Burst ramp: first char × burstStartFactor, last char × (2 − factor),
      // linear in between; single-letter words take the plain interval.
      const ramp =
        length >= 2 ? 1 + rampAmplitude * (1 - (2 * offset) / (length - 1)) : 1;
      const interval = (baseIntervalMs * ramp * jitter()) / speedFactor;

      if (rand() < params.errorRate) {
        // BOT-03: wrong key first, then a level-scaled correction delay,
        // then the correct key (immediate correction — see the module note).
        push(index, 'error');
        atMs +=
          baseIntervalMs *
          uniform(params.correctionDelayFactor[0], params.correctionDelayFactor[1]);
        push(index, 'correction');
      } else {
        push(index, 'correct');
      }
      atMs += interval;
    }
  };

  const words: Array<{ start: number; end: number }> = [];
  for (const match of text.matchAll(WORD_LETTERS)) {
    if (match.index === undefined) {
      continue;
    }
    words.push({ start: match.index, end: match.index + match[0].length });
  }

  let cursor = 0;
  let previousSegmentWasWord = false;
  for (const word of words) {
    for (let index = cursor; index < word.start; index++) {
      typeGapCharacter(index, text[index]);
    }
    // Hesitation between two words (never before the very first one, so the
    // bot starts typing at t = 0 like a human does).
    if (previousSegmentWasWord && rand() < params.hesitationChance) {
      atMs += baseIntervalMs * uniform(params.hesitationFactor[0], params.hesitationFactor[1]);
    }
    typeWord(word.start, word.end);
    previousSegmentWasWord = true;
    cursor = word.end;
  }
  for (let index = cursor; index < text.length; index++) {
    typeGapCharacter(index, text[index]);
  }

  return { steps };
}

/**
 * The net WPM (Annexe A) the schedule achieves on a text of `textLength`
 * characters: the bot validates every character at its last keystroke, so the
 * elapsed time is the last step's `atMs`. Returns `0` for an empty schedule.
 * Convenience for tests and diagnostics — the engine derives WPM from the
 * counters through `src/lib/race/stats.ts`, never from this helper.
 */
export function scheduleNetWpm(schedule: BotSchedule, textLength: number): number {
  if (schedule.steps.length === 0 || textLength <= 0) {
    return 0;
  }
  const last = schedule.steps[schedule.steps.length - 1];
  return netWpm({ correctChars: textLength, elapsedMs: last.atMs });
}
