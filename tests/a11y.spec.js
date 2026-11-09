// Accessibility: axe-core (the engine behind Lighthouse's accessibility score)
// on every page, WCAG 2.x A and AA rules. Added 2026-11-07 after a manual
// Lighthouse run found low-contrast teal buttons and an unnamed logo link;
// this keeps them from coming back without a Lighthouse job in the pipeline.
//
// A failure lists each rule with the offending elements. Fix the page — do not
// add the rule to an exclusion list without a written reason here.
const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const { loginAs } = require('./helpers/login');

const COACH_EMAIL    = process.env.COACH_EMAIL;
const COACH_PASSWORD = process.env.COACH_PASSWORD;
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Excluded: the YouTube / Instagram player inside .embed-frame. Its markup is
// the platform's, not ours, and it changes without notice (2026-11-09 CI:
// aria-prohibited-attr on YouTube's #movie_player). axe's exclude also skips
// the iframe element itself, so its title is not checked here.
async function expectNoViolations(page, label) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG)
    .exclude('.embed-frame iframe')
    .analyze();
  const summary = violations.map(v =>
    `${v.id} (${v.impact}): ${v.help}\n` +
    v.nodes.slice(0, 5).map(n => `    ${n.target.join(' ')}`).join('\n'));
  expect(summary, `${label}: accessibility violations`).toEqual([]);
}

// Colour transitions (0.15s) would let axe sample a half-faded colour right
// after the switch, so they are turned off first: the check is on final colours.
async function inTheme(page, theme) {
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
}

test.describe('signed out', () => {
  for (const path of ['/index.html', '/reset.html']) {
    test(`${path} has no WCAG A/AA violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('main, .auth-card').first()).toBeVisible();
      await expectNoViolations(page, path);
    });
  }
});

test.describe('coach', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  });

  for (const theme of ['light', 'dark']) {
    test(`catalog has no WCAG A/AA violations (${theme})`, async ({ page }) => {
      await page.goto('/catalog.html');
      await expect(page.locator('.movement-card').first()).toBeVisible({ timeout: 15000 });
      await inTheme(page, theme);
      await expectNoViolations(page, `catalog (${theme})`);
    });

    test(`movement page has no WCAG A/AA violations (${theme})`, async ({ page }) => {
      await page.goto('/catalog.html');
      // A real movement, never a __test_*__ fixture: movement.spec.js creates
      // and deletes those on the other worker, so the first card could vanish
      // mid-test (2026-11-09 CI: #edit-btn never appeared on the retry).
      const card = page.locator('.movement-card').filter({ hasNotText: '__test' }).first();
      await expect(card).toBeVisible({ timeout: 15000 });
      await card.click();
      await page.waitForURL('**/movement.html**');
      // Not networkidle: a playing video keeps the network busy for good.
      await expect(page.locator('#edit-btn')).toBeVisible({ timeout: 20000 });
      await inTheme(page, theme);
      await expectNoViolations(page, `movement (${theme})`);
    });

    test(`open avatar menu has no WCAG A/AA violations (${theme})`, async ({ page }) => {
      await page.goto('/catalog.html');
      await expect(page.locator('.nav-avatar')).toBeVisible({ timeout: 10000 });
      await inTheme(page, theme);
      await page.locator('.nav-avatar').click();
      await expectNoViolations(page, `avatar menu (${theme})`);
    });
  }

  for (const path of ['/upload.html', '/tags.html', '/account.html']) {
    test(`${path} has no WCAG A/AA violations`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNoViolations(page, path);
    });
  }
});

test.describe('admin', () => {
  test('admin page has no WCAG A/AA violations', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin.html');
    await page.waitForLoadState('networkidle');
    await expectNoViolations(page, 'admin');
  });
});
