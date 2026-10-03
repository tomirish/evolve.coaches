const { test, expect } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const { loginAs } = require('./helpers/login');
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('./helpers/config');

const COACH_EMAIL    = process.env.COACH_EMAIL;
const COACH_PASSWORD = process.env.COACH_PASSWORD;

const LIGHT_BG = 'rgb(249, 250, 251)';

// The theme lives on the shared test coach's profile — run these in order
test.describe.configure({ mode: 'serial' });

let coach;
let coachId;

test.beforeAll(async () => {
  coach = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await coach.auth.signInWithPassword({ email: COACH_EMAIL, password: COACH_PASSWORD });
  ({ data: { user: { id: coachId } } } = await coach.auth.getUser());
});

test.afterEach(async () => {
  await coach.from('profiles').update({ theme: 'light' }).eq('id', coachId);
});

const bodyBg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

async function openMenu(page) {
  await page.locator('.nav-avatar').click();
  await expect(page.locator('.nav-user-menu')).toBeVisible();
}

test('light mode is the default', async ({ page }) => {
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await openMenu(page);
  await expect(page.locator('.nav-theme-toggle')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  expect(await bodyBg(page)).toBe(LIGHT_BG);
});

test('Dark mode switch turns the page dark and keeps the menu open', async ({ page }) => {
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await openMenu(page);
  await page.locator('.nav-theme-toggle').click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.nav-theme-toggle')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.nav-user-menu')).toBeVisible();
  expect(await bodyBg(page)).not.toBe(LIGHT_BG);
});

test('dark mode is saved to the profile and follows the coach to a new browser', async ({ page, browser }) => {
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await openMenu(page);
  await page.locator('.nav-theme-toggle').click();

  await expect.poll(async () => {
    const { data } = await coach.from('profiles').select('theme').eq('id', coachId).single();
    return data.theme;
  }).toBe('dark');

  // Same browser, another page: applied from the local copy
  await page.goto('/account.html');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // A fresh browser has no local copy — it comes from the profile
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await loginAs(otherPage, COACH_EMAIL, COACH_PASSWORD);
  await expect(otherPage.locator('html')).toHaveAttribute('data-theme', 'dark');
  await other.close();
});

test('switching it off returns to light', async ({ page }) => {
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await openMenu(page);
  await page.locator('.nav-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.locator('.nav-theme-toggle').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  expect(await bodyBg(page)).toBe(LIGHT_BG);
});

test('signing out forgets the local copy', async ({ page }) => {
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await openMenu(page);
  await page.locator('.nav-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.locator('.nav-user-signout').click();
  await page.waitForURL('**/index.html');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
});
