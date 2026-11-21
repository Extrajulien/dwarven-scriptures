import { readRaceKeyErrors, storeRaceKeyErrors } from './key-errors-store';

/**
 * RES-03: the session-storage bridge that carries the local racer's per-key
 * error counts from the race arena to the results view.
 */

const ROOM = '11111111-1111-4111-8111-111111111111';
const OTHER_ROOM = '22222222-2222-4222-8222-222222222222';
const STORAGE_KEY = `dsh:race:keyErrors:${ROOM}`;

describe('key-errors-store (RES-03 session-storage bridge)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  test('round-trips the per-key error map for a room', () => {
    storeRaceKeyErrors(ROOM, { a: 1, s: 4, ' ': 2 });
    expect(readRaceKeyErrors(ROOM)).toEqual({ a: 1, s: 4, ' ': 2 });
  });

  test('returns null when nothing was stored for the room', () => {
    expect(readRaceKeyErrors(ROOM)).toBeNull();
  });

  test('keeps rooms independent', () => {
    storeRaceKeyErrors(ROOM, { a: 1 });
    storeRaceKeyErrors(OTHER_ROOM, { b: 2 });
    expect(readRaceKeyErrors(ROOM)).toEqual({ a: 1 });
    expect(readRaceKeyErrors(OTHER_ROOM)).toEqual({ b: 2 });
  });

  test('returns an empty map when an empty map was stored (clean race)', () => {
    storeRaceKeyErrors(ROOM, {});
    expect(readRaceKeyErrors(ROOM)).toEqual({});
  });

  test('returns null for malformed JSON', () => {
    window.sessionStorage.setItem(STORAGE_KEY, '{not json');
    expect(readRaceKeyErrors(ROOM)).toBeNull();
  });

  test('drops non-numeric and negative entries defensively', () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ a: 2, b: 'x', c: -1, d: 0 }),
    );
    expect(readRaceKeyErrors(ROOM)).toEqual({ a: 2, d: 0 });
  });

  test('returns null for a non-object payload', () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));
    expect(readRaceKeyErrors(ROOM)).toBeNull();
  });
});
