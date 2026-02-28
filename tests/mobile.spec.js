const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/login');

const MOBILE = { width: 390, height: 844 };

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

test.describe('Mobile layout (390px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE);
  });

  // ── Login ──────────────────────────────────────────────────────────────────

  test('login: form visible, no horizontal scroll', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await noHorizontalScroll(page);
  });

  // ── Nav ────────────────────────────────────────────────────────────────────

  test('nav: logo visible, brand text hidden', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await expect(page.locator('.brand-logo')).toBeVisible();
    await expect(page.locator('.brand-name')).toBeHidden();
  });

  test('nav: Catalog, Upload links and avatar all visible', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await expect(page.locator('.nav-links a[href="catalog.html"]')).toBeVisible();
    await expect(page.locator('.nav-links a[href="upload.html"]')).toBeVisible();
    await expect(page.locator('.nav-avatar')).toBeVisible();
  });

  // ── Catalog ────────────────────────────────────────────────────────────────

  test('catalog: cards and search visible, no horizontal scroll', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/catalog.html');
    await page.waitForSelector('.movement-card');
    await expect(page.locator('.movement-card').first()).toBeVisible();
    await expect(page.locator('#search')).toBeVisible();
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

  test('tags page: tag names are readable, no horizontal scroll', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/tags.html');
    // tags.js renders: <li class="admin-list-item"><span>name</span><button>Edit</button></li>
    await page.waitForSelector('#tag-list .admin-list-item');
    const box = await page.locator('#tag-list .admin-list-item > span').first().boundingBox();
    expect(box.width, 'Tag name collapsed to near-zero width').toBeGreaterThan(60);
    await noHorizontalScroll(page);
  });

  // ── Admin — Users tab ──────────────────────────────────────────────────────

  test('admin Users tab: user names are readable, no horizontal scroll', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin.html');
    await page.waitForSelector('#user-list .admin-list-item');
    const box = await page.locator('#user-list .admin-user-name').first().boundingBox();
    expect(box.width, 'User name collapsed to near-zero width').toBeGreaterThan(60);
    await noHorizontalScroll(page);
  });

  // ── Admin — Tags tab ───────────────────────────────────────────────────────

  test('admin Tags tab: tag names are readable, no horizontal scroll', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin.html');
    await page.locator('.admin-tab[data-tab="tags"]').click();
    await page.waitForSelector('#group-list .admin-list-item');
    const box = await page.locator('#group-list .admin-list-item > span').first().boundingBox();
    expect(box.width, 'Tag name collapsed to near-zero width').toBeGreaterThan(60);
    await noHorizontalScroll(page);
  });

  // ── Admin — Videos tab ─────────────────────────────────────────────────────

  test('admin Videos tab: movement names are readable, no horizontal scroll', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin.html');
    await page.locator('.admin-tab[data-tab="videos"]').click();
    await page.waitForSelector('#movement-list .admin-list-item');
    const box = await page.locator('#movement-list .admin-user-name').first().boundingBox();
    expect(box.width, 'Movement name collapsed to near-zero width').toBeGreaterThan(60);
    await noHorizontalScroll(page);
  });
});
