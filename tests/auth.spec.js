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

// ── reset.html — no hash (Forgot Password flow) ───────────────────────────────

test('reset.html with no hash shows the email request form', async ({ page }) => {
  await page.goto('/reset.html');
  await expect(page.locator('#reset-form')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#reset-btn')).toBeVisible();
});

// ── reset.html — expired / invalid token ─────────────────────────────────────
// Simulates what coaches hit: an invite link that expired overnight.
// A fake hash causes Supabase to fail silently — no auth event fires —
// so the 8-second fallback kicks in and shows the expired-link message.

test('reset.html with invalid hash shows expired-link message after timeout', async ({ page }) => {
  test.setTimeout(20000);
  await page.goto('/reset.html#access_token=invalid_token_simulating_expiry&type=invite');
  await expect(page.locator('text=Your link has expired')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#request-new-link-btn')).toBeVisible();
});

test('expired-link "Request a New Link" button shows email form', async ({ page }) => {
  test.setTimeout(20000);
  await page.goto('/reset.html#access_token=invalid_token_simulating_expiry&type=invite');
  await page.locator('#request-new-link-btn').waitFor({ timeout: 15000 });
  await page.click('#request-new-link-btn');
  await expect(page.locator('#reset-form')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#email')).toBeVisible();
});
