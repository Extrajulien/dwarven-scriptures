import { expect, test } from '@playwright/test';
import {
  closeRoomFromResults,
  expectReplayInHistory,
  runDemoRace,
} from './helpers';

/**
 * TEST-02: the full race journey with two browser contexts — `demo` hosts,
 * `demo2` joins by code from the home page. Both see the countdown and the
 * SAME text; `demo2` types the whole text through the accessible typing-zone
 * input, the host types a few characters and quits via the quit button; the
 * results screen (podium + table) then appears for both, and the persisted
 * replay is reachable from `demo2`'s history (HIST-01/02).
 */

test('join by code, race to the finish and reach the replay from history', async ({ browser }) => {
  const { hostPage, racerPage, text } = await runDemoRace(browser);

  // Results screen: podium + table with the local racer's stats.
  await expect(racerPage.locator('[data-testid="results-podium-place"]').first()).toBeVisible();
  await expect(racerPage.locator('[data-testid="results-table"]')).toBeVisible();
  await expect(racerPage.locator('[data-testid="results-table"]')).toContainText('demo2');
  // The non-host racer keeps the "stay" control (COURSE-11).
  await expect(
    racerPage.locator('[data-testid="results-controls"]').getByRole('button', { name: 'Stay' }),
  ).toBeVisible();

  // The host closes the room from the results screen (COURSE-11), freeing the
  // demo accounts for the next spec (SALLE-06).
  await closeRoomFromResults(hostPage);

  // The finished race is persisted and replayable from demo2's history.
  await expectReplayInHistory(racerPage, text);
});
