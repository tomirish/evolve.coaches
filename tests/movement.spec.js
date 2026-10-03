const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/login');
const { setupMovementFixture, teardownMovementFixture, setupImageMovementFixture, teardownImageMovementFixture, setupLinkMovementFixture, teardownLinkMovementFixture } = require('./helpers/fixtures');

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
    await page.route('**/functions/v1/r2-signed-url', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedUrl: 'http://localhost:8080/img/logo.png' }) })
    );
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
    await page.route('**/functions/v1/r2-signed-url', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedUrl: 'http://localhost:8080/img/logo.png' }) })
    );
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${imageFixture.id}`);

    await expect(page.locator('img.video-player')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('video.video-player')).toHaveCount(0);
  });

  test('image movement edit button shows the edit form', async ({ page }) => {
    await page.route('**/functions/v1/r2-signed-url', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedUrl: 'http://localhost:8080/img/logo.png' }) })
    );
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${imageFixture.id}`);

    await expect(page.locator('#edit-btn')).toBeVisible({ timeout: 20000 });
    await page.locator('#edit-btn').click();
    await expect(page.locator('#edit-form')).toBeVisible();
  });

  test('image movement edit mode shows Replace File heading', async ({ page }) => {
    await page.route('**/functions/v1/r2-signed-url', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedUrl: 'http://localhost:8080/img/logo.png' }) })
    );
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${imageFixture.id}`);

    await expect(page.locator('#edit-btn')).toBeVisible({ timeout: 20000 });
    await page.locator('#edit-btn').click();

    await expect(page.locator('.admin-section-title')).toHaveText('Replace File', { timeout: 10000 });
    await expect(page.locator('#replace-btn')).toHaveText('Replace File');
    await expect(page.locator('#replace-label')).toContainText('replacement file');
  });
});

// Keep third-party players off the network in tests.
async function stubEmbeds(page) {
  await page.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
  await page.route('https://www.instagram.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
}

test.describe('Movement detail page — pasted link', () => {
  let linkFixture;
  test.beforeAll(async () => { linkFixture = await setupLinkMovementFixture(COACH_EMAIL, COACH_PASSWORD); });
  test.afterAll(async () => { await teardownLinkMovementFixture(linkFixture?.client, linkFixture?.id); });

  test('link-only movement plays the YouTube embed', async ({ page }) => {
    await stubEmbeds(page);
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${linkFixture.id}`);
    const frame = page.locator('.embed-frame iframe');
    await expect(frame).toBeVisible({ timeout: 20000 });
    await expect(frame).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/4taYjKlmihU\?/);
    await expect(page.locator('video.video-player')).toHaveCount(0);
  });

  test('credit line names the creator and links to the original', async ({ page }) => {
    await stubEmbeds(page);
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${linkFixture.id}`);
    const credit = page.locator('.source-credit a');
    await expect(credit).toHaveText("From Pierre's Elite Performance on YouTube ↗");
    await expect(credit).toHaveAttribute('href', 'https://www.youtube.com/watch?v=4taYjKlmihU');
    await expect(credit).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

test.describe('Movement detail page — copied link', () => {
  let doneFixture;
  test.beforeAll(async () => {
    doneFixture = await setupLinkMovementFixture(COACH_EMAIL, COACH_PASSWORD, {
      video_path: '00000000-0000-0000-0000-000000000003.mp4', download_status: 'done', source_author: null,
    });
  });
  test.afterAll(async () => { await teardownLinkMovementFixture(doneFixture?.client, doneFixture?.id); });

  test('a copied link plays from R2 and keeps a credit line', async ({ page }) => {
    await page.route('**/functions/v1/r2-signed-url', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedUrl: 'http://localhost:8080/img/logo.png' }) }));
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${doneFixture.id}`);
    await expect(page.locator('video.video-player')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.embed-frame')).toHaveCount(0);
    await expect(page.locator('.source-credit a')).toHaveText('From YouTube ↗');
  });
});

test.describe('Movement detail page — a part of a link', () => {
  let partFixture;
  test.beforeAll(async () => {
    partFixture = await setupLinkMovementFixture(COACH_EMAIL, COACH_PASSWORD, { clip_start: 69, clip_end: 99 });
  });
  test.afterAll(async () => { await teardownLinkMovementFixture(partFixture?.client, partFixture?.id); });

  test('the embed plays just the part, and the credit opens at its start', async ({ page }) => {
    await stubEmbeds(page);
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${partFixture.id}`);
    await expect(page.locator('.embed-frame iframe')).toHaveAttribute('src', /&start=69&end=99$/);
    await expect(page.locator('.source-credit a')).toHaveAttribute('href', 'https://www.youtube.com/watch?v=4taYjKlmihU&t=69s');
  });
});

test('a movement whose link cannot be parsed shows the no-media error', async ({ page }) => {
  // The CHECK constraint makes this row impossible to insert, so stub the read.
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await page.route('**/rest/v1/movements**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 'x', name: 'Broken', tags: [], alt_names: [], comments: null,
      video_path: null, source_url: 'https://evil.example/x', download_status: 'link_only', uploaded_by: null }),
  }));
  await page.goto('/movement.html?id=00000000-0000-0000-0000-00000000000f');
  await expect(page.locator('.status-msg.error')).toHaveText('Movement has no media file.');
  await expect(page.locator('iframe')).toHaveCount(0);
});
