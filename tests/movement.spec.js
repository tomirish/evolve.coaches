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

  test('image movement edit mode shows Replace Video heading', async ({ page }) => {
    await page.route('**/functions/v1/r2-signed-url', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedUrl: 'http://localhost:8080/img/logo.png' }) })
    );
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${imageFixture.id}`);

    await expect(page.locator('#edit-btn')).toBeVisible({ timeout: 20000 });
    await page.locator('#edit-btn').click();

    await expect(page.locator('.admin-section-title')).toHaveText('Replace Video', { timeout: 10000 });
    await expect(page.locator('#replace-btn')).toHaveText('Replace');
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

test.describe('Replace — file and link', () => {
  let fx;
  test.beforeAll(async () => { fx = await setupMovementFixture(COACH_EMAIL, COACH_PASSWORD); });
  test.afterAll(async () => { await teardownMovementFixture(fx?.client, fx?.id); });

  test('replacing a file with a link deletes the old file and saves a pending link', async ({ page }) => {
    const calls = { r2Delete: null, patch: null };
    await page.route('**/functions/v1/r2-signed-url', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedUrl: 'http://localhost:8080/img/logo.png' }) }));
    await page.route('**/functions/v1/r2-delete', async r => {
      calls.r2Delete = r.request().postDataJSON();
      await r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.route('https://www.youtube.com/oembed**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title: 'T', author_name: 'Creator' }) }));
    await page.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '' }));
    // Intercept the PATCH — a real 'pending' write would be picked up by the NAS worker.
    await page.route('**/rest/v1/movements**', async r => {
      if (r.request().method() === 'PATCH') { calls.patch = r.request().postDataJSON(); await r.fulfill({ status: 204, body: '' }); }
      else await r.continue();
    });

    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${fx.id}&edit=1`);
    await page.fill('#replace-link', 'https://youtu.be/4taYjKlmihU?is=x');
    await page.click('#replace-btn');
    await expect(page.locator('#replace-success')).toHaveText('Replaced with the link. A copy will be saved automatically.');

    expect(calls.r2Delete).toMatchObject({ path: '00000000-0000-0000-0000-000000000000.mp4', movementId: fx.id });
    expect(calls.patch).toEqual({
      video_path: null, source_url: 'https://www.youtube.com/watch?v=4taYjKlmihU', source_author: 'Creator',
      clip_start: null, clip_end: null,
      download_status: 'pending', download_attempts: 0, download_error: null,
    });
    await expect(page.locator('.embed-frame iframe')).toBeVisible();
  });

  test('an unsupported replacement link is refused before anything is deleted', async ({ page }) => {
    let deleted = false;
    await page.route('**/functions/v1/r2-signed-url', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedUrl: 'http://localhost:8080/img/logo.png' }) }));
    await page.route('**/functions/v1/r2-delete', async r => { deleted = true; await r.fulfill({ status: 200, body: '{}' }); });
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${fx.id}&edit=1`);
    await page.fill('#replace-link', 'https://vimeo.com/123');
    await page.click('#replace-btn');
    await expect(page.locator('#replace-error')).toHaveText('That link isn’t supported — paste a YouTube or Instagram link.');
    expect(deleted).toBe(false);
  });
});

test.describe('Replace — link with file', () => {
  let linkFx;
  test.beforeAll(async () => { linkFx = await setupLinkMovementFixture(COACH_EMAIL, COACH_PASSWORD); });
  test.afterAll(async () => { await teardownLinkMovementFixture(linkFx?.client, linkFx?.id); });

  test('replacing a link with a file clears the link columns', async ({ page }) => {
    let patch = null;
    await page.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '' }));
    await page.route('**/functions/v1/r2-upload-url', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uploadUrl: 'http://localhost:8080/__upload' }) }));
    await page.route('http://localhost:8080/__upload', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**/functions/v1/r2-signed-url', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedUrl: 'http://localhost:8080/img/logo.png' }) }));
    await page.route('**/rest/v1/movements**', async r => {
      if (r.request().method() === 'PATCH') { patch = r.request().postDataJSON(); await r.fulfill({ status: 204, body: '' }); }
      else await r.continue();
    });
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${linkFx.id}&edit=1`);
    await page.setInputFiles('#replace-file', { name: 'new.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fake') });
    await expect(page.locator('#replace-link')).toHaveValue('');
    await page.click('#replace-btn');
    await expect(page.locator('#replace-success')).toHaveText('File replaced successfully.');
    expect(patch).toMatchObject({
      source_url: null, source_author: null, clip_start: null, clip_end: null,
      download_status: null, download_attempts: 0, download_error: null,
    });
    expect(patch.video_path).toMatch(/^[0-9a-f-]{36}\.mp4$/);
  });

  test('changing the part of a link: the edit page pre-fills it, Replace saves the new part', async ({ page }) => {
    let patch = null;
    await linkFx.client.from('movements').update({ clip_start: 69, clip_end: 99 }).eq('id', linkFx.id);
    await page.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '' }));
    await page.route('https://www.youtube.com/oembed**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title: 'T', author_name: "Pierre's Elite Performance" }) }));
    await page.route('**/rest/v1/movements**', async r => {
      if (r.request().method() === 'PATCH') { patch = r.request().postDataJSON(); await r.fulfill({ status: 204, body: '' }); }
      else await r.continue();
    });
    try {
      await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
      await page.goto(`/movement.html?id=${linkFx.id}&edit=1`);
      await expect(page.locator('#replace-link')).toHaveValue('https://www.youtube.com/watch?v=4taYjKlmihU');
      await expect(page.locator('input[name="clip-mode"][value="part"]')).toBeChecked();
      await expect(page.locator('#clip-start')).toHaveValue('1:09');
      await page.fill('#clip-end', '1:49');
      await page.click('#replace-btn');
      await expect.poll(() => patch).toMatchObject({ clip_start: 69, clip_end: 109, download_status: 'pending' });
    } finally {
      await linkFx.client.from('movements').update({ clip_start: null, clip_end: null }).eq('id', linkFx.id);
    }
  });
});
