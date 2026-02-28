const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/login');

const COACH_EMAIL    = process.env.COACH_EMAIL;
const COACH_PASSWORD = process.env.COACH_PASSWORD;

test.beforeEach(async ({ page }) => {
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
});

test('catalog loads movement cards', async ({ page }) => {
  const cards = page.locator('.movement-card');
  await expect(cards.first()).toBeVisible({ timeout: 15000 });
});

test('search filters the movement list', async ({ page }) => {
  // Wait for cards to load first
  await expect(page.locator('.movement-card').first()).toBeVisible({ timeout: 15000 });
  const totalBefore = await page.locator('.movement-card').count();

  // Type a search term unlikely to match everything
  await page.fill('#search', 'zzz');
  // Either cards are filtered down or a "no results" message appears
  const cardsAfter = await page.locator('.movement-card').count();
  const noResults  = await page.locator('.status-msg').isVisible();
  expect(cardsAfter < totalBefore || noResults).toBeTruthy();
});

test('sort button cycles A–Z → Z–A → Recent', async ({ page }) => {
  const btn = page.locator('#sort-btn');
  await expect(btn).toHaveText('A–Z');

  await btn.click();
  await expect(btn).toHaveText('Z–A');

  await btn.click();
  await expect(btn).toHaveText('Recent');

  await btn.click();
  await expect(btn).toHaveText('A–Z');
});

test('"All" filter pill is active by default', async ({ page }) => {
  const allPill = page.locator('.filter-pill[data-group="All"]');
  await expect(allPill).toHaveClass(/active/);
});
