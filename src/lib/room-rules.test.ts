/**
 * @jest-environment node
 *
 * Unit tests for the pure room business rules (SALLE-02/04/05/07/08/09). No
 * database or Next.js involved: each rule is a deterministic function over
 * plain data.
 */

import { ROOM_CODE_ALPHABET } from '../db/schema';
import {
  canJoinRoom,
  countPresentParticipants,
  findHostSuccessor,
  generateRoomCode,
  hasKickHistory,
  roomHasFreeParticipantSlot,
  shouldRevokeMemberInvitations,
  shouldRevokeRoomInvitations,
  type PresentMember,
} from './room-rules';

function member(overrides: Partial<PresentMember> = {}): PresentMember {
  return {
    role: 'participant',
    userId: 1,
    guestToken: null,
    kicked: false,
    leftAt: null,
    joinedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('canJoinRoom (SALLE-09)', () => {
  test.each(['en_attente', 'resultats'])('accepts joins in %s', (status) => {
    expect(canJoinRoom(status)).toBe(true);
  });

  test.each(['decompte', 'en_course', 'fermee'])('rejects joins in %s', (status) => {
    expect(canJoinRoom(status)).toBe(false);
  });

  test('rejects an unknown status', () => {
    expect(canJoinRoom('autre')).toBe(false);
  });
});

describe('countPresentParticipants (SALLE-05)', () => {
  test('counts only present participants', () => {
    const members = [
      member({ role: 'participant' }),
      member({ role: 'participant', userId: 2 }),
      member({ role: 'spectator', userId: 3 }),
      member({ role: 'participant', userId: 4, leftAt: new Date() }),
      member({ role: 'participant', userId: 5, kicked: true }),
      member({ role: 'host', userId: 6 }),
    ];

    expect(countPresentParticipants(members)).toBe(2);
  });

  test('returns zero for an empty list', () => {
    expect(countPresentParticipants([])).toBe(0);
  });
});

describe('roomHasFreeParticipantSlot (SALLE-05)', () => {
  test('accepts participants below capacity', () => {
    expect(roomHasFreeParticipantSlot(9, 10)).toBe(true);
  });

  test('rejects participants at capacity', () => {
    expect(roomHasFreeParticipantSlot(10, 10)).toBe(false);
  });

  test('rejects participants above capacity', () => {
    expect(roomHasFreeParticipantSlot(11, 10)).toBe(false);
  });
});

describe('hasKickHistory (SALLE-07)', () => {
  test('detects a past kick among the memberships', () => {
    expect(hasKickHistory([{ kicked: false }, { kicked: true }])).toBe(true);
  });

  test('returns false when nobody was kicked', () => {
    expect(hasKickHistory([{ kicked: false }])).toBe(false);
    expect(hasKickHistory([])).toBe(false);
  });
});

describe('findHostSuccessor (SALLE-08)', () => {
  test('picks the human member present the longest', () => {
    const members = [
      member({ userId: 1, joinedAt: new Date('2024-01-03T00:00:00Z') }),
      member({ userId: 2, joinedAt: new Date('2024-01-01T00:00:00Z') }),
      member({ userId: 3, joinedAt: new Date('2024-01-02T00:00:00Z') }),
    ];

    expect(findHostSuccessor(members)?.userId).toBe(2);
  });

  test('accepts spectators as successors', () => {
    const members = [
      member({ userId: 1, role: 'spectator', joinedAt: new Date('2024-01-01T00:00:00Z') }),
      member({ userId: 2, joinedAt: new Date('2024-01-02T00:00:00Z') }),
    ];

    expect(findHostSuccessor(members)?.userId).toBe(1);
  });

  test('excludes guests: only logged-in users can host', () => {
    const members = [
      member({ userId: null, guestToken: '11111111-1111-4111-8111-111111111111' }),
      member({ userId: 2, joinedAt: new Date('2024-01-02T00:00:00Z') }),
    ];

    expect(findHostSuccessor(members)?.userId).toBe(2);
  });

  test('excludes kicked and departed members', () => {
    const members = [
      member({ userId: 1, kicked: true, joinedAt: new Date('2024-01-01T00:00:00Z') }),
      member({ userId: 2, leftAt: new Date('2024-01-02T00:00:00Z') }),
    ];

    expect(findHostSuccessor(members)).toBeNull();
  });

  test('excludes the host role itself', () => {
    const members = [
      member({ userId: 1, role: 'host', joinedAt: new Date('2024-01-01T00:00:00Z') }),
      member({ userId: 2, joinedAt: new Date('2024-01-02T00:00:00Z') }),
    ];

    expect(findHostSuccessor(members)?.userId).toBe(2);
  });

  test('returns null when no human member is eligible (room closes)', () => {
    expect(findHostSuccessor([])).toBeNull();
    expect(
      findHostSuccessor([
        member({ userId: null, guestToken: '11111111-1111-4111-8111-111111111111' }),
      ]),
    ).toBeNull();
  });
});

describe('invitation revocation rules (SALLE-04)', () => {
  test('a kicked member has their links revoked', () => {
    expect(shouldRevokeMemberInvitations({ kicked: true })).toBe(true);
    expect(shouldRevokeMemberInvitations({ kicked: false })).toBe(false);
  });

  test('a closed room has all its links revoked', () => {
    expect(shouldRevokeRoomInvitations('fermee')).toBe(true);
    expect(shouldRevokeRoomInvitations('en_attente')).toBe(false);
    expect(shouldRevokeRoomInvitations('resultats')).toBe(false);
  });
});

describe('generateRoomCode (SALLE-02)', () => {
  test('produces a 6-character code', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
  });

  test('only draws from the unambiguous alphabet', () => {
    for (let index = 0; index < 100; index += 1) {
      const code = generateRoomCode();
      for (const char of code) {
        expect(ROOM_CODE_ALPHABET).toContain(char);
      }
    }
  });

  test('is deterministic for a seeded RNG', () => {
    const sequence = [0, 0.5, 0.999, 0.25, 0.75, 0.12345];
    let index = 0;
    const seeded = () => sequence[index++ % sequence.length];

    expect(generateRoomCode(seeded)).toBe(generateRoomCode(seeded));
  });

  test('maps a constant RNG to the first and last alphabet characters', () => {
    expect(generateRoomCode(() => 0)).toBe(ROOM_CODE_ALPHABET[0].repeat(6));
    expect(generateRoomCode(() => 0.999999)).toBe(
      ROOM_CODE_ALPHABET[ROOM_CODE_ALPHABET.length - 1].repeat(6),
    );
  });
});
