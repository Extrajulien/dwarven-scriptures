import { pickQuickPlayRoom, rankQuickPlayRooms, type QuickPlayCandidate } from './quickplay';

function room(
  overrides: Partial<QuickPlayCandidate> & { publicId: string },
): QuickPlayCandidate {
  return {
    capacity: 10,
    participantCount: 0,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('pickQuickPlayRoom (JOIN-03)', () => {
  test('returns null when there are no rooms', () => {
    expect(pickQuickPlayRoom([])).toBeNull();
  });

  test('returns null when every room is full', () => {
    const rooms = [
      room({ publicId: 'a', capacity: 4, participantCount: 4 }),
      room({ publicId: 'b', capacity: 10, participantCount: 10 }),
    ];
    expect(pickQuickPlayRoom(rooms)).toBeNull();
  });

  test('picks the room closest to its capacity', () => {
    const rooms = [
      room({ publicId: 'half', capacity: 10, participantCount: 5 }),
      room({ publicId: 'almost', capacity: 4, participantCount: 3 }),
      room({ publicId: 'empty', capacity: 8, participantCount: 0 }),
    ];
    expect(pickQuickPlayRoom(rooms)?.publicId).toBe('almost');
  });

  test('compares fills with integer math (1/2 vs 2/4 are equal fills)', () => {
    const rooms = [
      room({ publicId: 'half', capacity: 2, participantCount: 1 }),
      room({ publicId: 'twoFourths', capacity: 4, participantCount: 2 }),
    ];
    expect(rankQuickPlayRooms(rooms)[0]?.publicId).toBe('half');
  });

  test('the oldest room wins an exact tie', () => {
    const rooms = [
      room({
        publicId: 'newer',
        capacity: 4,
        participantCount: 2,
        createdAt: new Date('2024-06-01T00:00:00Z'),
      }),
      room({
        publicId: 'older',
        capacity: 4,
        participantCount: 2,
        createdAt: new Date('2024-01-01T00:00:00Z'),
      }),
    ];
    expect(pickQuickPlayRoom(rooms)?.publicId).toBe('older');
  });

  test('ignores full rooms even when they would rank highest', () => {
    const rooms = [
      room({ publicId: 'full', capacity: 4, participantCount: 4 }),
      room({ publicId: 'open', capacity: 30, participantCount: 1 }),
    ];
    expect(pickQuickPlayRoom(rooms)?.publicId).toBe('open');
  });
});

describe('rankQuickPlayRooms (JOIN-03)', () => {
  test('sorts by fill, then age, and drops full rooms', () => {
    const older = new Date('2024-01-01T00:00:00Z');
    const newer = new Date('2024-06-01T00:00:00Z');
    const rooms = [
      room({ publicId: 'empty', capacity: 8, participantCount: 0 }),
      room({ publicId: 'full', capacity: 4, participantCount: 4 }),
      room({ publicId: 'tie-new', capacity: 4, participantCount: 2, createdAt: newer }),
      room({ publicId: 'tie-old', capacity: 4, participantCount: 2, createdAt: older }),
      room({ publicId: 'best', capacity: 5, participantCount: 4 }),
    ];

    expect(rankQuickPlayRooms(rooms).map((candidate) => candidate.publicId)).toEqual([
      'best',
      'tie-old',
      'tie-new',
      'empty',
    ]);
  });

  test('does not mutate the input array', () => {
    const rooms = [
      room({ publicId: 'a', capacity: 5, participantCount: 4 }),
      room({ publicId: 'b', capacity: 10, participantCount: 1 }),
    ];
    const snapshot = rooms.map((candidate) => candidate.publicId);
    rankQuickPlayRooms(rooms);
    expect(rooms.map((candidate) => candidate.publicId)).toEqual(snapshot);
  });
});
