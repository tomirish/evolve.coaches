const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/login');

const DESKTOP = { width: 1280, height: 800 };

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const COACH_EMAIL    = process.env.COACH_EMAIL;
const COACH_PASSWORD = process.env.COACH_PASSWORD;

async function noHorizontalScroll(page) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasOverflow, 'Page has unexpected horizontal scroll').toBe(false);
}

// Check that two elements are roughly side by side (row layout), not stacked.
async function isInRowWith(nameEl, actionsEl) {
  const nameBox    = await nameEl.boundingBox();
  const actionsBox = await actionsEl.boundingBox();
  // Actions should not be more than one line-height below the name.
  // If stacked they'd be 50+ px lower; allow 30px tolerance for alignment differences.
  return Math.abs(actionsBox.y - nameBox.y) < 30;
}

test.describe('Desktop layout (1280px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
  });

  // ── Nav ────────────────────────────────────────────────────────────────────

  test('nav: brand name and logo both visible', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await expect(page.locator('.brand-logo')).toBeVisible();
    await expect(page.locator('.brand-name')).toBeVisible();
  });

  test('nav: links and avatar visible', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await expect(page.locator('.nav-links a[href="catalog.html"]')).toBeVisible();
    await expect(page.locator('.nav-links a[href="upload.html"]')).toBeVisible();
    await expect(page.locator('.nav-avatar')).toBeVisible();
  });

  // ── Login ──────────────────────────────────────────────────────────────────

  test('login: form visible, no horizontal scroll', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await noHorizontalScroll(page);
  });

  // ── Catalog ────────────────────────────────────────────────────────────────

  test('catalog: cards and controls visible, no horizontal scroll', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/catalog.html');
    await page.waitForSelector('.movement-card');
    await expect(page.locator('.movement-card').first()).toBeVisible();
    await expect(page.locator('#search')).toBeVisible();
    await expect(page.locator('#sort-btn')).toBeVisible();
    await noHorizontalScroll(page);
  });

  // ── Upload ─────────────────────────────────────────────────────────────────

  test('upload: form fields visible, no horizontal scroll', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');
    await expect(page.locator('#name')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#submit-btn')).toBeVisible();
    await noHorizontalScroll(page);
  });

  // ── Tags page ──────────────────────────────────────────────────────────────

  test('tags page: tag names and Edit buttons in a row, no horizontal scroll', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/tags.html');
    await page.waitForSelector('#tag-list .admin-list-item');
    const firstItem = page.locator('#tag-list .admin-list-item').first();
    const nameEl    = firstItem.locator('> span');
    const actionEl  = firstItem.locator('.btn-edit-tag');
    expect(await isInRowWith(nameEl, actionEl), 'Tag name and Edit button should be side by side').toBe(true);
    await noHorizontalScroll(page);
  });

  // ── Admin — Users tab ──────────────────────────────────────────────────────

  test('admin Users tab: name and actions in a row, no horizontal scroll', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin.html');
    await page.waitForSelector('#user-list .admin-list-item');
    const firstItem = page.locator('#user-list .admin-list-item').first();
    const nameEl    = firstItem.locator('.admin-user-name');
    const actionEl  = firstItem.locator('.admin-user-actions');
    expect(await isInRowWith(nameEl, actionEl), 'User name and actions should be side by side').toBe(true);
    await noHorizontalScroll(page);
  });

  // ── Admin — Tags tab ───────────────────────────────────────────────────────

  test('admin Tags tab: tag name and actions in a row, no horizontal scroll', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin.html');
    await page.locator('.admin-tab[data-tab="tags"]').click();
    await page.waitForSelector('#group-list .admin-list-item');
    const firstItem = page.locator('#group-list .admin-list-item').first();
    const nameEl    = firstItem.locator('span').first();
    const actionEl  = firstItem.locator('.admin-user-actions');
    expect(await isInRowWith(nameEl, actionEl), 'Tag name and actions should be side by side').toBe(true);
    await noHorizontalScroll(page);
  });

  // ── Admin — Videos tab ─────────────────────────────────────────────────────

  test('admin Videos tab: movement name and actions in a row, no horizontal scroll', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin.html');
    await page.locator('.admin-tab[data-tab="videos"]').click();
    await page.waitForSelector('#movement-list .admin-list-item');
    const firstItem = page.locator('#movement-list .admin-list-item').first();
    const nameEl    = firstItem.locator('.admin-user-name');
    const actionEl  = firstItem.locator('.admin-user-actions');
    expect(await isInRowWith(nameEl, actionEl), 'Movement name and actions should be side by side').toBe(true);
    await noHorizontalScroll(page);
  });
});
