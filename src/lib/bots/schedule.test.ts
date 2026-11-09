/**
 * @jest-environment node
 *
 * Unit tests for the seeded bot schedule generator (BOT-01/02/03/05): the
 * five level parameters, per-character determinism, variable speed
 * (accelerations, hesitations, hard-word slowdowns, jitter), error injection
 * with correction delays, errorMode handling and edge texts. Everything is
 * deterministic over `{ text, level, seed, errorMode }` — the assertions pin
 * statistical facts of fixed seed sets (verified against the generator, not
 * against chance).
 */

import { BOT_LEVELS } from '../room-config';
import {
  BOT_LEVEL_PARAMS,
  CHAR_JITTER_RANGE,
  generateBotSchedule,
  scheduleNetWpm,
  type BotLevel,
} from './schedule';

const LEVELS = BOT_LEVELS as readonly BotLevel[];

/**
 * Representative mixed text: 23 words, 3–12 letters (hard words:
 * magnificent, dwarven, forges, burned, brightly, through, glittering,
 * treasures, mountain, careful, attention). Used for the level-range and
 * error-rate assertions; the harder the real text, the lower the achieved
 * WPM (BOT-02 — documented).
 */
const REPRESENTATIVE_TEXT =
  'the quick brown fox jumps over the lazy dog and then the magnificent dwarven ' +
  'forges burned brightly through the night while the old king watched the ' +
  'glittering treasures of the deep mountain halls with careful attention';

const LETTERS = /\p{L}/gu;

function countLetters(text: string): number {
  return text.match(LETTERS)?.length ?? 0;
}

/** Consecutive atMs gaps of a schedule (typing rhythm). */
function gaps(schedule: ReturnType<typeof generateBotSchedule>): number[] {
  const times = schedule.steps.map((step) => step.atMs);
  return times.slice(1).map((atMs, index) => atMs - times[index]);
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

describe('generateBotSchedule — determinism (BOT-05)', () => {
  test('the same {text, level, seed, errorMode} always produces the identical schedule', () => {
    for (const level of LEVELS) {
      const first = generateBotSchedule({
        text: REPRESENTATIVE_TEXT,
        level,
        seed: 42,
        errorMode: 'accumulate',
      });
      const second = generateBotSchedule({
        text: REPRESENTATIVE_TEXT,
        level,
        seed: 42,
        errorMode: 'accumulate',
      });
      expect(second).toStrictEqual(first);
    }
  });

  test('different seeds produce different schedules', () => {
    for (const level of LEVELS) {
      const a = generateBotSchedule({
        text: REPRESENTATIVE_TEXT,
        level,
        seed: 1,
        errorMode: 'stop',
      });
      const b = generateBotSchedule({
        text: REPRESENTATIVE_TEXT,
        level,
        seed: 2,
        errorMode: 'stop',
      });
      expect(b.steps).not.toEqual(a.steps);
    }
  });

  test('both error modes produce the same natural immediate-correction timeline', () => {
    for (const level of LEVELS) {
      for (const seed of [1, 7, 99]) {
        const stop = generateBotSchedule({
          text: REPRESENTATIVE_TEXT,
          level,
          seed,
          errorMode: 'stop',
        });
        const accumulate = generateBotSchedule({
          text: REPRESENTATIVE_TEXT,
          level,
          seed,
          errorMode: 'accumulate',
        });
        expect(accumulate).toStrictEqual(stop);
      }
    }
  });
});

describe('generateBotSchedule — timeline structure (BOT-01/03)', () => {
  test.each(LEVELS)('%s: every character is typed exactly once, in order, at non-decreasing times', (level) => {
    for (let seed = 1; seed <= 12; seed++) {
      const schedule = generateBotSchedule({
        text: REPRESENTATIVE_TEXT,
        level,
        seed,
        errorMode: 'stop',
      });
      const typedAt = new Set<number>();
      const indexCount = new Map<number, number>();
      let previousAtMs = -1;
      for (const step of schedule.steps) {
        expect(step.index).toBeGreaterThanOrEqual(0);
        expect(step.index).toBeLessThan(REPRESENTATIVE_TEXT.length);
        expect(step.atMs).toBeGreaterThanOrEqual(previousAtMs);
        previousAtMs = step.atMs;
        // A character is typed by exactly one 'correct' or one
        // 'error' + 'correction' pair (the error itself types nothing valid).
        if (step.kind !== 'error') {
          typedAt.add(step.index);
          indexCount.set(step.index, (indexCount.get(step.index) ?? 0) + 1);
        }
      }
      expect(typedAt.size).toBe(REPRESENTATIVE_TEXT.length);
      for (const count of indexCount.values()) {
        expect(count).toBe(1);
      }
    }
  });

  test.each(LEVELS)('%s: every error is immediately followed by the correction of the same character', (level) => {
    for (let seed = 1; seed <= 12; seed++) {
      const schedule = generateBotSchedule({
        text: REPRESENTATIVE_TEXT,
        level,
        seed,
        errorMode: 'stop',
      });
      for (let stepIndex = 0; stepIndex < schedule.steps.length; stepIndex++) {
        const step = schedule.steps[stepIndex];
        if (step.kind !== 'error') {
          continue;
        }
        const correction = schedule.steps[stepIndex + 1];
        expect(correction).toBeDefined();
        expect(correction.kind).toBe('correction');
        expect(correction.index).toBe(step.index);
        expect(correction.atMs).toBeGreaterThan(step.atMs);
      }
    }
  });

  test.each(LEVELS)('%s: errors hit only letters and their rate stays near the level target (BOT-01)', (level) => {
    let errors = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const schedule = generateBotSchedule({
        text: REPRESENTATIVE_TEXT,
        level,
        seed,
        errorMode: 'stop',
      });
      for (const step of schedule.steps) {
        if (step.kind === 'error') {
          expect(/\p{L}/u.test(REPRESENTATIVE_TEXT[step.index])).toBe(true);
          errors += 1;
        }
      }
    }
    const letters = countLetters(REPRESENTATIVE_TEXT) * 12;
    const expected = BOT_LEVEL_PARAMS[level].errorRate * letters;
    // Wide tolerance: the rate is indicative (EXIGENCES) and the seed set is
    // fixed — verified bounds for this exact set.
    expect(errors).toBeGreaterThanOrEqual(expected * 0.45);
    expect(errors).toBeLessThanOrEqual(expected * 1.7);
  });

  test('correction delays stay inside the level-scaled bounds (BOT-03)', () => {
    const level = 'noob';
    const params = BOT_LEVEL_PARAMS[level];
    const minBase = 60_000 / (params.baseWpmRange[1] * 5);
    const maxBase = 60_000 / (params.baseWpmRange[0] * 5);
    const minDelay = minBase * params.correctionDelayFactor[0];
    const maxDelay = maxBase * params.correctionDelayFactor[1];
    const text = 'aaaaa aaaaa aaaaa aaaaa aaaaa aaaaa';

    for (let seed = 1; seed <= 30; seed++) {
      const schedule = generateBotSchedule({ text, level, seed, errorMode: 'stop' });
      for (let stepIndex = 0; stepIndex < schedule.steps.length - 1; stepIndex++) {
        if (schedule.steps[stepIndex].kind !== 'error') {
          continue;
        }
        const correction = schedule.steps[stepIndex + 1];
        expect(correction.kind).toBe('correction');
        const delay = correction.atMs - schedule.steps[stepIndex].atMs;
        expect(delay).toBeGreaterThanOrEqual(Math.round(minDelay));
        expect(delay).toBeLessThanOrEqual(Math.round(maxDelay));
      }
    }
  });
});

describe('generateBotSchedule — level ranges (BOT-01)', () => {
  const TARGET_RANGES: Record<BotLevel, readonly [number, number]> = {
    noob: [10, 20],
    debutant: [20, 35],
    intermediaire: [35, 60],
    expert: [70, 100],
    impossible: [140, Number.POSITIVE_INFINITY],
  };

  test.each(LEVELS)(
    '%s: the achieved net WPM stays inside the EXIGENCES target band (Annexe A)',
    (level) => {
      const [min, max] = TARGET_RANGES[level];
      const values: number[] = [];
      for (let seed = 1; seed <= 12; seed++) {
        const schedule = generateBotSchedule({
          text: REPRESENTATIVE_TEXT,
          level,
          seed,
          errorMode: 'accumulate',
        });
        const wpm = scheduleNetWpm(schedule, REPRESENTATIVE_TEXT.length);
        values.push(wpm);
        expect(wpm).toBeGreaterThanOrEqual(min);
        expect(wpm).toBeLessThanOrEqual(max);
      }
      expect(mean(values)).toBeGreaterThanOrEqual(min);
      expect(mean(values)).toBeLessThanOrEqual(max);
    },
  );

  test('the documented typing-speed ranges sit above the target bands (the honest offset)', () => {
    // The mapping table documents typing WPM above the target net WPM: the
    // offset compensates error/hesitation/slowdown time (BOT-01 adjustment).
    for (const level of LEVELS) {
      expect(BOT_LEVEL_PARAMS[level].baseWpmRange[0]).toBeGreaterThan(
        TARGET_RANGES[level][0],
      );
    }
  });
});

describe('generateBotSchedule — variable speed (BOT-02)', () => {
  test('the speed is never constant: many distinct intervals with real spread', () => {
    for (const level of LEVELS) {
      for (const seed of [1, 7, 23]) {
        const schedule = generateBotSchedule({
          text: REPRESENTATIVE_TEXT,
          level,
          seed,
          errorMode: 'stop',
        });
        const rhythm = gaps(schedule);
        const distinct = new Set(rhythm);
        const avg = mean(rhythm);
        const std = Math.sqrt(mean(rhythm.map((gap) => (gap - avg) ** 2)));
        expect(distinct.size).toBeGreaterThanOrEqual(5);
        expect(std / avg).toBeGreaterThanOrEqual(0.15);
      }
    }
  });

  test('words accelerate from a slow first character to a fast finish (bursts)', () => {
    const text = 'supercalifragilisticexpialidocious';
    const schedule = generateBotSchedule({ text, level: 'noob', seed: 1, errorMode: 'stop' });
    const typedAt = (index: number): number => {
      const step = schedule.steps.find(
        (candidate) => candidate.index === index && candidate.kind !== 'error',
      );
      if (!step) {
        throw new Error(`no typed step for index ${index}`);
      }
      return step.atMs;
    };
    const firstThree = [typedAt(1) - typedAt(0), typedAt(2) - typedAt(1), typedAt(3) - typedAt(2)];
    const lastFour = [
      typedAt(30) - typedAt(29),
      typedAt(31) - typedAt(30),
      typedAt(32) - typedAt(31),
      typedAt(33) - typedAt(32),
    ];
    expect(mean(firstThree)).toBeGreaterThan(mean(lastFour));
  });

  test('hard words are typed slower than short words on average (BOT-02)', () => {
    const text = 'house transcendentalism';
    for (const level of LEVELS) {
      const ratios: number[] = [];
      for (let seed = 1; seed <= 30; seed++) {
        const schedule = generateBotSchedule({ text, level, seed, errorMode: 'stop' });
        const timesByWord = (start: number, end: number): number[] =>
          schedule.steps
            .filter((step) => step.index >= start && step.index < end && step.kind !== 'error')
            .map((step) => step.atMs);
        const wordMean = (start: number, end: number): number => {
          const times = timesByWord(start, end).sort((a, b) => a - b);
          const deltas = times.slice(1).map((atMs, index) => atMs - times[index]);
          return mean(deltas);
        };
        const shortMean = wordMean(0, 5);
        const longMean = wordMean(6, 22);
        if (shortMean > 0 && longMean > 0) {
          ratios.push(longMean / shortMean);
        }
      }
      // Deterministic aggregate over the fixed seed set (verified ≈ 1.12–1.32).
      expect(mean(ratios)).toBeGreaterThan(1.08);
    }
  });

  test('hesitation pauses appear between words (BOT-02)', () => {
    const text = Array.from({ length: 25 }, () => 'a').join(' ');
    let pauses = 0;
    for (const level of LEVELS) {
      for (let seed = 1; seed <= 30; seed++) {
        const schedule = generateBotSchedule({ text, level, seed, errorMode: 'stop' });
        const rhythm = gaps(schedule);
        const sorted = [...rhythm].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        // Without a hesitation a gap is at most 1.2 × the base interval
        // (jitter ceiling, single-letter words have no ramp); a hesitation
        // adds ≥ 1.2 × base interval on top of the next keystroke — anything
        // above 1.8 × the median is a pause, never a jitter artefact.
        pauses += rhythm.filter((gap) => gap > 1.8 * median).length;
      }
    }
    expect(pauses).toBeGreaterThan(0);
  });
});

describe('generateBotSchedule — edge texts (BOT-01/05)', () => {
  test.each(LEVELS)('%s: a single character yields one typed step', (level) => {
    for (let seed = 1; seed <= 10; seed++) {
      const schedule = generateBotSchedule({ text: 'x', level, seed, errorMode: 'stop' });
      const typed = schedule.steps.filter((step) => step.kind !== 'error');
      expect(typed).toHaveLength(1);
      expect(typed[0].index).toBe(0);
      expect(typed[0].atMs).toBe(0);
    }
  });

  test('a single word is covered end to end', () => {
    const text = 'bonjour';
    const schedule = generateBotSchedule({ text, level: 'expert', seed: 5, errorMode: 'stop' });
    const indexes = schedule.steps
      .filter((step) => step.kind !== 'error')
      .map((step) => step.index)
      .sort((a, b) => a - b);
    expect(indexes).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test('spaces-only texts type every space without errors', () => {
    const text = '     ';
    for (let seed = 1; seed <= 5; seed++) {
      const schedule = generateBotSchedule({ text, level: 'noob', seed, errorMode: 'stop' });
      expect(schedule.steps.every((step) => step.kind === 'correct')).toBe(true);
      expect(schedule.steps.map((step) => step.index)).toEqual([0, 1, 2, 3, 4]);
    }
  });

  test('an empty text yields an empty schedule', () => {
    const schedule = generateBotSchedule({ text: '', level: 'noob', seed: 1, errorMode: 'stop' });
    expect(schedule.steps).toEqual([]);
    expect(scheduleNetWpm(schedule, 0)).toBe(0);
  });

  test('an unknown errorMode is rejected defensively', () => {
    expect(() =>
      generateBotSchedule({
        text: 'hi',
        level: 'noob',
        seed: 1,
        errorMode: 'bogus' as 'stop',
      }),
    ).toThrow(/errorMode/);
  });
});

describe('scheduleNetWpm', () => {
  test('uses the Annexe A net WPM formula over the last keystroke', () => {
    // 20 characters typed over 60 000 ms → 20 ÷ 5 ÷ 1 = 4 WPM.
    const schedule = { steps: [{ index: 0, atMs: 60_000, kind: 'correct' as const }] };
    expect(scheduleNetWpm(schedule, 20)).toBeCloseTo(4);
  });

  test('returns 0 for an empty schedule', () => {
    expect(scheduleNetWpm({ steps: [] }, 10)).toBe(0);
  });
});

describe('BOT_LEVEL_PARAMS', () => {
  test('every documented knob stays inside its sane bounds', () => {
    for (const level of LEVELS) {
      const params = BOT_LEVEL_PARAMS[level];
      expect(params.errorRate).toBeGreaterThan(0);
      expect(params.errorRate).toBeLessThan(0.2);
      expect(params.burstStartFactor).toBeGreaterThan(1);
      expect(params.burstStartFactor).toBeLessThan(2);
      expect(params.hardWordLength).toBeGreaterThanOrEqual(2);
      expect(params.hesitationChance).toBeGreaterThan(0);
      expect(params.hesitationChance).toBeLessThanOrEqual(0.2);
      expect(params.baseWpmRange[1]).toBeGreaterThan(params.baseWpmRange[0]);
      expect(params.hardWordSpeedFactor[1]).toBeLessThan(1);
      expect(CHAR_JITTER_RANGE[0]).toBeGreaterThan(0);
      expect(CHAR_JITTER_RANGE[1]).toBeGreaterThan(1);
    }
  });
});
