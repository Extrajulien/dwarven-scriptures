/**
 * @jest-environment node
 *
 * I18N-02: `setLocale` writes the `locale` cookie server-side (cookie writes
 * are only allowed in a Server Function) and revalidates the app so the UI
 * re-renders in the new language. Unsupported values are dropped before any
 * write.
 */

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { setLocale } from './locale-actions';

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

const cookiesMock = cookies as jest.Mock;
const revalidatePathMock = revalidatePath as jest.Mock;

type CookieStoreStub = {
  set: jest.Mock;
  get: jest.Mock;
};

function stubStore(): CookieStoreStub {
  const store: CookieStoreStub = { set: jest.fn(), get: jest.fn() };
  cookiesMock.mockResolvedValue(store);
  return store;
}

function formDataWithLocale(locale: string): FormData {
  const data = new FormData();
  data.set('locale', locale);
  return data;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('setLocale (I18N-02)', () => {
  test('writes the locale cookie for a supported locale', async () => {
    const store = stubStore();

    await setLocale(formDataWithLocale('en'));

    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledWith(
      'locale',
      'en',
      expect.objectContaining({
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      }),
    );
  });

  test('accepts fr too', async () => {
    const store = stubStore();

    await setLocale(formDataWithLocale('fr'));

    expect(store.set).toHaveBeenCalledWith('locale', 'fr', expect.any(Object));
  });

  test('revalidates the whole app so the UI re-renders in the new locale', async () => {
    stubStore();

    await setLocale(formDataWithLocale('fr'));

    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
  });

  test('ignores unsupported locale values', async () => {
    const store = stubStore();

    await setLocale(formDataWithLocale('de'));

    expect(store.set).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  test('ignores a missing locale field', async () => {
    const store = stubStore();

    await setLocale(new FormData());

    expect(store.set).not.toHaveBeenCalled();
  });

  test('ignores non-string locale values', async () => {
    const store = stubStore();
    const data = new FormData();
    data.set('locale', 'fr');
    data.append('locale', 'en'); // get() returns the first, but assert robustness

    await setLocale(data);

    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledWith('locale', 'fr', expect.any(Object));
  });
});
