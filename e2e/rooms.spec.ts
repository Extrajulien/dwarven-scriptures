import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, loginAs } from './helpers';

/**
 * TEST-02: room creation and lobby behaviour as `demo` — the home race
 * section, a public room with capacity 5, the lobby room code + host
 * controls, the theme toggle (no page reload, DES-05) and the FR→EN locale
 * toggle (I18N-02). The room is closed at the end so later specs can create
 * fresh rooms for the same account (SALLE-06).
 */

test('home shows the race section with the create card for a signed-in user', async ({ page }) => {
  await loginAs(page, 'demo', DEMO_PASSWORD);
  await expect(page.getByText('RACE CAVERN', { exact: true })).toBeVisible();
  await expect(page.locator('#create-room-capacity')).toBeVisible();
  await expect(page.locator('#home-code-input')).toBeVisible();
});

test('creates a public room, checks the lobby, theme and locale toggles', async ({ page }) => {
  await loginAs(page, 'demo', DEMO_PASSWORD);

  // Create a public room with capacity 5.
  await page.locator('#create-room-capacity').fill('5');
  await page.locator('#create-room-visibility').selectOption('public');
  await page.locator('form:has(#create-room-capacity) button[type="submit"]').click();
  await page.waitForURL(/\/rooms\/[0-9a-f-]{36}$/);

  // Lobby: the 6-character room code and the host-only controls.
  await expect(page.getByText(/^[A-HJKMNP-Z2-9]{6}$/)).toBeVisible();
  await expect(page.getByText('HOST CONTROLS', { exact: true })).toBeVisible();
  await expect(page.getByText('MEMBERS PRESENT', { exact: true })).toBeVisible();

  // DES-05: the theme toggle switches html.dark WITHOUT a page reload — a
  // window-side marker survives the click.
  await page.evaluate(() => {
    (window as unknown as Record<string, boolean>).__e2eAlive = true;
  });
  await page.getByRole('button', { name: 'Switch to the dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(
    await page.evaluate(() =>
      Boolean((window as unknown as Record<string, boolean>).__e2eAlive),
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Switch to the light theme' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);

  // I18N-02: the locale toggle switches visible strings FR -> EN (and back).
  await page.getByRole('button', { name: 'Switch the interface to French' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByText('CAVERNE DE COURSE', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Passer l’interface en anglais' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText('RACE CAVERN', { exact: true })).toBeVisible();

  // Close the room so the demo account is free for the race specs (SALLE-06).
  await page.getByRole('button', { name: 'Close the room' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('ROOM CLOSED', { exact: true })).toBeVisible();
});
