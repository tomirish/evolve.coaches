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
  await expect(page).toHaveURL(/admin\.html/);
  await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
});

test('user list is sorted A-Z with test accounts at the bottom', async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto('/admin.html');
  await page.waitForSelector('#user-list .admin-list-item');
  const names = await page.locator('#user-list .admin-user-name').allTextContents();

  // Regular accounts should be in A-Z order
  const regular = names.filter(n => !n.startsWith('*** DO NOT REMOVE ***'));
  expect(regular).toEqual([...regular].sort((a, b) => a.localeCompare(b)));

  // All test accounts should come after all regular accounts
  const firstTestIndex = names.findIndex(n => n.startsWith('*** DO NOT REMOVE ***'));
  if (firstTestIndex >= 0) {
    const afterFirst = names.slice(firstTestIndex);
    expect(afterFirst.every(n => n.startsWith('*** DO NOT REMOVE ***'))).toBe(true);
  }
});

test('tag search filters the list', async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto('/admin.html');
  await page.locator('.admin-tab[data-tab="tags"]').click();
  await page.waitForSelector('#group-list .admin-list-item');

  // Search for something that won't match any real tag
  await page.fill('#tag-search', 'zzzzzzzzz');
  await expect(page.locator('#group-list')).toContainText('No tags found.');

  // Clearing restores the list
  await page.fill('#tag-search', '');
  await expect(page.locator('#group-list .admin-list-item')).not.toHaveCount(0);
});
