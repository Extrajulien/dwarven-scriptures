'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { isLocale, LOCALE_COOKIE_NAME } from './messages';

/**
 * I18N-02: locale selection server action, wired to the navbar's FR/EN
 * control on every page.
 *
 * Cookie writes are only allowed in a Server Function (Next.js refuses them
 * during render): setting the `locale` cookie here makes Next.js re-render
 * the current page and its layouts so the UI reflects the new value in the
 * same roundtrip. `revalidatePath('/', 'layout')` additionally refreshes the
 * rest of the app on the next navigation, so the choice sticks everywhere.
 *
 * The value is validated against the supported locales (`fr`/`en`) before
 * anything is written — the action never trusts the submitted string.
 */
export async function setLocale(formData: FormData): Promise<void> {
  const raw = formData.get('locale');
  const locale = typeof raw === 'string' ? raw : '';
  if (!isLocale(locale)) {
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE_NAME, locale, {
    path: '/',
    sameSite: 'lax',
    // One year: the choice is conserved between visits (I18N-02).
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath('/', 'layout');
}
