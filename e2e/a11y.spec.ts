import { expect, test, type Page } from '@playwright/test';
import { DEMO_PASSWORD, createRoomAs, loginAs } from './helpers';

/**
 * A11Y-02/03/04: structural accessibility checks over the four key screens —
 * `/login`, the home page, the room explorer and a live lobby (TEST-02).
 * Checks, per page:
 *
 * - A11Y-03: every `<img>` has a non-empty `alt` (decorative images may be
 *   `aria-hidden` instead) and every visible form field has an accessible
 *   name;
 * - A11Y-02: landmarks (`<main>`, `<header>` and, where the chrome provides
 *   them, `<nav>`/`<footer>`) exist; headings never skip more than one level
 *   and the page has at least one `<h1>`; interactive roles are real
 *   `<button>`/`<a>` elements (no clickable divs);
 * - A11Y-04: a keyboard Tab walk lands on native controls only, every step
 *   matches `:focus-visible` and shows a visible indicator (the global
 *   outline from `globals.css`, or a component `focus:ring`).
 *
 * Contrast (A11Y-01) is computed in `src/theme/contrast.test.ts`; this spec
 * is about document structure and keyboard reachability.
 */

type LandmarkExpectation = { nav: boolean; footer: boolean };

async function expectLandmarks(page: Page, options: LandmarkExpectation): Promise<void> {
  await expect(page.locator('main'), 'a single <main> landmark').toHaveCount(1);
  await expect(page.locator('header').first(), 'a visible <header>').toBeVisible();
  if (options.nav) {
    await expect(page.locator('nav').first(), 'a visible <nav>').toBeVisible();
  }
  if (options.footer) {
    await expect(page.locator('footer'), 'a single <footer> landmark').toHaveCount(1);
  }
}

async function expectImageAlts(page: Page): Promise<void> {
  const images = page.locator('img');
  const count = await images.count();
  expect(count, 'the page has images').toBeGreaterThan(0);
  for (let index = 0; index < count; index++) {
    const image = images.nth(index);
    const ariaHidden = await image.evaluate((element) => element.getAttribute('aria-hidden') === 'true');
    if (ariaHidden) {
      continue; // decorative images may hide themselves from the tree
    }
    const alt = (await image.getAttribute('alt')) ?? '';
    expect(alt.trim().length, `img #${index} has a non-empty alt`).toBeGreaterThan(0);
  }
}

async function expectFormFieldsLabeled(page: Page): Promise<void> {
  const fields = page.locator('input:not([type="hidden"]), select, textarea');
  const count = await fields.count();
  for (let index = 0; index < count; index++) {
    await expect(fields.nth(index), `field #${index} has an accessible name`).toHaveAccessibleName(
      /.+/,
    );
  }
}

async function headingLevels(page: Page): Promise<number[]> {
  return page.$$eval('h1, h2, h3, h4, h5, h6', (elements) =>
    elements.map((element) => Number(element.tagName.slice(1))),
  );
}

function expectOrderedHeadings(levels: number[]): void {
  expect(levels.length, 'the page has headings').toBeGreaterThan(0);
  expect(levels, 'the page has at least one h1').toContain(1);
  for (let index = 1; index < levels.length; index++) {
    const previous = levels[index - 1] ?? 0;
    const current = levels[index] ?? 0;
    expect(current, `heading order h${previous} → h${current} never skips a level`).toBeLessThanOrEqual(
      previous + 1,
    );
  }
}

async function expectActionsAreButtonsOrLinks(page: Page): Promise<void> {
  // Interactive roles must be real controls — a `role="button"` on a div is
  // a keyboard/a11y trap, and links must be anchors.
  await expect(
    page.locator('[role="button"]:not(button):not(a)'),
    'no fake role=button on non-button elements',
  ).toHaveCount(0);
  await expect(page.locator('[role="link"]:not(a)'), 'no fake role=link on non-anchors').toHaveCount(
    0,
  );
  // The pages under test are interactive: they carry real buttons and links.
  await expect(page.locator('button').first()).toBeAttached();
  await expect(page.locator('a[href]').first()).toBeAttached();
}

async function expectKeyboardFocusIndicators(page: Page): Promise<void> {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  });

  let checked = 0;
  for (let step = 0; step < 12 && checked < 6; step++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) {
        return { tag: '', inDevOverlay: false, focusVisible: false, outline: false, boxShadow: false };
      }
      const style = window.getComputedStyle(element);
      return {
        tag: element.tagName,
        inDevOverlay: element.closest('nextjs-portal') !== null,
        focusVisible: element.matches(':focus-visible'),
        outline: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0,
        boxShadow: style.boxShadow !== 'none',
      };
    });
    if (info.inDevOverlay || info.tag === '') {
      continue; // Next dev overlay / no focusable: keep walking
    }
    expect(
      ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'],
      `Tab step ${step} lands on a native control (got <${info.tag}>)`,
    ).toContain(info.tag);
    expect(info.focusVisible, `Tab step ${step} matches :focus-visible`).toBe(true);
    expect(
      info.outline || info.boxShadow,
      `Tab step ${step} shows a visible focus indicator (outline or ring)`,
    ).toBe(true);
    checked += 1;
  }
  expect(checked, 'at least six focusables were walked with a visible indicator').toBe(6);
}

async function expectPageA11y(
  page: Page,
  landmarks: LandmarkExpectation,
): Promise<void> {
  await expectLandmarks(page, landmarks);
  await expectImageAlts(page);
  await expectFormFieldsLabeled(page);
  expectOrderedHeadings(await headingLevels(page));
  await expectActionsAreButtonsOrLinks(page);
  await expectKeyboardFocusIndicators(page);
}

test.describe('A11Y-02/03/04 — document structure and keyboard reachability', () => {
  test('login page', async ({ page }) => {
    await page.goto('/login');
    await expectPageA11y(page, { nav: false, footer: false });
  });

  test('home page (signed in)', async ({ page }) => {
    await loginAs(page, 'demo', DEMO_PASSWORD);
    await expectPageA11y(page, { nav: true, footer: true });
  });

  test('room explorer', async ({ page }) => {
    await page.goto('/rooms');
    await expectPageA11y(page, { nav: true, footer: false });
  });

  test('room lobby', async ({ page }) => {
    await loginAs(page, 'demo', DEMO_PASSWORD);
    await createRoomAs(page, 5);
    // The lobby is live (socket joined): the room code badge is the marker.
    await expect(page.getByText(/^[A-HJKMNP-Z2-9]{6}$/)).toBeVisible();
    await expectPageA11y(page, { nav: true, footer: false });

    // Leave the room clean for the race specs (SALLE-06).
    await page.getByRole('button', { name: 'Close the room' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('ROOM CLOSED', { exact: true })).toBeVisible();
  });
});
