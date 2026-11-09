import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, freshUsername, loginAs } from './helpers';

/**
 * TEST-02/03: authentication journeys with the PASSWORD login only (TEST-03 —
 * the suite never touches the OAuth buttons). Covers registration of a fresh
 * account, the demo login, and the generic localized failure message.
 */

test('registers a fresh account, signs in and sees the account page', async ({ page }) => {
  const username = freshUsername();

  await page.goto('/register');
  await page.locator('#callsign-input').fill(username);
  await page.locator('#cipher-input').fill(DEMO_PASSWORD);
  await page.locator('#confirm-cipher-input').fill(DEMO_PASSWORD);
  await page.locator('input[name="accept_oath"]').check();
  await page
    .locator('form[data-purpose="scribe-registration-form"] button[type="submit"]')
    .click();

  // Registration signs in through the login form (the register action itself
  // redirects to /login), then the account page is reachable with the session.
  await expect(page).toHaveURL(/\/login/);
  await loginAs(page, username, DEMO_PASSWORD);

  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1, name: username })).toBeVisible();
  await expect(page.locator('header a[href="/account"]')).toBeVisible();
});

test('logs in with the seeded demo account (password login)', async ({ page }) => {
  await loginAs(page, 'demo', DEMO_PASSWORD);
  // The navbar account link (PersonalAccount) is the signed-in state; there is
  // no logout control on the page, so the session is simply observed.
  await expect(page.locator('header a[href="/account"]')).toBeVisible();
});

test('login failure shows the generic localized error', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#callsign-input').fill('demo');
  await page.locator('#cipher-input').fill('definitely-wrong-password');
  await page
    .locator('form[data-purpose="scribe-login-form"] button[type="submit"]')
    .click();

  // Same message for a wrong username and a wrong password (never reveals
  // whether the account exists) — EN locale is pinned by the config. Scoped
  // to the form: Next.js adds its own route-announcer `role="alert"` region.
  await expect(
    page.locator('form[data-purpose="scribe-login-form"] [role="alert"]'),
  ).toContainText('Incorrect username or password.');
  await expect(page).toHaveURL(/\/login/);
});
