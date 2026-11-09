/**
 * @jest-environment node
 *
 * Unit tests for the pure race state machine (COURSE-01/02/03/09). The clock
 * is injected everywhere, so every transition and every guard rejection is
 * deterministic — no database, no transport, no timers.
 */

import { defaultRoomConfig } from '../room-config';
import {
  COUNTDOWN_MS,
  COUNTDOWN_SECONDS,
  MIN_HUMAN_PARTICIPANTS,
  MIN_RACE_PARTICIPANTS,
  RaceTransitionError,
  RACE_PHASES,
  advance,
  closeRace,
  configureRace,
  countRacingParticipants,
  countdownSecondsRemaining,
  createRace,
  finishParticipant,
  isHumanKind,
  isRacePhase,
  isRaceTextVisible,
  relaunch,
  requestStart,
  textVisibleForPhase,
  type RaceParticipant,
  type RaceState,
  type RaceText,
} from './state';

const T0 = new Date('2026-01-01T12:00:00.000Z');

const TEXT: RaceText = {
  id: '1',
  body: 'Ceci est un texte de course.',
  language: 'fr',
  complexity: 'moyen',
  wordCount: 6,
};

function participant(overrides: Partial<RaceParticipant> = {}): RaceParticipant {
  return {
    memberId: 'member-1',
    kind: 'user',
    displayName: 'ada',
    isSpectator: false,
    ...overrides,
  };
}

function spectator(overrides: Partial<RaceParticipant> = {}): RaceParticipant {
  return participant({ memberId: 'spec-1', isSpectator: true, ...overrides });
}

function raceWith(participants: RaceParticipant[], config = defaultRoomConfig): RaceState {
  return createRace({ participants, config });
}

function hostActor(): { isHost: boolean } {
  return { isHost: true };
}

/** A race sitting in DÉCOMPTE right after a successful start at `T0`. */
function startedRace(participants: RaceParticipant[]): RaceState {
  return requestStart(
    raceWith(participants),
    T0,
    hostActor(),
    TEXT,
  );
}

/** A race in EN_COURSE (the countdown has passed). */
function racingRace(participants: RaceParticipant[]): RaceState {
  return advance(startedRace(participants), new Date(T0.getTime() + COUNTDOWN_MS));
}

describe('RACE_PHASES and guards', () => {
  test('exposes exactly the COURSE-01 phases in the rooms.status vocabulary', () => {
    expect(RACE_PHASES).toEqual([
      'en_attente',
      'decompte',
      'en_course',
      'resultats',
      'fermee',
    ]);
  });

  test('isRacePhase accepts the five phases and rejects anything else', () => {
    for (const phase of RACE_PHASES) {
      expect(isRacePhase(phase)).toBe(true);
    }
    expect(isRacePhase('autre')).toBe(false);
    expect(isRacePhase('')).toBe(false);
  });

  test('isHumanKind counts users and guests as humans, bots as not', () => {
    expect(isHumanKind('user')).toBe(true);
    expect(isHumanKind('guest')).toBe(true);
    expect(isHumanKind('bot')).toBe(false);
  });
});

describe('createRace', () => {
  test('builds an EN_ATTENTE race with no timestamps, text or results', () => {
    const race = raceWith([participant(), participant({ memberId: 'member-2' })]);

    expect(race.phase).toBe('en_attente');
    expect(race.chosenText).toBeNull();
    expect(race.startedAt).toBeNull();
    expect(race.startAt).toBeNull();
    expect(race.finishedAt).toBeNull();
    expect(race.results).toEqual([]);
    expect(race.config).toBe(defaultRoomConfig);
  });

  test('copies the participant list so callers cannot mutate it', () => {
    const members = [participant(), participant({ memberId: 'member-2' })];
    const race = raceWith(members);
    members.pop();

    expect(race.participants).toHaveLength(2);
  });
});

describe('countRacingParticipants (COURSE-02)', () => {
  test('excludes spectators; counts bots but only users/guests as humans', () => {
    const counts = countRacingParticipants([
      participant({ memberId: 'u1', kind: 'user' }),
      participant({ memberId: 'g1', kind: 'guest' }),
      participant({ memberId: 'b1', kind: 'bot' }),
      spectator({ memberId: 's1' }),
    ]);

    expect(counts).toEqual({ total: 3, humans: 2, bots: 1 });
  });

  test('returns zeros for an empty list', () => {
    expect(countRacingParticipants([])).toEqual({ total: 0, humans: 0, bots: 0 });
  });
});

describe('requestStart (COURSE-02/03)', () => {
  test('moves EN_ATTENTE to DÉCOMPTE with the countdown timestamps', () => {
    const race = requestStart(
      raceWith([participant(), participant({ memberId: 'member-2' })]),
      T0,
      hostActor(),
      TEXT,
    );

    expect(race.phase).toBe('decompte');
    expect(race.startedAt).toEqual(T0);
    expect(race.startAt).toEqual(new Date(T0.getTime() + COUNTDOWN_MS));
    expect(race.chosenText).toBe(TEXT);
    expect(race.finishedAt).toBeNull();
    expect(race.results).toEqual([]);
  });

  test('accepts a bot as the second participant (bots count)', () => {
    const race = requestStart(
      raceWith([participant({ memberId: 'h1' }), participant({ memberId: 'b1', kind: 'bot' })]),
      T0,
      hostActor(),
      TEXT,
    );

    expect(race.phase).toBe('decompte');
  });

  test('accepts a guest as the second participant (guests are human)', () => {
    const race = requestStart(
      raceWith([
        participant({ memberId: 'u1' }),
        participant({ memberId: 'g1', kind: 'guest', displayName: 'visiteur' }),
      ]),
      T0,
      hostActor(),
      TEXT,
    );

    expect(race.phase).toBe('decompte');
  });

  test.each(RACE_PHASES.filter((phase) => phase !== 'en_attente'))(
    'rejects a start from %s',
    (phase) => {
      const race: RaceState = { ...raceWith([participant(), participant({ memberId: 'm2' })]), phase };

      expect(() => requestStart(race, T0, hostActor(), TEXT)).toThrow(RaceTransitionError);
      try {
        requestStart(race, T0, hostActor(), TEXT);
      } catch (error) {
        expect((error as RaceTransitionError).code).toBe('not_in_attente');
      }
    },
  );

  test('rejects a non-host actor (SEC-01 guard)', () => {
    const race = raceWith([participant(), participant({ memberId: 'member-2' })]);

    expect(() => requestStart(race, T0, { isHost: false }, TEXT)).toThrow(
      RaceTransitionError,
    );
    try {
      requestStart(race, T0, { isHost: false }, TEXT);
    } catch (error) {
      expect((error as RaceTransitionError).code).toBe('not_host');
    }
  });

  test('rejects fewer than the minimum participants (spectators do not count)', () => {
    const single = raceWith([participant()]);
    const singleWithSpectator = raceWith([participant(), spectator()]);
    const twoWithSpectator = raceWith([
      participant(),
      participant({ memberId: 'm2', isSpectator: true }),
    ]);

    for (const race of [single, singleWithSpectator, twoWithSpectator]) {
      expect(() => requestStart(race, T0, hostActor(), TEXT)).toThrow(RaceTransitionError);
      try {
        requestStart(race, T0, hostActor(), TEXT);
      } catch (error) {
        expect((error as RaceTransitionError).code).toBe('not_enough_participants');
      }
    }
    expect(MIN_RACE_PARTICIPANTS).toBe(2);
  });

  test('rejects a race with bots only (no human participant)', () => {
    const race = raceWith([
      participant({ memberId: 'b1', kind: 'bot' }),
      participant({ memberId: 'b2', kind: 'bot' }),
    ]);

    expect(() => requestStart(race, T0, hostActor(), TEXT)).toThrow(RaceTransitionError);
    try {
      requestStart(race, T0, hostActor(), TEXT);
    } catch (error) {
      expect((error as RaceTransitionError).code).toBe('no_human_participant');
    }
    expect(MIN_HUMAN_PARTICIPANTS).toBe(1);
  });

  test('rejects an empty or missing text', () => {
    const race = raceWith([participant(), participant({ memberId: 'member-2' })]);

    expect(() => requestStart(race, T0, hostActor(), { ...TEXT, body: '' })).toThrow(
      RaceTransitionError,
    );
    try {
      requestStart(race, T0, hostActor(), { ...TEXT, body: '' });
    } catch (error) {
      expect((error as RaceTransitionError).code).toBe('missing_text');
    }
  });

  test('clears any stale results when starting', () => {
    const race = raceWith([participant(), participant({ memberId: 'member-2' })]);
    const dirty: RaceState = {
      ...race,
      results: [{ memberId: 'member-1', finalState: 'finished', endedAt: T0 }],
      finishedAt: T0,
    };

    const started = requestStart(dirty, T0, hostActor(), TEXT);
    expect(started.results).toEqual([]);
    expect(started.finishedAt).toBeNull();
  });

  test('rejects an invalid clock', () => {
    const race = raceWith([participant(), participant({ memberId: 'member-2' })]);
    expect(() => requestStart(race, new Date('nope'), hostActor(), TEXT)).toThrow(
      RaceTransitionError,
    );
  });
});

describe('advance — countdown (COURSE-03)', () => {
  test('stays in DÉCOMPTE one millisecond before startAt (same object)', () => {
    const race = startedRace([participant(), participant({ memberId: 'member-2' })]);
    const next = advance(race, new Date(T0.getTime() + COUNTDOWN_MS - 1));

    expect(next).toBe(race);
    expect(next.phase).toBe('decompte');
  });

  test('moves to EN_COURSE exactly at startAt', () => {
    const race = startedRace([participant(), participant({ memberId: 'member-2' })]);
    const next = advance(race, new Date(T0.getTime() + COUNTDOWN_MS));

    expect(next.phase).toBe('en_course');
    expect(next.startAt).toEqual(new Date(T0.getTime() + COUNTDOWN_MS));
    expect(next.chosenText).toBe(TEXT);
  });

  test('moves to EN_COURSE after startAt (late tick)', () => {
    const race = startedRace([participant(), participant({ memberId: 'member-2' })]);
    const next = advance(race, new Date(T0.getTime() + COUNTDOWN_MS + 500));

    expect(next.phase).toBe('en_course');
  });

  test('does nothing outside DÉCOMPTE/EN_COURSE (same object)', () => {
    const waiting = raceWith([participant(), participant({ memberId: 'member-2' })]);
    expect(advance(waiting, T0)).toBe(waiting);

    const closed = closeRace(waiting);
    expect(advance(closed, T0)).toBe(closed);
  });
});

describe('advance — end conditions (COURSE-09)', () => {
  const members = [
    participant({ memberId: 'member-1' }),
    participant({ memberId: 'member-2' }),
    spectator({ memberId: 'spec-1' }),
  ];

  test('keeps racing while participants remain and no time limit is set', () => {
    const race = racingRace(members);

    const next = advance(race, new Date(T0.getTime() + 60_000));
    expect(next).toBe(race);
    expect(next.phase).toBe('en_course');
  });

  test('ends when every racing participant finished', () => {
    let race = racingRace(members);
    const t1 = new Date(T0.getTime() + COUNTDOWN_MS + 10_000);
    race = finishParticipant(race, 'member-1', t1, 'finished');
    const t2 = new Date(t1.getTime() + 5_000);
    race = finishParticipant(race, 'member-2', t2, 'finished');

    const next = advance(race, t2);
    expect(next.phase).toBe('resultats');
    expect(next.finishedAt).toEqual(t2);
    expect(next.results).toEqual([
      { memberId: 'member-1', finalState: 'finished', endedAt: t1 },
      { memberId: 'member-2', finalState: 'finished', endedAt: t2 },
    ]);
  });

  test('ends when participants finished or quit (mixed)', () => {
    let race = racingRace(members);
    const t1 = new Date(T0.getTime() + COUNTDOWN_MS + 10_000);
    race = finishParticipant(race, 'member-1', t1, 'finished');
    race = finishParticipant(race, 'member-2', t1, 'quit');

    const next = advance(race, t1);
    expect(next.phase).toBe('resultats');
    expect(next.results.map((result) => result.finalState).sort()).toEqual(['finished', 'quit']);
  });

  test('ends when only quitters remain (quit-only-left case)', () => {
    let race = racingRace(members);
    const t1 = new Date(T0.getTime() + COUNTDOWN_MS + 10_000);
    race = finishParticipant(race, 'member-1', t1, 'quit');
    race = finishParticipant(race, 'member-2', t1, 'quit');

    const next = advance(race, t1);
    expect(next.phase).toBe('resultats');
    expect(next.results).toHaveLength(2);
  });

  test('a spectator with no result never blocks the end', () => {
    let race = racingRace(members);
    const t1 = new Date(T0.getTime() + COUNTDOWN_MS + 10_000);
    race = finishParticipant(race, 'member-1', t1, 'finished');
    race = finishParticipant(race, 'member-2', t1, 'finished');

    const next = advance(race, t1);
    expect(next.phase).toBe('resultats');
  });

  test('times out remaining participants when the time limit is reached', () => {
    const config = { ...defaultRoomConfig, timeLimitSeconds: 60 };
    let race = requestStart(raceWith(members, config), T0, hostActor(), TEXT);
    race = advance(race, new Date(T0.getTime() + COUNTDOWN_MS));

    const t1 = new Date(T0.getTime() + COUNTDOWN_MS + 20_000);
    race = finishParticipant(race, 'member-1', t1, 'finished');

    // The limit is measured from startAt (typing start), not the countdown.
    const limit = new Date(T0.getTime() + COUNTDOWN_MS + 60_000);
    const next = advance(race, limit);

    expect(next.phase).toBe('resultats');
    expect(next.finishedAt).toEqual(limit);
    expect(next.results).toEqual([
      { memberId: 'member-1', finalState: 'finished', endedAt: t1 },
      { memberId: 'member-2', finalState: 'timeout', endedAt: limit },
    ]);
  });

  test('one millisecond before the limit keeps racing; at the limit it ends', () => {
    const config = { ...defaultRoomConfig, timeLimitSeconds: 60 };
    let race = requestStart(raceWith(members, config), T0, hostActor(), TEXT);
    race = advance(race, new Date(T0.getTime() + COUNTDOWN_MS));

    const before = advance(race, new Date(T0.getTime() + COUNTDOWN_MS + 60_000 - 1));
    expect(before).toBe(race);
    expect(before.phase).toBe('en_course');

    const at = advance(race, new Date(T0.getTime() + COUNTDOWN_MS + 60_000));
    expect(at.phase).toBe('resultats');
  });

  test('a null time limit never ends the race by time', () => {
    const config = { ...defaultRoomConfig, timeLimitSeconds: null };
    let race = requestStart(raceWith(members, config), T0, hostActor(), TEXT);
    race = advance(race, new Date(T0.getTime() + COUNTDOWN_MS));

    const hoursLater = advance(race, new Date(T0.getTime() + 10 * 60 * 60_000));
    expect(hoursLater).toBe(race);
    expect(hoursLater.phase).toBe('en_course');
  });
});

describe('finishParticipant (COURSE-07/09/10)', () => {
  const members = [
    participant({ memberId: 'member-1' }),
    participant({ memberId: 'member-2' }),
  ];

  test.each(['finished', 'quit', 'timeout'] as const)(
    'records a %s result without changing the phase',
    (finalState) => {
      const race = racingRace(members);
      const now = new Date(T0.getTime() + COUNTDOWN_MS + 5_000);

      const next = finishParticipant(race, 'member-1', now, finalState);
      expect(next.phase).toBe('en_course');
      expect(next.results).toEqual([{ memberId: 'member-1', finalState, endedAt: now }]);
    },
  );

  test('is idempotent: a duplicate result returns the same object', () => {
    const race = racingRace(members);
    const now = new Date(T0.getTime() + COUNTDOWN_MS + 5_000);
    const once = finishParticipant(race, 'member-1', now, 'finished');
    const twice = finishParticipant(once, 'member-1', new Date(now.getTime() + 1), 'quit');

    expect(twice).toBe(once);
    expect(twice.results).toHaveLength(1);
  });

  test.each(RACE_PHASES.filter((phase) => phase !== 'en_course'))(
    'rejects finishing outside EN_COURSE (%s)',
    (phase) => {
      const race: RaceState = { ...racingRace(members), phase };

      expect(() => finishParticipant(race, 'member-1', T0, 'finished')).toThrow(
        RaceTransitionError,
      );
      try {
        finishParticipant(race, 'member-1', T0, 'finished');
      } catch (error) {
        expect((error as RaceTransitionError).code).toBe('not_in_course');
      }
    },
  );

  test('rejects an unknown member', () => {
    const race = racingRace(members);

    expect(() => finishParticipant(race, 'ghost', T0, 'finished')).toThrow(
      RaceTransitionError,
    );
    try {
      finishParticipant(race, 'ghost', T0, 'finished');
    } catch (error) {
      expect((error as RaceTransitionError).code).toBe('unknown_participant');
    }
  });

  test('rejects a spectator finishing', () => {
    const race = racingRace([...members, spectator({ memberId: 'spec-1' })]);

    expect(() => finishParticipant(race, 'spec-1', T0, 'finished')).toThrow(
      RaceTransitionError,
    );
    try {
      finishParticipant(race, 'spec-1', T0, 'finished');
    } catch (error) {
      expect((error as RaceTransitionError).code).toBe('spectator_cannot_finish');
    }
  });

  test('rejects an unknown final state', () => {
    const race = racingRace(members);

    expect(() => finishParticipant(race, 'member-1', T0, 'exploded' as never)).toThrow(
      RaceTransitionError,
    );
    try {
      finishParticipant(race, 'member-1', T0, 'exploded' as never);
    } catch (error) {
      expect((error as RaceTransitionError).code).toBe('invalid_final_state');
    }
  });
});

describe('relaunch (COURSE-11)', () => {
  function finishedRace(): RaceState {
    let race = racingRace([participant(), participant({ memberId: 'member-2' })]);
    const now = new Date(T0.getTime() + COUNTDOWN_MS + 5_000);
    race = finishParticipant(race, 'member-1', now, 'finished');
    race = finishParticipant(race, 'member-2', now, 'finished');
    return advance(race, now);
  }

  test('returns to EN_ATTENTE keeping the participants', () => {
    const race = finishedRace();
    const next = relaunch(race);

    expect(next.phase).toBe('en_attente');
    expect(next.participants).toEqual(race.participants);
    expect(next.participants).not.toBe(race.participants);
    expect(next.chosenText).toBeNull();
    expect(next.startedAt).toBeNull();
    expect(next.startAt).toBeNull();
    expect(next.finishedAt).toBeNull();
    expect(next.results).toEqual([]);
  });

  test('keeps the config snapshot when none is provided', () => {
    const config = { ...defaultRoomConfig, wordCount: 120 };
    let race = racingRace([participant(), participant({ memberId: 'member-2' })], );
    race = { ...race, config };
    const now = new Date(T0.getTime() + COUNTDOWN_MS + 5_000);
    race = finishParticipant(race, 'member-1', now, 'finished');
    race = finishParticipant(race, 'member-2', now, 'finished');
    race = advance(race, now);

    expect(relaunch(race).config).toBe(config);
  });

  test('replaces the config snapshot when one is provided (config modifiable)', () => {
    const race = finishedRace();
    const nextConfig = { ...defaultRoomConfig, textLanguage: 'en' as const, wordCount: 40 };

    expect(relaunch(race, nextConfig).config).toBe(nextConfig);
  });

  test.each(RACE_PHASES.filter((phase) => phase !== 'resultats'))(
    'rejects a relaunch from %s',
    (phase) => {
      const race: RaceState = { ...raceWith([participant()]), phase };

      expect(() => relaunch(race)).toThrow(RaceTransitionError);
      try {
        relaunch(race);
      } catch (error) {
        expect((error as RaceTransitionError).code).toBe('not_in_results');
      }
    },
  );
});

describe('closeRace (COURSE-11)', () => {
  test.each(['resultats', 'en_attente'] as const)('closes from %s', (phase) => {
    const race: RaceState = { ...raceWith([participant()]), phase };
    const closed = closeRace(race);

    expect(closed.phase).toBe('fermee');
    expect(closed).not.toBe(race);
  });

  test.each(['decompte', 'en_course', 'fermee'] as const)(
    'rejects closing from %s',
    (phase) => {
      const race: RaceState = { ...raceWith([participant()]), phase };

      expect(() => closeRace(race)).toThrow(RaceTransitionError);
      try {
        closeRace(race);
      } catch (error) {
        expect((error as RaceTransitionError).code).toBe('not_closable');
      }
    },
  );
});

describe('configureRace (CONF-12)', () => {
  test('replaces the config while waiting', () => {
    const race = raceWith([participant()]);
    const next = { ...defaultRoomConfig, wordCount: 25 };

    expect(configureRace(race, next).config).toBe(next);
  });

  test('rejects config changes outside EN_ATTENTE', () => {
    const race = startedRace([participant(), participant({ memberId: 'member-2' })]);
    expect(() => configureRace(race, defaultRoomConfig)).toThrow(RaceTransitionError);
  });
});

describe('countdownSecondsRemaining (COURSE-03)', () => {
  test('a client joining mid-countdown can compute 3 → 1', () => {
    const race = startedRace([participant(), participant({ memberId: 'member-2' })]);

    expect(countdownSecondsRemaining(race, T0)).toBe(3);
    expect(countdownSecondsRemaining(race, new Date(T0.getTime() + 500))).toBe(3);
    expect(countdownSecondsRemaining(race, new Date(T0.getTime() + 1_000))).toBe(2);
    expect(countdownSecondsRemaining(race, new Date(T0.getTime() + 1_001))).toBe(2);
    expect(countdownSecondsRemaining(race, new Date(T0.getTime() + 2_000))).toBe(1);
    expect(countdownSecondsRemaining(race, new Date(T0.getTime() + 2_999))).toBe(1);
  });

  test('returns 0 once the boundary has passed (next advance flips the phase)', () => {
    const race = startedRace([participant(), participant({ memberId: 'member-2' })]);

    expect(countdownSecondsRemaining(race, new Date(T0.getTime() + COUNTDOWN_MS))).toBe(0);
    expect(countdownSecondsRemaining(race, new Date(T0.getTime() + COUNTDOWN_MS + 1_000))).toBe(0);
  });

  test('returns null outside DÉCOMPTE', () => {
    const waiting = raceWith([participant()]);
    expect(countdownSecondsRemaining(waiting, T0)).toBeNull();

    const racing = advance(startedRace([participant(), participant({ memberId: 'm2' })]), new Date(T0.getTime() + COUNTDOWN_MS));
    expect(countdownSecondsRemaining(racing, T0)).toBeNull();
  });

  test('COUNTDOWN_MS matches the documented 3 seconds', () => {
    expect(COUNTDOWN_SECONDS).toBe(3);
    expect(COUNTDOWN_MS).toBe(3_000);
  });
});

describe('text visibility (COURSE-03)', () => {
  test('the text is visible from DÉCOMPTE through RÉSULTATS only', () => {
    expect(textVisibleForPhase('en_attente')).toBe(false);
    expect(textVisibleForPhase('decompte')).toBe(true);
    expect(textVisibleForPhase('en_course')).toBe(true);
    expect(textVisibleForPhase('resultats')).toBe(true);
    expect(textVisibleForPhase('fermee')).toBe(false);
  });

  test('isRaceTextVisible requires a chosen text as well', () => {
    const waiting = raceWith([participant()]);
    expect(isRaceTextVisible(waiting)).toBe(false);

    const started = startedRace([participant(), participant({ memberId: 'member-2' })]);
    expect(isRaceTextVisible(started)).toBe(true);
  });
});

describe('full lifecycle (COURSE-01)', () => {
  test('EN_ATTENTE → DÉCOMPTE → EN_COURSE → RÉSULTATS → EN_ATTENTE → FERMÉE', () => {
    const members = [
      participant({ memberId: 'member-1' }),
      participant({ memberId: 'member-2' }),
    ];

    let race = raceWith(members);
    expect(race.phase).toBe('en_attente');

    race = requestStart(race, T0, hostActor(), TEXT);
    expect(race.phase).toBe('decompte');
    expect(isRaceTextVisible(race)).toBe(true);

    race = advance(race, new Date(T0.getTime() + COUNTDOWN_MS));
    expect(race.phase).toBe('en_course');

    const t1 = new Date(T0.getTime() + COUNTDOWN_MS + 10_000);
    race = finishParticipant(race, 'member-1', t1, 'finished');
    const t2 = new Date(t1.getTime() + 2_000);
    race = finishParticipant(race, 'member-2', t2, 'finished');
    race = advance(race, t2);
    expect(race.phase).toBe('resultats');
    expect(race.finishedAt).toEqual(t2);

    race = relaunch(race);
    expect(race.phase).toBe('en_attente');
    expect(race.participants.map((entry) => entry.memberId).sort()).toEqual([
      'member-1',
      'member-2',
    ]);

    race = closeRace(race);
    expect(race.phase).toBe('fermee');
  });
});
