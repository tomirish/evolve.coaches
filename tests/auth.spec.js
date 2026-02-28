const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/login');

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ── Unauthenticated redirect guards ──────────────────────────────────────────

test('unauthenticated access to catalog.html redirects to index.html', async ({ page }) => {
  await page.goto('/catalog.html');
  await page.waitForURL('**/index.html', { timeout: 10000 });
  await expect(page).toHaveURL(/index\.html/);
});

test('unauthenticated access to upload.html redirects to index.html', async ({ page }) => {
  await page.goto('/upload.html');
  await page.waitForURL('**/index.html', { timeout: 10000 });
  await expect(page).toHaveURL(/index\.html/);
});

test('unauthenticated access to admin.html redirects to index.html', async ({ page }) => {
  await page.goto('/admin.html');
  await page.waitForURL('**/index.html', { timeout: 10000 });
  await expect(page).toHaveURL(/index\.html/);
});

// ── Login form behaviour ──────────────────────────────────────────────────────

test('bad credentials shows error message', async ({ page }) => {
  await page.goto('/index.html');
  await page.fill('#email', 'nobody@example.com');
  await page.fill('#password', 'wrongpassword');
  await page.click('#login-btn');
  await expect(page.locator('#error-msg')).toBeVisible({ timeout: 10000 });
});

test('valid credentials land on catalog.html', async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/catalog\.html/);
});

// ── Already-logged-in redirect ────────────────────────────────────────────────

test('already logged in visiting index.html redirects to catalog.html', async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto('/index.html');
  await page.waitForURL('**/catalog.html', { timeout: 10000 });
  await expect(page).toHaveURL(/catalog\.html/);
});
