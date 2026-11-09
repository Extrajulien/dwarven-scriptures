/**
 * PERF-01 / Phase 5 delivery: captures the app screenshots committed under
 * `doc/screenshots/` — home (light + dark), the room lobby, the race in
 * progress (progress track + typing zone), the results screen and the
 * account page with the persisted history row.
 *
 * NOT a Playwright spec (`*.spec.ts` are tests): run it once against the
 * local stack with
 *
 *   npx tsx e2e/capture-screenshots.ts
 *
 * It drives the same flows as `race.spec.ts` (bonus-free short config) so
 * the shots are deterministic, then closes the room it opened (SALLE-06).
 */
import { mkdirSync } from 'node:fs';
import { chromium, expect, type Page } from '@playwright/test';
import {
  closeRoomFromResults,
  configureShortRace,
  createRoomAs,
  DEMO_PASSWORD,
  loginAs,
} from './helpers';
// Releases the demo accounts from stale rooms first (SALLE-06), exactly like
// the suite's global setup, so re-running the capture never collides.
import globalSetup from './global-setup';

const SHOTS_DIR = 'doc/screenshots';

async function shoot(page: Page, name: string, fullPage: boolean): Promise<void> {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS_DIR}/${name}.png`, fullPage });
  console.log(`→ ${SHOTS_DIR}/${name}.png`);
}

const BASE_URL = 'http://localhost:3000';

async function main(): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await globalSetup();
  const browser = await chromium.launch();

  // --- home, light then dark (DES-05).
  const homeContext = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US' });
  const homePage = await homeContext.newPage();
  await loginAs(homePage, 'demo', DEMO_PASSWORD);
  await expect(homePage.getByText('RACE CAVERN', { exact: true })).toBeVisible();
  await shoot(homePage, 'home-light', true);
  await homePage.getByRole('button', { name: 'Switch to the dark theme' }).click();
  await expect(homePage.locator('html')).toHaveClass(/dark/);
  await shoot(homePage, 'home-dark', true);
  await homeContext.close();

  // --- lobby: demo hosts a fresh bonus-free room.
  const hostContext = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US' });
  const hostPage = await hostContext.newPage();
  await loginAs(hostPage, 'demo', DEMO_PASSWORD);
  await createRoomAs(hostPage, 5);
  const code = (await hostPage.getByText(/^[A-HJKMNP-Z2-9]{6}$/).innerText()).trim();
  await configureShortRace(hostPage);
  await shoot(hostPage, 'lobby', true);

  // --- race: demo2 joins by code, both see the countdown.
  const racerContext = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US' });
  const racerPage = await racerContext.newPage();
  await loginAs(racerPage, 'demo2', DEMO_PASSWORD);
  await racerPage.goto('/');
  await racerPage.locator('#home-code-input').fill(code);
  await racerPage.locator('form:has(#home-code-input) button[type="submit"]').click();
  await racerPage.waitForURL(/\/rooms\/[0-9a-f-]{36}$/);

  await hostPage.getByRole('button', { name: 'Start the race' }).click();
  await expect(hostPage.locator('[data-testid="countdown-overlay"]')).toBeVisible();
  await expect(racerPage.locator('[data-testid="countdown-overlay"]')).toBeVisible();
  // The shared text is revealed during the countdown (COURSE-03, GAME-1) —
  // read it before EN_COURSE replaces the panel with the typing zone.
  const text = (await racerPage.locator('[data-testid="race-text"]').innerText()).trim();
  await expect(racerPage.locator('[data-testid="typing-input"]')).toBeEnabled();
  const halfway = Math.floor(text.length / 2);

  // In progress: demo2 has typed half the text — track markers + typing zone.
  await racerPage.locator('[data-testid="typing-input"]').focus();
  await racerPage.keyboard.type(text.slice(0, halfway), { delay: 15 });
  await expect(racerPage.locator('[data-testid="typing-input"]')).toBeFocused();
  await shoot(racerPage, 'race-in-progress', true);

  // The host types a couple of characters and quits (COURSE-07) so the room
  // finishes as soon as demo2 completes the text.
  await hostPage.locator('[data-testid="typing-input"]').focus();
  await hostPage.keyboard.type('ab', { delay: 15 });
  await hostPage.getByRole('button', { name: 'Abandon the race' }).click();
  await hostPage
    .locator('[data-testid="quit-confirm"]')
    .getByRole('button', { name: 'Confirm' })
    .click();
  await expect(hostPage.locator('[data-testid="spectator-badge"]')).toBeVisible();

  // demo2 finishes → results on both screens.
  await racerPage.keyboard.type(text.slice(halfway), { delay: 15 });
  await expect(racerPage.locator('[data-testid="results-podium"]')).toBeVisible();
  await expect(racerPage.locator('[data-testid="results-table"]')).toBeVisible();
  await shoot(racerPage, 'results', true);
  await expect(hostPage.locator('[data-testid="results-podium"]')).toBeVisible();

  // HIST-01/02: the finished race shows in demo2's history.
  await racerPage.goto('/account');
  await expect(
    racerPage.locator('[data-testid="history-table"] a[href^="/races/"]').first(),
  ).toBeVisible({ timeout: 15_000 });
  await shoot(racerPage, 'account', true);

  // Free the demo accounts for later suite runs (SALLE-06).
  await closeRoomFromResults(hostPage);

  await racerContext.close();
  await hostContext.close();
  await browser.close();
  console.log('done');
}

main().catch((error: unknown) => {
  console.error('screenshot capture failed', error);
  process.exit(1);
});
