const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/login');
const { setupMovementFixture, teardownMovementFixture, setupImageMovementFixture, teardownImageMovementFixture } = require('./helpers/fixtures');

const COACH_EMAIL    = process.env.COACH_EMAIL;
const COACH_PASSWORD = process.env.COACH_PASSWORD;

let fixture;

test.beforeAll(async () => {
  fixture = await setupMovementFixture(COACH_EMAIL, COACH_PASSWORD);
});

test.afterAll(async () => {
  await teardownMovementFixture(fixture?.client, fixture?.id);
});

test.describe('Movement detail page', () => {
  test.describe.configure({ retries: 2 });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/catalog.html');
    await page.waitForSelector('.movement-card');
    await page.locator('.movement-card').first().click();
    await page.waitForURL('**/movement.html**', { timeout: 10000 });
  });

  test('video player loads', async ({ page }) => {
    await expect(page.locator('video.video-player')).toBeVisible({ timeout: 20000 });
  });

  test('edit button shows the edit form', async ({ page }) => {
    await expect(page.locator('#edit-btn')).toBeVisible({ timeout: 20000 });
    await page.locator('#edit-btn').click();
    await expect(page.locator('#edit-form')).toBeVisible();
    await expect(page.locator('#name')).toBeVisible();
  });
});

let imageFixture;

test.describe('Movement detail page — image', () => {
  test.describe.configure({ retries: 2 });

  test.beforeAll(async () => {
    imageFixture = await setupImageMovementFixture(COACH_EMAIL, COACH_PASSWORD);
  });

  test.afterAll(async () => {
    await teardownImageMovementFixture(imageFixture?.client, imageFixture?.id);
  });

  test('image movement shows img element not video', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${imageFixture.id}`);

    await expect(page.locator('img.video-player')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('video.video-player')).toHaveCount(0);
  });

  test('image movement edit button shows the edit form', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${imageFixture.id}`);

    await expect(page.locator('#edit-btn')).toBeVisible({ timeout: 20000 });
    await page.locator('#edit-btn').click();
    await expect(page.locator('#edit-form')).toBeVisible();
  });
});
