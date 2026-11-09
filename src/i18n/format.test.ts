/**
 * @jest-environment node
 *
 * I18N-03: number and date formatting must follow the active locale — the
 * decimal/group separators differ between fr and en.
 */

import {
  formatDate,
  formatDateTime,
  formatDurationMmSs,
  formatGroupedDigits,
  formatNumber,
} from './format';

describe('formatNumber (I18N-03)', () => {
  test('groups thousands with the locale separator', () => {
    expect(formatNumber(148920, 'en')).toBe('148,920');
    expect(formatNumber(148920, 'fr')).toBe('148\u202F920');
  });

  test('uses the locale decimal separator', () => {
    expect(formatNumber(84.6, 'en', { minimumFractionDigits: 1 })).toBe('84.6');
    expect(formatNumber(84.6, 'fr', { minimumFractionDigits: 1 })).toBe('84,6');
  });

  test('respects explicit fraction digits', () => {
    expect(formatNumber(112, 'fr', { maximumFractionDigits: 0 })).toBe('112');
    expect(formatNumber(84.6, 'en', { minimumFractionDigits: 1, maximumFractionDigits: 1 })).toBe('84.6');
  });
});

describe('formatGroupedDigits (I18N-03)', () => {
  test('groups raw digit strings without losing precision', () => {
    expect(formatGroupedDigits('148920', 'en')).toBe('148,920');
    expect(formatGroupedDigits('148920', 'fr')).toBe('148\u202F920');
    expect(formatGroupedDigits('9007199254740993', 'en')).toBe('9,007,199,254,740,993');
  });

  test('keeps leading minus signs and zero', () => {
    expect(formatGroupedDigits('-4820', 'fr')).toBe('-4\u202F820');
    expect(formatGroupedDigits('0', 'en')).toBe('0');
    expect(formatGroupedDigits('', 'fr')).toBe('');
  });
});

describe('formatDate (I18N-03)', () => {
  // Built from LOCAL components so the expected day is identical in any
  // time zone (the formatter renders in the local zone, like the UI).
  const date = new Date(2026, 10, 7, 12, 0, 0);
  const iso = date.toISOString();

  test('formats the locale date layout from a Date or ISO string', () => {
    expect(formatDate(date, 'en')).toContain('2026');
    expect(formatDate(iso, 'en')).toBe(formatDate(date, 'en'));
  });

  test('differs between locales for day-first months', () => {
    // 2026-11-07 renders differently when month/day order differs.
    const en = formatDate(date, 'en');
    const fr = formatDate(date, 'fr');
    expect(en).toBe('11/07/2026');
    expect(fr).toBe('07/11/2026');
  });
});

describe('formatDateTime (I18N-03)', () => {
  const date = new Date(2026, 10, 7, 12, 0, 0);

  test('includes a locale time component', () => {
    const fr = formatDateTime(date, 'fr');
    const en = formatDateTime(date, 'en');
    expect(fr).toContain('07/11/2026');
    expect(en).toContain('11/07/2026');
    // HH:mm with 2-digit hour exists in both.
    expect(fr).toMatch(/\d{2}:\d{2}/);
  });
});

describe('formatDurationMmSs (HIST-01)', () => {
  test('formats a race duration as M:SS with locale digits', () => {
    expect(formatDurationMmSs(58_000, 'en')).toBe('0:58');
    expect(formatDurationMmSs(74_000, 'fr')).toBe('1:14');
    expect(formatDurationMmSs(600_000, 'fr')).toBe('10:00');
  });

  test('never goes negative', () => {
    expect(formatDurationMmSs(-5_000, 'en')).toBe('0:00');
  });
});
