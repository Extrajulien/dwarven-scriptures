import type { RaceTrackParticipant } from '../../realtime/client-types';
import {
  clamp01,
  deriveRanking,
  detectRankChanges,
  easeOutCubic,
  interpolatePosition,
  positionFraction,
  type RankedTrackParticipant,
  type TrackTick,
} from './track';

/**
 * COURSE-05, GAME-2/3 pure logic: interpolation boundaries and monotonicity,
 * live ranking order (finished first, finish order, position, WPM, id), local
 * overtake events in both directions, and determinism.
 */

const T0 = Date.parse('2026-11-08T12:00:00.000Z');

let serial = 0;
function id(): string {
  serial += 1;
  return `${String(serial).padStart(8, '0')}-0000-4000-8000-000000000000`;
}

function participant(overrides: Partial<RaceTrackParticipant> = {}): RaceTrackParticipant {
  return {
    participantId: id(),
    kind: 'user',
    displayName: 'dwarf',
    position: 0,
    wpm: 0,
    finished: false,
    totalLength: 1_000,
    ...overrides,
  };
}

function tick(participants: RaceTrackParticipant[], atMs = T0): TrackTick {
  return { tickAt: new Date(atMs).toISOString(), participants };
}

function ranked(list: RaceTrackParticipant[], finishOrder?: ReadonlyMap<string, number>): RankedTrackParticipant[] {
  return deriveRanking(list, finishOrder);
}

describe('clamp01 / positionFraction', () => {
  test('clamp01 bounds any value into [0, 1]', () => {
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(1.4)).toBe(1);
  });

  test('positionFraction maps characters to a 0..1 progress, clamped', () => {
    expect(positionFraction(0, 100)).toBe(0);
    expect(positionFraction(50, 100)).toBe(0.5);
    expect(positionFraction(100, 100)).toBe(1);
    expect(positionFraction(150, 100)).toBe(1);
    expect(positionFraction(-5, 100)).toBe(0);
  });

  test('positionFraction is 0 without a known text length', () => {
    expect(positionFraction(50, null)).toBe(0);
    expect(positionFraction(50, 0)).toBe(0);
  });
});

describe('easeOutCubic', () => {
  test('hits the boundaries and eases the middle', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
  });
});

describe('interpolatePosition (COURSE-05 smoothness, BONUS-04 lengths)', () => {
  const ada = participant({ participantId: 'ada', position: 250, wpm: 40 });
  const adaNext = { ...ada, position: 500 };
  const prevTick = tick([ada], T0);
  const nextTick = tick([adaNext], T0 + 250);

  test('returns the next sample position when there is no previous tick', () => {
    expect(interpolatePosition(adaNext, null, nextTick, T0 + 100)).toBe(0.5);
  });

  test('returns the next sample position when the participant was absent from the previous tick', () => {
    const stranger = participant({ participantId: 'ghost', position: 400 });
    expect(interpolatePosition(stranger, prevTick, tick([stranger], T0 + 250), T0 + 100)).toBe(0.4);
  });

  test('returns the next sample position for a degenerate clock pair (same or backwards timestamps)', () => {
    expect(interpolatePosition(adaNext, prevTick, tick([adaNext], T0), T0 + 100)).toBe(0.5);
    expect(
      interpolatePosition(adaNext, tick([ada], T0 + 500), tick([adaNext], T0), T0 + 100),
    ).toBe(0.5);
  });

  test('linear interpolation is exact at the window midpoint', () => {
    // prev 250/1000 = 0.25, next 500/1000 = 0.5, halfway = 0.375.
    expect(interpolatePosition(adaNext, prevTick, nextTick, T0 + 125, 'linear')).toBeCloseTo(0.375);
  });

  test('ease-out interpolation reaches 0.875 of the delta at the midpoint', () => {
    // alpha = 0.5 → easeOutCubic = 0.875 → 0.25 + 0.25 * 0.875.
    expect(interpolatePosition(adaNext, prevTick, nextTick, T0 + 125, 'ease-out')).toBeCloseTo(
      0.25 + 0.25 * 0.875,
    );
  });

  test('clamps at both boundaries of the tick window', () => {
    expect(interpolatePosition(adaNext, prevTick, nextTick, T0 - 50, 'linear')).toBe(0.25);
    expect(interpolatePosition(adaNext, prevTick, nextTick, T0 + 999, 'linear')).toBe(0.5);
  });

  test('the result stays monotonic as the client clock advances (both easings)', () => {
    const samples: number[] = [];
    for (let offset = 0; offset <= 250; offset += 10) {
      samples.push(interpolatePosition(adaNext, prevTick, nextTick, T0 + offset, 'linear'));
    }
    expect(samples).toEqual([...samples].sort((a, b) => a - b));

    const eased: number[] = [];
    for (let offset = 0; offset <= 250; offset += 10) {
      eased.push(interpolatePosition(adaNext, prevTick, nextTick, T0 + offset, 'ease-out'));
    }
    expect(eased).toEqual([...eased].sort((a, b) => a - b));
    expect(eased[eased.length - 1]).toBeCloseTo(0.5);
  });

  test('never leaves [0, 1] even with hostile inputs', () => {
    const weird = participant({ participantId: 'weird', position: 10_000 });
    const weirdNext = { ...weird, position: 20_000 };
    for (let offset = -1_000; offset <= 2_000; offset += 50) {
      const value = interpolatePosition(
        weirdNext,
        tick([weird], T0),
        tick([weirdNext], T0 + 250),
        T0 + offset,
      );
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  test('trusts the latest sample when the previous one was ahead (defensive)', () => {
    const back = participant({ participantId: 'back', position: 900 });
    const backNext = { ...back, position: 100 };
    expect(interpolatePosition(backNext, tick([back], T0), tick([backNext], T0 + 250), T0 + 125)).toBe(0.1);
  });

  test('uses each participant own effective length, never a shared one (BONUS-04)', () => {
    // Same shared text, different bonus-adjusted lengths: 400/400 is done,
    // 400/1_000 is only at 40 % — the shared denominator would lie for one.
    const done = participant({ participantId: 'done', position: 400, totalLength: 400 });
    const ongoing = participant({ participantId: 'ongoing', position: 400, totalLength: 1_000 });
    expect(interpolatePosition(done, null, tick([done, ongoing], T0 + 250), T0)).toBe(1);
    expect(interpolatePosition(ongoing, null, tick([done, ongoing], T0 + 250), T0)).toBe(0.4);
  });

  test('recomputes each sample with its own length when a bonus changed it between ticks', () => {
    // addWords on the target between the ticks: 11/43 ≈ 0.256 → 11/61 ≈ 0.180.
    // The latest (lower) fraction is trusted instead of interpolating backwards.
    const before = participant({ participantId: 'grown', position: 11, totalLength: 43 });
    const after = { ...before, totalLength: 61 };
    expect(interpolatePosition(after, tick([before], T0), tick([after], T0 + 250), T0 + 125)).toBeCloseTo(
      11 / 61,
    );
  });

  test('is deterministic for identical inputs', () => {
    const first = interpolatePosition(adaNext, prevTick, nextTick, T0 + 90, 'ease-out');
    const second = interpolatePosition(adaNext, prevTick, nextTick, T0 + 90, 'ease-out');
    expect(second).toBe(first);
  });
});

describe('deriveRanking (live ranking, GAME-2)', () => {
  test('finished participants lead, regardless of position', () => {
    const leader = participant({ participantId: 'a', position: 900, wpm: 80 });
    const finisher = participant({ participantId: 'b', position: 1_000, wpm: 60, finished: true });
    const list = ranked([leader, finisher]);
    expect(list.map((entry) => entry.participantId)).toEqual(['b', 'a']);
    expect(list[0].rank).toBe(1);
    expect(list[1].rank).toBe(2);
  });

  test('finished participants follow the finish order when known', () => {
    const first = participant({ participantId: 'first', position: 1_000, wpm: 60, finished: true });
    const second = participant({ participantId: 'second', position: 1_000, wpm: 90, finished: true });
    const finishOrder = new Map([
      ['first', 2],
      ['second', 1],
    ]);
    const list = ranked([first, second], finishOrder);
    expect(list.map((entry) => entry.participantId)).toEqual(['second', 'first']);
  });

  test('finished participants with a known rank beat those without', () => {
    const known = participant({ participantId: 'known', position: 1_000, wpm: 50, finished: true });
    const unknown = participant({ participantId: 'unknown', position: 1_000, wpm: 95, finished: true });
    const list = ranked([unknown, known], new Map([['known', 1]]));
    expect(list.map((entry) => entry.participantId)).toEqual(['known', 'unknown']);
  });

  test('unfinished participants sort by position desc, then wpm desc', () => {
    const fast = participant({ participantId: 'fast', position: 500, wpm: 120 });
    const slow = participant({ participantId: 'slow', position: 500, wpm: 30 });
    const behind = participant({ participantId: 'behind', position: 100, wpm: 200 });
    const list = ranked([behind, slow, fast]);
    expect(list.map((entry) => entry.participantId)).toEqual(['fast', 'slow', 'behind']);
  });

  test('participantId is the stable final tie-break', () => {
    const zebra = participant({ participantId: 'z', position: 300, wpm: 50 });
    const alpha = participant({ participantId: 'a', position: 300, wpm: 50 });
    const list = ranked([zebra, alpha]);
    expect(list.map((entry) => entry.participantId)).toEqual(['a', 'z']);
  });

  test('is deterministic whatever the input order', () => {
    const entries = [
      participant({ participantId: 'a', position: 100, wpm: 10 }),
      participant({ participantId: 'b', position: 100, wpm: 10 }),
      participant({ participantId: 'c', position: 500, wpm: 40, finished: true }),
      participant({ participantId: 'd', position: 400, wpm: 30 }),
    ];
    const expected = ranked(entries).map((entry) => entry.participantId);
    const reversed = ranked([...entries].reverse()).map((entry) => entry.participantId);
    expect(reversed).toEqual(expected);
  });

  test('does not mutate the input array', () => {
    const entries = [participant({ position: 300 }), participant({ position: 100 })];
    const snapshot = entries.map((entry) => entry.position);
    ranked(entries);
    expect(entries.map((entry) => entry.position)).toEqual(snapshot);
    expect('rank' in entries[0]).toBe(false);
  });
});

describe('detectRankChanges (GAME-3 overtake warnings)', () => {
  const ada = participant({ participantId: 'ada', displayName: 'Ada', position: 400, wpm: 60 });
  const rival = participant({ participantId: 'rival', displayName: 'Rival', position: 450, wpm: 62 });

  test('reports an overtook event when the local participant moves up', () => {
    const prev = ranked([ada, rival]); // Ada 2, Rival 1
    const next = ranked([{ ...ada, position: 500 }, rival]); // Ada 1
    const events = detectRankChanges(prev, next, 'ada');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'overtook',
      direction: 'up',
      other: { participantId: 'rival', displayName: 'Rival', kind: 'user' },
      rank: 1,
    });
  });

  test('reports an overtaken event when the local participant moves down', () => {
    const prev = ranked([{ ...ada, position: 500 }, rival]); // Ada 1, Rival 2
    const overtaken = ranked([{ ...rival, position: 800 }, ada]); // Ada falls to 2
    const events = detectRankChanges(prev, overtaken, 'ada');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'overtaken',
      direction: 'down',
      other: { participantId: 'rival', displayName: 'Rival', kind: 'user' },
      rank: 2,
    });
  });

  test('carries the other participant kind so the UI can localize bot names (BOT-04)', () => {
    const rivalBot = participant({
      participantId: 'bot-7',
      displayName: 'expert 2',
      kind: 'bot',
      position: 450,
      wpm: 62,
    });
    const prev = ranked([ada, rivalBot]);
    const next = ranked([{ ...ada, position: 500 }, rivalBot]);
    const events = detectRankChanges(prev, next, 'ada');
    expect(events[0].other).toMatchObject({ participantId: 'bot-7', kind: 'bot' });
  });

  test('reports the directly-ahead participant when several ranks are gained', () => {
    const a = participant({ participantId: 'a', displayName: 'A', position: 900 });
    const b = participant({ participantId: 'b', displayName: 'B', position: 800 });
    const c = participant({ participantId: 'c', displayName: 'C', position: 700 });
    const local = participant({ participantId: 'local', displayName: 'Local', position: 600 });
    const prev = ranked([a, b, c, local]); // Local 4
    const next = ranked([{ ...local, position: 950 }, a, b, c]); // Local 1
    const events = detectRankChanges(prev, next, 'local');
    expect(events).toHaveLength(1);
    expect(events[0].other).toMatchObject({ participantId: 'c', displayName: 'C' });
    expect(events[0].rank).toBe(1);
  });

  test('reports nothing when the local rank is unchanged', () => {
    const prev = ranked([ada, rival]);
    const next = ranked([{ ...ada, position: 420 }, { ...rival, position: 470 }]);
    expect(detectRankChanges(prev, next, 'ada')).toEqual([]);
  });

  test('reports nothing when the local participant is absent from either ranking', () => {
    const prev = ranked([rival]);
    const next = ranked([ada, rival]);
    expect(detectRankChanges(prev, next, 'ada')).toEqual([]);
    expect(detectRankChanges(prev, [], 'ada')).toEqual([]);
  });

  test('reports nothing for the rank-1 participant (nowhere to go up)', () => {
    const prev = ranked([{ ...ada, position: 500 }, rival]);
    const next = ranked([{ ...ada, position: 700 }, rival]);
    expect(detectRankChanges(prev, next, 'ada')).toEqual([]);
  });

  test('only reports changes that concern the given local participant', () => {
    // Third and Rival swap the lead while Ada keeps rank 2: nothing for Ada.
    const third = participant({ participantId: 'third', displayName: 'Third', position: 900 });
    const prev = ranked([third, ada, { ...rival, position: 300 }]); // Third 1, Ada 2, Rival 3
    const next = ranked([{ ...rival, position: 850 }, ada, { ...third, position: 300 }]); // Rival 1, Ada 2, Third 3
    expect(detectRankChanges(prev, next, 'ada')).toEqual([]);
  });
});
