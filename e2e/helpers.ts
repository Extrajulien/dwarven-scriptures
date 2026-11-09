import { expect, type Browser, type Page } from '@playwright/test';

/**
 * Shared E2E helpers (TEST-02): password login only (TEST-03), room creation
 * with a deterministic race configuration (short English random text, bonuses
 * off), and the two-human race run used by `race.spec.ts` and `history.spec.ts`.
 */

/** Demo accounts seeded by `npm run db:seed` (TECH-04). */
export const DEMO_PASSWORD = 'demo-password-123';

/** A fresh, unique username (≤ 32 chars) so repeated runs never collide. */
export function freshUsername(): string {
  return `e2e${Date.now().toString(36)}`;
}

/** Password login (TEST-03): the suite never goes through OAuth. */
export async function loginAs(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#callsign-input').fill(username);
  await page.locator('#cipher-input').fill(password);
  await page
    .locator('form[data-purpose="scribe-login-form"] button[type="submit"]')
    .click();
  await expect(page).toHaveURL('/');
}

/** Creates a public room with the given capacity and waits for the lobby. */
export async function createRoomAs(page: Page, capacity: number): Promise<void> {
  await page.locator('#create-room-capacity').fill(String(capacity));
  await page.locator('form:has(#create-room-capacity) button[type="submit"]').click();
  await page.waitForURL(/\/rooms\/[0-9a-f-]{36}$/);
}

/**
 * Opens the host config editor and pins a deterministic race: English random
 * text, 10 words, no punctuation/numbers/capitals and bonuses OFF — the specs
 * never rely on the seeded bonus random stream.
 */
export async function configureShortRace(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Edit configuration' }).click();
  await page.locator('#config-text-language').selectOption('en');
  await page.locator('#config-text-type').selectOption('random');
  await page.locator('#config-word-count').fill('10');
  await page.locator('#config-option-punctuation').uncheck();
  await page.locator('#config-option-numbers').uncheck();
  await page.locator('#config-option-capitals').uncheck();
  await page.locator('#config-bonuses').uncheck();
  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect(page.getByText('Configuration saved')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
}

/**
 * Full two-human race: `demo` hosts a public room, `demo2` joins by code, both
 * see the same text, `demo2` types it to completion while the host types a few
 * characters and quits — the race then finishes and both contexts show the
 * results screen. Returns the pages and the shared race text.
 */
export async function runDemoRace(
  browser: Browser,
): Promise<{ hostPage: Page; racerPage: Page; text: string }> {
  const hostContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const racerContext = await browser.newContext();
  const racerPage = await racerContext.newPage();

  await loginAs(hostPage, 'demo', DEMO_PASSWORD);
  await loginAs(racerPage, 'demo2', DEMO_PASSWORD);

  // demo creates a public room and pins the deterministic config.
  await createRoomAs(hostPage, 5);
  const code = (await hostPage.getByText(/^[A-HJKMNP-Z2-9]{6}$/).innerText()).trim();
  await configureShortRace(hostPage);

  // demo2 joins by code from the home page (JOIN-01).
  await racerPage.goto('/');
  await racerPage.locator('#home-code-input').fill(code);
  await racerPage
    .locator('form:has(#home-code-input) button[type="submit"]')
    .click();
  await racerPage.waitForURL(/\/rooms\/[0-9a-f-]{36}$/);

  // Both see each other in the live member list (the host's row carries the
  // HOST role tag, so the two rows stay unambiguous per context).
  await expect(hostPage.locator('li', { hasText: 'demo2' })).toBeVisible();
  await expect(racerPage.locator('li', { hasText: 'host' })).toBeVisible();

  // Host starts: both contexts see the countdown, then the SAME text.
  await hostPage.getByRole('button', { name: 'Start the race' }).click();
  await expect(hostPage.locator('[data-testid="countdown-overlay"]')).toBeVisible();
  await expect(racerPage.locator('[data-testid="countdown-overlay"]')).toBeVisible();
  const hostText = (await hostPage.locator('[data-testid="race-text"]').innerText()).trim();
  const racerText = (await racerPage.locator('[data-testid="race-text"]').innerText()).trim();
  expect(hostText).toBe(racerText);
  expect(hostText.length).toBeGreaterThan(0);
  const text = hostText;

  // EN_COURSE: the accessible hidden input becomes enabled (the typing-zone
  // label is `race.typingInputLabel`; A11Y-03 also covers it in the a11y spec).
  await expect(hostPage.locator('[data-testid="typing-input"]')).toBeEnabled();
  await expect(racerPage.locator('[data-testid="typing-input"]')).toBeEnabled();

  // demo2 types the whole text; the host types a few characters and quits
  // (COURSE-07) so the race finishes when all humans are done.
  await racerPage.locator('[data-testid="typing-input"]').focus();
  await racerPage.keyboard.type(text, { delay: 15 });
  await hostPage.locator('[data-testid="typing-input"]').focus();
  await hostPage.keyboard.type(text.slice(0, 5), { delay: 15 });
  await hostPage.getByRole('button', { name: 'Abandon the race' }).click();
  await hostPage
    .locator('[data-testid="quit-confirm"]')
    .getByRole('button', { name: 'Confirm' })
    .click();

  // Both contexts reach the results screen (podium + table).
  await expect(racerPage.locator('[data-testid="results-podium"]')).toBeVisible();
  await expect(hostPage.locator('[data-testid="results-podium"]')).toBeVisible();

  return { hostPage, racerPage, text };
}

/**
 * Opens the given page's account history and follows the newest replay link
 * to `/races/[publicId]` (HIST-01/02). Persistence is fire-and-forget after
 * `raceFinished`, so the lookup polls until the row is written.
 */
export async function expectReplayInHistory(page: Page, text: string): Promise<void> {
  await expect(async () => {
    await page.goto('/account');
    await expect(
      page.locator('[data-testid="history-table"] a[href^="/races/"]').first(),
    ).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  const href = await page
    .locator('[data-testid="history-table"] a[href^="/races/"]')
    .first()
    .getAttribute('href');
  if (href === null) {
    throw new Error('expected a replay link in the race history');
  }

  await page.goto(href);
  await expect(page.locator('[data-testid="results-podium"]')).toBeVisible();
  await expect(page.getByText(text.slice(0, 24), { exact: false })).toBeVisible();
}

/**
 * Closes the room from the host's results screen (COURSE-11) so the next spec
 * can create a fresh room for the same demo accounts (SALLE-06: one active
 * room per person).
 */
export async function closeRoomFromResults(page: Page): Promise<void> {
  await page
    .locator('[data-testid="results-controls"]')
    .getByRole('button', { name: 'Close the room' })
    .click();
  await page
    .locator('[data-testid="results-controls"]')
    .getByRole('button', { name: 'Confirm' })
    .click();
  await expect(page.getByText('ROOM CLOSED', { exact: true })).toBeVisible();
}
