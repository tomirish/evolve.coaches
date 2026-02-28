const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/login');

const COACH_EMAIL    = process.env.COACH_EMAIL;
const COACH_PASSWORD = process.env.COACH_PASSWORD;

test.beforeEach(async ({ page }) => {
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
});

test('nav avatar is visible after login', async ({ page }) => {
  await expect(page.locator('.nav-avatar')).toBeVisible({ timeout: 10000 });
});

test('clicking avatar opens the user dropdown', async ({ page }) => {
  await page.locator('.nav-avatar').click();
  const menu = page.locator('.nav-user-menu');
  await expect(menu).not.toHaveClass(/hidden/);
});

test('clicking outside the dropdown closes it', async ({ page }) => {
  await page.locator('.nav-avatar').click();
  // Click somewhere neutral — the page heading / brand link area
  await page.locator('.brand').click();
  const menu = page.locator('.nav-user-menu');
  await expect(menu).toHaveClass(/hidden/);
});

test('sign out button redirects to login page', async ({ page }) => {
  await page.locator('.nav-avatar').click();
  await page.locator('.nav-user-signout').click();
  await page.waitForURL('**/index.html', { timeout: 10000 });
  await expect(page).toHaveURL(/index\.html/);
});
