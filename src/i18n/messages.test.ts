/**
 * @jest-environment node
 *
 * I18N-01: the fr/en bags must expose exactly the same keys — a missing
 * translation can never slip through — and `pick`/`getLocale` must resolve
 * the right bag from the `locale` cookie and the browser `Accept-Language`
 * default.
 */

import { cookies, headers } from 'next/headers';
import { getLocale, isLocale, MESSAGES, pick } from './messages';

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
  headers: jest.fn(),
}));

const cookiesMock = cookies as jest.Mock;
const headersMock = headers as jest.Mock;

type StoreStub = { get: (name: string) => { value: string } | undefined };
type HeadersStub = { get: (name: string) => string | null };

function stubCookies(localeCookie: string | undefined): void {
  const store: StoreStub = {
    get: (name: string) =>
      name === 'locale' && localeCookie !== undefined ? { value: localeCookie } : undefined,
  };
  cookiesMock.mockResolvedValue(store);
}

function stubAcceptLanguage(value: string): void {
  const requestHeaders: HeadersStub = { get: () => value };
  headersMock.mockResolvedValue(requestHeaders);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fr/en parity (I18N-01)', () => {
  test('both bags expose exactly the same keys', () => {
    const frKeys = Object.keys(MESSAGES.fr).sort();
    const enKeys = Object.keys(MESSAGES.en).sort();
    expect(enKeys).toEqual(frKeys);
  });

  test('both bags are complete and every value is a non-empty string', () => {
    for (const locale of ['fr', 'en'] as const) {
      for (const value of Object.values(MESSAGES[locale])) {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  test('the mobile race gate keys (DES-06) are non-empty in both bags', () => {
    for (const key of ['mobile.raceTitle', 'mobile.raceBody'] as const) {
      expect(MESSAGES.fr[key].length).toBeGreaterThan(0);
      expect(MESSAGES.en[key].length).toBeGreaterThan(0);
    }
  });
});

describe('isLocale', () => {
  test('accepts only fr and en', () => {
    expect(isLocale('fr')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale('FR')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe('pick', () => {
  test('returns the bag of a supported locale', () => {
    expect(pick('fr')).toBe(MESSAGES.fr);
    expect(pick('en')).toBe(MESSAGES.en);
  });

  test('falls back to French for unsupported or missing values', () => {
    expect(pick('de')).toBe(MESSAGES.fr);
    expect(pick(null)).toBe(MESSAGES.fr);
    expect(pick(undefined)).toBe(MESSAGES.fr);
  });
});

describe('getLocale', () => {
  test('prefers the locale cookie', async () => {
    stubCookies('en');
    stubAcceptLanguage('fr-CA,fr;q=0.9');
    await expect(getLocale()).resolves.toBe('en');
  });

  test('falls back to Accept-Language when the cookie is missing', async () => {
    stubCookies(undefined);
    stubAcceptLanguage('fr-CA,fr;q=0.9');
    await expect(getLocale()).resolves.toBe('fr');
  });

  test('maps any non-French Accept-Language to en', async () => {
    stubCookies(undefined);
    stubAcceptLanguage('en-US,en;q=0.9');
    await expect(getLocale()).resolves.toBe('en');
  });

  test('ignores an invalid cookie value and falls back to Accept-Language', async () => {
    stubCookies('de');
    stubAcceptLanguage('en-GB,en;q=0.9');
    await expect(getLocale()).resolves.toBe('en');
  });

  test('defaults to fr when nothing is available', async () => {
    stubCookies(undefined);
    stubAcceptLanguage('');
    await expect(getLocale()).resolves.toBe('fr');
  });
});
