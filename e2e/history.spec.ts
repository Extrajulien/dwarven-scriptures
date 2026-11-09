import { expect, test } from '@playwright/test';
import {
  closeRoomFromResults,
  expectReplayInHistory,
  runDemoRace,
} from './helpers';

/**
 * TEST-02: after a finished race, the participating account page lists it in
 * the race history (HIST-01) with a link to the persisted replay page
 * (`/races/[publicId]`, HIST-02). This spec runs its own short race so it
 * stays independent of `race.spec.ts`.
 */

test("the finished race shows in demo's history with a replay link", async ({ browser }) => {
  const { hostPage, text } = await runDemoRace(browser);

  // Free the demo accounts first (SALLE-06): the room is still open in
  // "resultats", so the host closes it from the results screen. The persisted
  // race survives the close (races.roomId is ON DELETE SET NULL).
  await closeRoomFromResults(hostPage);

  // demo (the host, who quit mid-race) still has a persisted history row.
  await expectReplayInHistory(hostPage, text);

  // The replay page lists the race text and the final ranking (RES-01).
  await expect(hostPage.locator('[data-testid="results-table"]')).toBeVisible();
  await expect(hostPage.locator('[data-testid="results-table"]')).toContainText('demo');
});
