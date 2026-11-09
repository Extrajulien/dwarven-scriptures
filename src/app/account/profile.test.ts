/**
 * @jest-environment node
 */

import type { UserProfileWithStatsInternal } from '../../db/schema';
import { toAccountProfile } from './profile';

const baseProfile: UserProfileWithStatsInternal = {
  id: 7,
  publicId: '11111111-1111-4111-8111-111111111111',
  username: 'ada',
  pfpUrl: null,
  createdAt: new Date('2026-11-07T12:00:00Z'),
  racesCompleted: 412,
  totalWords: 148920n,
  totalTimeMs: 6000000n,
  bestWpm: '112.00',
  wins: 211,
  correctKeystrokes: 891_340n,
  totalKeystrokes: 938_300n,
  coins: 4820n,
  gems: 12,
  avgWpm: 84.6,
  avgAccuracy: 95.0,
};

describe('toAccountProfile', () => {
  test('serializes every field to a client-safe, unformatted value', () => {
    const result = toAccountProfile(baseProfile, ['github']);

    expect(result).toEqual({
      username: 'ada',
      pfpUrl: null,
      createdAt: '2026-11-07T12:00:00.000Z',
      racesCompleted: 412,
      totalWords: '148920',
      bestWpm: 112,
      avgWpm: 84.6,
      wins: 211,
      avgAccuracy: 95,
      coins: '4820',
      gems: 12,
      linkedProviders: ['github'],
    });
  });

  test('drops the internal id and raw totalTimeMs', () => {
    const result = toAccountProfile(baseProfile, []) as unknown as Record<string, unknown>;

    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('totalTimeMs');
    expect(result).not.toHaveProperty('passwordHash');
  });

  test('never emits a bigint or Date in the output', () => {
    const result = toAccountProfile(baseProfile, []);

    for (const value of Object.values(result)) {
      expect(typeof value).not.toBe('bigint');
      expect(value).not.toBeInstanceOf(Date);
    }
  });

  test('serializes a zero-valued profile sensibly', () => {
    const result = toAccountProfile(
      { ...baseProfile, bestWpm: '0.00', avgWpm: 0, totalWords: 0n, coins: 0n, gems: 0, racesCompleted: 0 },
      [],
    );

    expect(result.bestWpm).toBe(0);
    expect(result.avgWpm).toBe(0);
    expect(result.totalWords).toBe('0');
    expect(result.coins).toBe('0');
  });
});
