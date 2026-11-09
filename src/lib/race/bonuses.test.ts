/**
 * @jest-environment node
 *
 * Unit tests for the pure comeback-bonus rules (BONUS-01/02/04): checkpoint
 * crossings exactly at 25/50/75 (never before, never after, never re-fired),
 * the leader/help-target eligibility rules, the per-participant cap, the
 * seeded determinism, the never-before-the-caret removal with its ≥1 char
 * clamp, and the pure effect evaluation shared by humans and bots.
 */

import { createSeededRandom } from './text-generator';
import {
  appendWordsToText,
  applyTextLengthDelta,
  BONUS_CHECKPOINTS,
  BONUS_FOG_DURATION_MS,
  BONUS_HELP_GAP,
  BONUS_MAX_PER_PARTICIPANT,
  BONUS_WORDS_PER_EVENT,
  evaluateBonusEvent,
  findBonusLeader,
  generateBonusWords,
  newlyCrossedCheckpoints,
  pickBonusHelpTarget,
  pickBonusType,
  removeWordsFromRemaining,
  type BonusParticipantState,
  type BonusType,
} from './bonuses';

function participant(overrides: Partial<BonusParticipantState> = {}): BonusParticipantState {
  return {
    memberId: 'a',
    kind: 'user',
    validatedChars: 0,
    text: 'the quick brown fox jumps over the lazy dog',
    bonusesReceived: 0,
    finished: false,
    ...overrides,
  };
}

describe('pickBonusType (BONUS-02 determinism)', () => {
  test('is a uniform draw among the three types, deterministic from the seed', () => {
    const seen = new Set<BonusType>();
    const first = createSeededRandom(7);
    const replay = createSeededRandom(7);
    const firstSequence: BonusType[] = [];
    for (let index = 0; index < 100; index += 1) {
      const type = pickBonusType(first);
      firstSequence.push(type);
      seen.add(type);
    }
    expect(seen).toEqual(new Set(['addWords', 'removeWords', 'fog']));

    for (const type of firstSequence) {
      expect(pickBonusType(replay)).toBe(type);
    }
  });

  test('different seeds draw different sequences', () => {
    const a = createSeededRandom(1);
    const b = createSeededRandom(2);
    const draw = (rng: () => number): string => pickBonusType(rng);
    expect(draw(a)).not.toBe(draw(b));
  });
});

describe('generateBonusWords (addWords word synthesis)', () => {
  const pool = ['pierre', 'forgé', 'nain', 'rune'];

  test('draws exactly `count` words from the pool, deterministic from the rng', () => {
    const first = generateBonusWords({
      wordPool: pool,
      count: BONUS_WORDS_PER_EVENT,
      language: 'fr',
      accents: true,
      rng: createSeededRandom(42),
    });
    const replay = generateBonusWords({
      wordPool: pool,
      count: BONUS_WORDS_PER_EVENT,
      language: 'fr',
      accents: true,
      rng: createSeededRandom(42),
    });
    expect(first).toHaveLength(BONUS_WORDS_PER_EVENT);
    expect(first).toEqual(replay);
    expect(first.every((word) => pool.includes(word))).toBe(true);
  });

  test('strips accents for French when the config option is off (typeable text)', () => {
    const accentedPool = ['forgé', 'brûlé', 'pêche'];
    const words = generateBonusWords({
      wordPool: accentedPool,
      count: BONUS_WORDS_PER_EVENT,
      language: 'fr',
      accents: false,
      rng: createSeededRandom(3),
    });
    expect([...words].sort()).toEqual(['brule', 'forge', 'peche']);
  });

  test('keeps accents when the option is on, and never strips English words', () => {
    const accentedPool = ['forgé', 'brûlé', 'pêche'];
    const kept = generateBonusWords({
      wordPool: accentedPool,
      count: 1,
      language: 'fr',
      accents: true,
      rng: createSeededRandom(3),
    });
    expect(accentedPool).toContain(kept[0]);
    expect(kept[0]).not.toBe('peche');

    expect(() =>
      generateBonusWords({ wordPool: [], count: 1, language: 'fr', accents: true, rng: () => 0 }),
    ).toThrow(RangeError);
  });
});

describe('newlyCrossedCheckpoints (BONUS-01 crossing rules)', () => {
  test('fires exactly at each boundary, never before it', () => {
    expect(
      newlyCrossedCheckpoints({ previousProgress: 0.24, currentProgress: 0.25, fired: [] }),
    ).toEqual([0.25]);
    expect(
      newlyCrossedCheckpoints({ previousProgress: 0.24, currentProgress: 0.249, fired: [] }),
    ).toEqual([]);
    expect(
      newlyCrossedCheckpoints({ previousProgress: 0.249, currentProgress: 0.25, fired: [] }),
    ).toEqual([0.25]);
  });

  test('a checkpoint already exactly reached never fires again', () => {
    expect(
      newlyCrossedCheckpoints({ previousProgress: 0.25, currentProgress: 0.26, fired: [0.25] }),
    ).toEqual([]);
    expect(
      newlyCrossedCheckpoints({ previousProgress: 0.25, currentProgress: 0.26, fired: [] }),
    ).toEqual([]);
  });

  test('one jump crossing several checkpoints fires each, in ascending order', () => {
    expect(
      newlyCrossedCheckpoints({ previousProgress: 0.2, currentProgress: 0.8, fired: [] }),
    ).toEqual([0.25, 0.5, 0.75]);
  });

  test('already fired checkpoints are not re-fired by a later jump', () => {
    expect(
      newlyCrossedCheckpoints({ previousProgress: 0.2, currentProgress: 0.8, fired: [0.5] }),
    ).toEqual([0.25, 0.75]);
  });

  test('a progression drop (leader text grew) crosses nothing', () => {
    expect(
      newlyCrossedCheckpoints({ previousProgress: 0.6, currentProgress: 0.4, fired: [0.25, 0.5] }),
    ).toEqual([]);
  });

  test('reaching 100 % fires every remaining checkpoint', () => {
    expect(
      newlyCrossedCheckpoints({ previousProgress: 0.7, currentProgress: 1, fired: [0.25, 0.5] }),
    ).toEqual([0.75]);
  });
});

describe('findBonusLeader (hinder target)', () => {
  test('picks the highest progression; bots included', () => {
    const leader = findBonusLeader([
      participant({ memberId: 'a', validatedChars: 10, text: 'aaaaaaaaaaaaaaaaaaaaaaaa' }),
      participant({ memberId: 'b', kind: 'bot', validatedChars: 20, text: 'aaaaaaaaaaaaaaaaaaaaaaaa' }),
      participant({ memberId: 'c', validatedChars: 5, text: 'aaaaaaaaaaaaaaaaaaaaaaaa' }),
    ]);
    expect(leader?.memberId).toBe('b');
  });

  test('ignores finished participants (their result is recorded)', () => {
    const leader = findBonusLeader([
      participant({ memberId: 'a', validatedChars: 24, text: 'aaaaaaaaaaaaaaaaaaaaaaaa', finished: true }),
      participant({ memberId: 'b', validatedChars: 6, text: 'aaaaaaaaaaaaaaaaaaaaaaaa' }),
    ]);
    expect(leader?.memberId).toBe('b');
  });

  test('ties break by most validated characters, then memberId (deterministic)', () => {
    expect(
      findBonusLeader([
        participant({ memberId: 'z', validatedChars: 5, text: 'aaaaaaaaaa' }),
        participant({ memberId: 'a', validatedChars: 5, text: 'aaaaaaaaaa' }),
      ])?.memberId,
    ).toBe('a');

    // Same progression ratio via different lengths: more validated chars wins.
    expect(
      findBonusLeader([
        participant({ memberId: 'short', validatedChars: 1, text: 'aa' }),
        participant({ memberId: 'long', validatedChars: 2, text: 'aaaa' }),
      ])?.memberId,
    ).toBe('long');
  });

  test('returns null when nobody is still racing', () => {
    expect(findBonusLeader([])).toBeNull();
    expect(
      findBonusLeader([participant({ finished: true })]),
    ).toBeNull();
  });
});

describe('pickBonusHelpTarget (help target)', () => {
  test('picks the most-behind eligible participant', () => {
    const leader = participant({ memberId: 'leader', validatedChars: 20, text: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
    const target = pickBonusHelpTarget({
      participants: [
        leader,
        participant({ memberId: 'mid', validatedChars: 10, text: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
        participant({ memberId: 'far', validatedChars: 2, text: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
      ],
      leader,
    });
    expect(target?.memberId).toBe('far');
  });

  test('the 25-percentage-points-behind clause makes a gap eligible', () => {
    const text = 'x'.repeat(100);
    const leader = participant({ memberId: 'leader', validatedChars: 80, text });
    const near = participant({ memberId: 'near', validatedChars: 70, text }); // 10 pp behind
    const far = participant({ memberId: 'far', validatedChars: 50, text }); // 30 pp behind
    // With the near participant alone, the last-position clause applies; the
    // far participant is eligible through the 25 pp rule and is most-behind.
    expect(pickBonusHelpTarget({ participants: [leader, near, far], leader })?.memberId).toBe('far');
    expect(pickBonusHelpTarget({ participants: [leader, near], leader })?.memberId).toBe('near');
  });

  test('exactly BONUS_HELP_GAP behind is eligible (>= comparison)', () => {
    const text = 'x'.repeat(100);
    const leader = participant({ memberId: 'leader', validatedChars: 60, text });
    const atGap = participant({ memberId: 'gap', validatedChars: 60 - BONUS_HELP_GAP * 100, text });
    expect(pickBonusHelpTarget({ participants: [leader, atGap], leader })?.memberId).toBe('gap');
  });

  test('skips when nobody is eligible (no other racer, or everyone finished)', () => {
    const leader = participant({ memberId: 'leader', validatedChars: 10 });
    expect(pickBonusHelpTarget({ participants: [leader], leader })).toBeNull();
    expect(
      pickBonusHelpTarget({
        participants: [leader, participant({ memberId: 'gone', finished: true })],
        leader,
      }),
    ).toBeNull();
  });

  test('ties among the most-behind break by fewest validated chars, then memberId', () => {
    const text = 'x'.repeat(100);
    const leader = participant({ memberId: 'leader', validatedChars: 60, text });
    expect(
      pickBonusHelpTarget({
        participants: [
          participant({ memberId: 'z', validatedChars: 10, text }),
          participant({ memberId: 'a', validatedChars: 10, text }),
          leader,
        ],
        leader,
      })?.memberId,
    ).toBe('a');
  });

  test('a participant tied with the leader is not "behind" and stays ineligible', () => {
    const text = 'x'.repeat(100);
    const leader = participant({ memberId: 'leader', validatedChars: 30, text });
    const tied = participant({ memberId: 'tied', validatedChars: 30, text });
    expect(pickBonusHelpTarget({ participants: [leader, tied], leader })).toBeNull();
  });
});

describe('text operations (BONUS-02/04)', () => {
  test('appendWordsToText inserts a single separator space (or none after whitespace)', () => {
    expect(appendWordsToText('the quick', ['cat', 'dog'])).toBe('the quick cat dog');
    expect(appendWordsToText('', ['cat', 'dog'])).toBe('cat dog');
    expect(appendWordsToText('ends ', ['cat'])).toBe('ends cat');
    expect(appendWordsToText('no words', [])).toBe('no words');
  });

  test('removeWordsFromRemaining removes trailing words, never the caret prefix', () => {
    expect(
      removeWordsFromRemaining({ remainingText: 'quick brown fox jumps', wordCount: 3 }),
    ).toEqual({ removedWords: 3, newRemainingText: 'quick' });
    expect(
      removeWordsFromRemaining({ remainingText: 'brown fox', wordCount: 3 }),
    ).toEqual({ removedWords: 1, newRemainingText: 'brown' });
  });

  test('the >= 1 remaining character clamp backs off instead of emptying the text', () => {
    // " quick" (leading space from a mid-gap caret): removing "quick" would
    // leave "", so nothing is removed.
    expect(
      removeWordsFromRemaining({ remainingText: ' quick', wordCount: 3 }),
    ).toEqual({ removedWords: 0, newRemainingText: ' quick' });
    // A single word can never be removed (it would empty the suffix).
    expect(
      removeWordsFromRemaining({ remainingText: 'fox', wordCount: 3 }),
    ).toEqual({ removedWords: 0, newRemainingText: 'fox' });
    // Punctuation rides with its word.
    expect(
      removeWordsFromRemaining({ remainingText: 'quick brown fox.', wordCount: 3 }),
    ).toEqual({ removedWords: 2, newRemainingText: 'quick' });
  });

  test('applyTextLengthDelta appends, shrinks and clamps', () => {
    expect(
      applyTextLengthDelta({ text: 'abcdef', validatedChars: 2, delta: 3, appendedText: 'xyz' }),
    ).toBe('abcdefxyz');
    expect(applyTextLengthDelta({ text: 'abcdef', validatedChars: 2, delta: -3 })).toBe('abc');
    // Never into the validated prefix and never below 1 remaining char:
    expect(applyTextLengthDelta({ text: 'abcdef', validatedChars: 3, delta: -10 })).toBe('abcd');
    expect(applyTextLengthDelta({ text: 'abcdef', validatedChars: 3, delta: 0 })).toBe('abcdef');
    expect(() => applyTextLengthDelta({ text: 'abc', validatedChars: 0, delta: 2 })).toThrow(
      RangeError,
    );
    expect(() =>
      applyTextLengthDelta({ text: 'abc', validatedChars: 0, delta: 3, appendedText: 'zz' }),
    ).toThrow(RangeError);
  });
});

describe('evaluateBonusEvent (pure effects)', () => {
  test('addWords appends the extra words to the target text and reports the delta', () => {
    const target = participant({ memberId: 'leader', validatedChars: 5, text: 'the quick brown fox' });
    const result = evaluateBonusEvent({
      type: 'addWords',
      target,
      extraWords: ['cat', 'dog', 'bird'],
      now: new Date('2026-11-09T00:00:00.000Z'),
    });
    expect(result.applied).toBe(true);
    if (!result.applied) {
      return;
    }
    expect(result.newText).toBe('the quick brown fox cat dog bird');
    expect(result.textLengthDelta).toBe(' cat dog bird'.length);
    expect(result.payload).toMatchObject({
      type: 'addWords',
      words: ['cat', 'dog', 'bird'],
      totalLength: result.newText.length,
    });
  });

  test('removeWords shrinks only the remaining suffix and reports the clamped count', () => {
    const target = participant({
      memberId: 'far',
      validatedChars: 4,
      text: 'the quick brown fox jumps',
    });
    const result = evaluateBonusEvent({
      type: 'removeWords',
      target,
      extraWords: [],
      now: new Date('2026-11-09T00:00:00.000Z'),
    });
    expect(result.applied).toBe(true);
    if (!result.applied) {
      return;
    }
    // Remaining = "quick brown fox jumps": 3 words removed, "quick" stays.
    expect(result.newText).toBe('the quick');
    expect(result.textLengthDelta).toBe(-(' brown fox jumps'.length));
    expect(result.payload).toMatchObject({
      type: 'removeWords',
      wordCount: 3,
      totalLength: result.newText.length,
    });
  });

  test('removeWords never deletes before the caret and is clamped to >= 1 char', () => {
    const almostDone = participant({
      memberId: 'far',
      validatedChars: 10,
      text: 'the quick brown fox',
    });
    const result = evaluateBonusEvent({
      type: 'removeWords',
      target: almostDone,
      extraWords: [],
      now: new Date('2026-11-09T00:00:00.000Z'),
    });
    expect(result.applied).toBe(true);
    if (!result.applied) {
      return;
    }
    expect(result.newText.startsWith('the quick')).toBe(true);
    expect(result.newText.length).toBeGreaterThanOrEqual(almostDone.validatedChars + 1);
  });

  test('fog changes no text and carries the blur duration payload', () => {
    const target = participant({ memberId: 'leader', validatedChars: 10 });
    const result = evaluateBonusEvent({
      type: 'fog',
      target,
      extraWords: [],
      now: new Date('2026-11-09T00:00:00.000Z'),
    });
    expect(result.applied).toBe(true);
    if (!result.applied) {
      return;
    }
    expect(result.textLengthDelta).toBe(0);
    expect(result.newText).toBe(target.text);
    expect(result.payload).toMatchObject({
      type: 'fog',
      durationMs: BONUS_FOG_DURATION_MS,
      totalLength: target.text.length,
    });
  });

  test('fog never targets a bot (visual-only, documented rule)', () => {
    const result = evaluateBonusEvent({
      type: 'fog',
      target: participant({ kind: 'bot' }),
      extraWords: [],
      now: new Date('2026-11-09T00:00:00.000Z'),
    });
    expect(result).toEqual({ applied: false, reason: 'fog_on_bot' });
  });

  test('the per-participant cap skips the event', () => {
    const capped = participant({ bonusesReceived: BONUS_MAX_PER_PARTICIPANT });
    expect(
      evaluateBonusEvent({
        type: 'removeWords',
        target: capped,
        extraWords: [],
        now: new Date('2026-11-09T00:00:00.000Z'),
      }),
    ).toEqual({ applied: false, reason: 'at_cap' });
    expect(
      evaluateBonusEvent({
        type: 'addWords',
        target: capped,
        extraWords: ['x'],
        now: new Date('2026-11-09T00:00:00.000Z'),
      }),
    ).toEqual({ applied: false, reason: 'at_cap' });
  });

  test('addWords without extra words and removeWords with nothing removable skip', () => {
    expect(
      evaluateBonusEvent({
        type: 'addWords',
        target: participant({}),
        extraWords: [],
        now: new Date('2026-11-09T00:00:00.000Z'),
      }),
    ).toEqual({ applied: false, reason: 'no_extra_words' });

    expect(
      evaluateBonusEvent({
        type: 'removeWords',
        target: participant({ validatedChars: 40, text: 'x'.repeat(41) }),
        extraWords: [],
        now: new Date('2026-11-09T00:00:00.000Z'),
      }),
    ).toEqual({ applied: false, reason: 'nothing_to_remove' });
  });

  test('removeWords always leaves >= 1 char after the caret (never completes the target by itself)', () => {
    // Remaining = " fox": removing the word would empty the suffix → skipped.
    const empty = participant({ memberId: 'far', validatedChars: 15, text: 'the quick brown fox' });
    expect(
      evaluateBonusEvent({
        type: 'removeWords',
        target: empty,
        extraWords: [],
        now: new Date('2026-11-09T00:00:00.000Z'),
      }),
    ).toEqual({ applied: false, reason: 'nothing_to_remove' });

    const near = participant({ memberId: 'near', validatedChars: 4, text: 'the quick brown fox' });
    const result = evaluateBonusEvent({
      type: 'removeWords',
      target: near,
      extraWords: [],
      now: new Date('2026-11-09T00:00:00.000Z'),
    });
    expect(result.applied).toBe(true);
    if (!result.applied) {
      return;
    }
    expect(result.newText.length).toBeGreaterThan(near.validatedChars);
    expect(result.newText.startsWith('the ')).toBe(true);
  });
});

describe('seeded end-to-end determinism (BONUS-05 style)', () => {
  test('a fixed seed reproduces the type draws and the synthesized words byte for byte', () => {
    const pool = ['forge', 'nain', 'rune', 'pierre', 'tunnel'];
    const simulate = (seed: number) => {
      const typeRng = createSeededRandom(seed + 0x10_000);
      const events: Array<{ type: BonusType; words: string[] }> = [];
      for (let checkpointIndex = 0; checkpointIndex < BONUS_CHECKPOINTS.length; checkpointIndex += 1) {
        const type = pickBonusType(typeRng);
        const words =
          type === 'addWords'
            ? generateBonusWords({
                wordPool: pool,
                count: BONUS_WORDS_PER_EVENT,
                language: 'fr',
                accents: false,
                rng: createSeededRandom(seed + 0x20_000 + events.length),
              })
            : [];
        events.push({ type, words });
      }
      return events;
    };

    expect(simulate(1234)).toEqual(simulate(1234));
    expect(simulate(1234)).not.toEqual(simulate(1235));
  });
});
