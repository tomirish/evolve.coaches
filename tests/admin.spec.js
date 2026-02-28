const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/login');

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const COACH_EMAIL    = process.env.COACH_EMAIL;
const COACH_PASSWORD = process.env.COACH_PASSWORD;

test('coach accessing admin.html is redirected to catalog.html', async ({ page }) => {
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await page.goto('/admin.html');
  await page.waitForURL('**/catalog.html', { timeout: 10000 });
  await expect(page).toHaveURL(/catalog\.html/);
});

test('admin can access admin.html', async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto('/admin.html');
  // Confirm we are still on admin.html (no redirect)
  await expect(page).toHaveURL(/admin\.html/);
  // Page heading should be present
  await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
});
