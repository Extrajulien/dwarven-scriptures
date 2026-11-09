import { defineConfig, devices } from '@playwright/test';

/**
 * TEST-02/03: Playwright end-to-end suite against the LOCAL dev server.
 *
 * The `webServer` is deliberately NOT managed by Playwright: the app runs on
 * a custom server (`npm run dev` = `tsx server.ts` — Next.js + WebSocket on a
 * single process, ADR-010) that needs a seeded PostgreSQL behind it. Start the
 * stack manually before running the suite:
 *
 *   npm run db:docker     # local PostgreSQL 16 on 5432
 *   npm run db:migrate    # apply pending migrations
 *   npm run db:seed       # demo / demo2 / demo3 (password demo-password-123)
 *   npm run dev           # http://localhost:3000 (ws on /ws)
 *   npm run test:e2e
 *
 * The specs assume the server is already running on port 3000. Chromium only;
 * `fullyParallel: false` with a single worker because the specs share room and
 * race-history state in the same seeded database (TEST-03 uses the password
 * login, never OAuth — see `e2e/auth.spec.ts`). A `globalSetup` hook releases
 * the demo accounts from any stale room before the run (see
 * `e2e/global-setup.ts`).
 *
 * CI decision: E2E is NOT wired into `.github/workflows/ci.yml` — it needs the
 * PostgreSQL container, the custom server orchestration and a seeded database,
 * while CI keeps running lint / typecheck / unit tests only (TECH-09). The
 * suite is local-only for now; see the TEST-02 line in doc/EXIGENCES.md.
 */
export default defineConfig({
  testDir: './e2e',
  // Releases the seeded demo accounts from any stale room a previous run left
  // open (SALLE-06), so the room/history/race specs can always create fresh
  // rooms. See e2e/global-setup.ts.
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'en-US',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
