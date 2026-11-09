/**
 * @jest-environment node
 *
 * Unit tests for the race start rules (COURSE-02/03, SALLE-09): participant
 * collection, config validation against the room-config schema, and the
 * room-status ↔ race-phase mapping. Pure functions over plain data.
 */

import { defaultRoomConfig } from '../room-config';
import {
  collectRaceParticipants,
  phaseForRoomStatus,
  RaceStartRulesError,
  roomStatusForPhase,
  validateRaceConfig,
  type MemberForRace,
} from './start-rules';

function member(overrides: Partial<MemberForRace> = {}): MemberForRace {
  return {
    memberId: 1,
    role: 'participant',
    userId: 11,
    guestToken: null,
    displayName: 'ada',
    ...overrides,
  };
}

describe('collectRaceParticipants (COURSE-02)', () => {
  test('maps users and guests to racing participants, stringifying the member id', () => {
    const participants = collectRaceParticipants([
      member({ memberId: 1, userId: 11, displayName: 'ada' }),
      member({
        memberId: 2,
        userId: null,
        guestToken: '11111111-1111-4111-8111-111111111111',
        displayName: 'visiteur',
      }),
    ]);

    expect(participants).toEqual([
      { memberId: '1', kind: 'user', displayName: 'ada', isSpectator: false },
      { memberId: '2', kind: 'guest', displayName: 'visiteur', isSpectator: false },
    ]);
  });

  test('excludes spectators entirely', () => {
    const participants = collectRaceParticipants([
      member({ memberId: 1, role: 'spectator' }),
      member({ memberId: 2 }),
    ]);

    expect(participants).toHaveLength(1);
    expect(participants[0]?.memberId).toBe('2');
  });

  test('treats the legacy host role as a racing participant', () => {
    const participants = collectRaceParticipants([member({ memberId: 1, role: 'host' })]);

    expect(participants).toEqual([
      { memberId: '1', kind: 'user', displayName: 'ada', isSpectator: false },
    ]);
  });

  test('rejects a member with neither identity', () => {
    expect(() =>
      collectRaceParticipants([member({ userId: null, guestToken: null })]),
    ).toThrow(RaceStartRulesError);
    try {
      collectRaceParticipants([member({ userId: null, guestToken: null })]);
    } catch (error) {
      expect((error as RaceStartRulesError).code).toBe('invalid_member_identity');
    }
  });

  test('rejects a member with both identities', () => {
    expect(() =>
      collectRaceParticipants([
        member({ guestToken: '11111111-1111-4111-8111-111111111111' }),
      ]),
    ).toThrow(RaceStartRulesError);
  });

  test('returns an empty list for an empty room', () => {
    expect(collectRaceParticipants([])).toEqual([]);
  });
});

describe('validateRaceConfig (CONF-01..12, TECH-07)', () => {
  test('accepts a valid configuration', () => {
    const result = validateRaceConfig(defaultRoomConfig);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config).toEqual(defaultRoomConfig);
    }
  });

  test('accepts the nullable time limit as null', () => {
    const result = validateRaceConfig({ ...defaultRoomConfig, timeLimitSeconds: null });
    expect(result.ok).toBe(true);
  });

  test('rejects an invalid configuration with readable issues', () => {
    const result = validateRaceConfig({ ...defaultRoomConfig, wordCount: 3 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.join(' ')).toContain('wordCount');
    }
  });

  test('rejects unknown keys (strict schema)', () => {
    const result = validateRaceConfig({ ...defaultRoomConfig, cheat: true });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join(' ')).toContain('cheat');
    }
  });

  test('rejects a missing option flag', () => {
    const invalid = {
      ...defaultRoomConfig,
      options: { punctuation: true, numbers: true, capitals: true },
    };

    expect(validateRaceConfig(invalid).ok).toBe(false);
  });
});

describe('roomStatusForPhase / phaseForRoomStatus (COURSE-01, SALLE-09)', () => {
  const phases = ['en_attente', 'decompte', 'en_course', 'resultats', 'fermee'] as const;

  test.each(phases)('maps the phase %s to the identical room status', (phase) => {
    expect(roomStatusForPhase(phase)).toBe(phase);
  });

  test('rejects an unknown phase', () => {
    expect(() => roomStatusForPhase('termine')).toThrow(RaceStartRulesError);
    try {
      roomStatusForPhase('termine');
    } catch (error) {
      expect((error as RaceStartRulesError).code).toBe('unknown_phase');
    }
  });

  test('phaseForRoomStatus returns the phase for a known status and null otherwise', () => {
    expect(phaseForRoomStatus('en_course')).toBe('en_course');
    expect(phaseForRoomStatus('en_attente')).toBe('en_attente');
    expect(phaseForRoomStatus('inconnu')).toBeNull();
  });

  test('only en_attente and resultats accept new members (SALLE-09)', () => {
    // Mirrors room-rules: the joinable statuses are the race's waiting and
    // results phases — never the countdown, the race itself or a closed room.
    expect(phaseForRoomStatus('en_attente')).toBe('en_attente');
    expect(phaseForRoomStatus('resultats')).toBe('resultats');
    expect(['decompte', 'en_course', 'fermee'].some((phase) => phaseForRoomStatus(phase) === null)).toBe(false);
  });
});
