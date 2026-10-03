const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/login');
const { setupLinkMovementFixture, teardownLinkMovementFixture } = require('./helpers/fixtures');

const COACH_EMAIL    = process.env.COACH_EMAIL;
const COACH_PASSWORD = process.env.COACH_PASSWORD;

// Intercept the vision-name edge function and return a canned name.
// Also handles the CORS preflight OPTIONS that the browser sends first.
async function mockVisionName(page, name) {
  await page.route('**/functions/v1/vision-name', async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        },
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ name }),
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }
  });
}

// Patch validateFile so tests with fake file buffers don't fail validation.
async function mockValidation(page) {
  await page.evaluate(() => {
    window.validateFile = () => Promise.resolve({ ok: true });
  });
}

// Patch extractVideoFrameWithDataUrl so tests skip real video decoding.
// Also mocks validateFile — fake video buffers can't pass real validation.
async function mockFrameExtraction(page) {
  await page.evaluate(() => {
    window.extractVideoFrameWithDataUrl = () => Promise.resolve({
      base64: 'fake-base64',
      dataUrl: 'data:image/jpeg;base64,fake',
    });
    window.validateFile = () => Promise.resolve({ ok: true });
  });
}

// A fake video file — enough to trigger the change handler without real decoding.
const FAKE_VIDEO = {
  name: 'test.mp4',
  mimeType: 'video/mp4',
  buffer: Buffer.from('fake'),
};

test.describe('Upload page', () => {

  test('isImagePath returns true for image extensions and false for video', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    // Any authenticated page loads auth.js — catalog is simplest
    await page.goto('/catalog.html');

    const results = await page.evaluate(() => ({
      jpg:  window.isImagePath('thumb.jpg'),
      jpeg: window.isImagePath('thumb.jpeg'),
      png:  window.isImagePath('photo.png'),
      gif:  window.isImagePath('anim.gif'),
      webp: window.isImagePath('img.webp'),
      avif: window.isImagePath('img.avif'),
      mp4:  window.isImagePath('clip.mp4'),
      mov:  window.isImagePath('clip.mov'),
      none: window.isImagePath(''),
    }));

    expect(results.jpg).toBe(true);
    expect(results.jpeg).toBe(true);
    expect(results.png).toBe(true);
    expect(results.gif).toBe(true);
    expect(results.webp).toBe(true);
    expect(results.avif).toBe(true);
    expect(results.mp4).toBe(false);
    expect(results.mov).toBe(false);
    expect(results.none).toBe(false);
  });

  // ── Structural ────────────────────────────────────────────────────────────

  test('video field appears above movement name field', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');
    await mockValidation(page);

    // Select a single file to reveal the single-mode form
    await page.setInputFiles('#video-file', FAKE_VIDEO);

    const videoY = await page.locator('#video-file').evaluate(el => el.getBoundingClientRect().top);
    const nameY  = await page.locator('#name').evaluate(el => el.getBoundingClientRect().top);
    expect(videoY, 'Video field should be above the name field').toBeLessThan(nameY);
  });

  test('drop zone hint is visible before file is selected', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');

    await expect(page.locator('#file-ai-hint')).toBeVisible();
    await expect(page.locator('#file-ai-hint')).toContainText('AI will suggest');
  });

  // ── File selection ────────────────────────────────────────────────────────

  test('selecting a file shows filename and hides AI box hint', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');
    await mockValidation(page);

    await page.setInputFiles('#video-file', FAKE_VIDEO);

    await expect(page.locator('#file-label')).toHaveText('test.mp4');
    await expect(page.locator('#file-ai-hint')).toBeHidden();
  });

  // ── OCR name suggestion (mocked — no real API call) ───────────────────────

  test('AI pre-fills movement name after video is selected', async ({ page }) => {
    await mockVisionName(page, 'Barbell Back Squat');
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');

    // Patch extractVideoFrameWithDataUrl so the test skips real video decoding.
    await mockFrameExtraction(page);

    await page.setInputFiles('#video-file', FAKE_VIDEO);

    await expect(page.locator('#name')).toHaveValue('Barbell Back Squat', { timeout: 5000 });
    await expect(page.locator('#name-ocr-hint')).toBeVisible();
    await expect(page.locator('#name-ocr-hint')).toContainText('suggested by AI');
  });

  test('new video selection replaces a previous AI-suggested name', async ({ page }) => {
    await mockVisionName(page, 'Romanian Deadlift');
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');

    await mockFrameExtraction(page);

    // First video
    await page.setInputFiles('#video-file', FAKE_VIDEO);
    await expect(page.locator('#name')).toHaveValue('Romanian Deadlift', { timeout: 5000 });

    // Second video — should replace the AI-suggested name
    await page.setInputFiles('#video-file', { ...FAKE_VIDEO, name: 'test2.mp4' });
    await expect(page.locator('#name')).toHaveValue('Romanian Deadlift', { timeout: 5000 });
  });

  test('typing in name field clears the AI hint', async ({ page }) => {
    await mockVisionName(page, 'Barbell Back Squat');
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');

    await mockFrameExtraction(page);

    await page.setInputFiles('#video-file', FAKE_VIDEO);
    await expect(page.locator('#name')).toHaveValue('Barbell Back Squat', { timeout: 5000 });

    await page.fill('#name', 'Romanian Deadlift');

    await expect(page.locator('#name-ocr-hint')).toBeHidden();
  });

  test('HEIC file is silently converted to JPEG', async ({ page }) => {
    await mockVisionName(page, 'Deadlift');
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');
    await mockValidation(page);

    // Mock heic2any before file selection
    await page.evaluate(() => {
      window.heic2any = ({ blob }) =>
        Promise.resolve(new Blob(['fake-jpeg-data'], { type: 'image/jpeg' }));
    });

    await page.setInputFiles('#video-file', {
      name: 'exercise.heic',
      mimeType: 'image/heic',
      buffer: Buffer.from('fake'),
    });

    // File label should show the converted .jpg name
    await expect(page.locator('#file-label')).toHaveText('exercise.jpg', { timeout: 5000 });
  });

  test('drop zone label mentions photos', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');
    await expect(page.locator('#file-label')).toContainText('photos');
  });

  test('selecting a JPEG shows preview thumbnail without play overlay', async ({ page }) => {
    await mockVisionName(page, 'Push-up');
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');
    await mockValidation(page);

    await page.setInputFiles('#video-file', {
      name: 'exercise.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake'),
    });

    await expect(page.locator('#single-preview')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#single-preview .thumb-play-overlay')).toBeHidden();
  });

  test('AI pre-fills movement name after image is selected', async ({ page }) => {
    await mockVisionName(page, 'Push-up');
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');
    await mockValidation(page);

    await page.setInputFiles('#video-file', {
      name: 'exercise.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake'),
    });

    await expect(page.locator('#name')).toHaveValue('Push-up', { timeout: 5000 });
    await expect(page.locator('#name-ocr-hint')).toContainText('suggested by AI');
  });

  test('AI does not overwrite a manually edited name', async ({ page }) => {
    await mockVisionName(page, 'Barbell Back Squat');
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');

    await mockFrameExtraction(page);

    // Select first video — OCR fills the name
    await page.setInputFiles('#video-file', FAKE_VIDEO);
    await expect(page.locator('#name')).toHaveValue('Barbell Back Squat', { timeout: 5000 });

    // Coach edits the name manually
    await page.fill('#name', 'My Custom Movement');

    // Select a second video — OCR should not overwrite the manually edited name
    await page.setInputFiles('#video-file', { ...FAKE_VIDEO, name: 'test2.mp4' });
    await page.waitForTimeout(1000);

    await expect(page.locator('#name')).toHaveValue('My Custom Movement');
  });

  test('bulk mode accepts a mix of image and video files', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');
    await mockValidation(page);

    await page.setInputFiles('#video-file', [
      { name: 'exercise.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake1') },
      { name: 'clip.mp4',     mimeType: 'video/mp4',  buffer: Buffer.from('fake2') },
    ]);

    // Both rows appear in the queue
    await expect(page.locator('.bulk-row')).toHaveCount(2, { timeout: 10000 });
  });

  test('image row in bulk mode has no play overlay', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');
    await mockValidation(page);

    await page.setInputFiles('#video-file', [
      { name: 'exercise.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake1') },
      { name: 'clip.mp4',     mimeType: 'video/mp4',  buffer: Buffer.from('fake2') },
    ]);

    await expect(page.locator('.bulk-row')).toHaveCount(2, { timeout: 10000 });

    const rows = page.locator('.bulk-row');
    // Image file is passed first, so it's at index 0; video is at index 1
    const imageRow = rows.nth(0);
    const videoRow = rows.nth(1);

    // Image row: no play overlay (or hidden)
    await expect(imageRow.locator('.thumb-play-overlay')).toBeHidden();
    // Video row: play overlay visible
    await expect(videoRow.locator('.thumb-play-overlay')).toBeVisible();
  });

  // ── File validation ───────────────────────────────────────────────────────

  test('corrupt video is rejected with an error message', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');

    await page.setInputFiles('#video-file', {
      name:     'corrupt.mp4',
      mimeType: 'video/mp4',
      buffer:   Buffer.from('this is not a valid video file'),
    });

    await expect(page.locator('#error-msg')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#error-msg')).toContainText('corrupt');
    await expect(page.locator('#submit-btn')).toBeDisabled();
  });

  test('corrupt image is rejected with an error message', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');

    await page.setInputFiles('#video-file', {
      name:     'corrupt.jpg',
      mimeType: 'image/jpeg',
      buffer:   Buffer.from('this is not a valid image file'),
    });

    await expect(page.locator('#error-msg')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#error-msg')).toContainText('corrupt');
    await expect(page.locator('#submit-btn')).toBeDisabled();
  });

  test('corrupt video in bulk mode shows error status on that row', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');

    await page.setInputFiles('#video-file', [
      { name: 'corrupt1.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a valid video') },
      { name: 'corrupt2.mp4', mimeType: 'video/mp4', buffer: Buffer.from('also not valid') },
    ]);

    await expect(page.locator('.bulk-row')).toHaveCount(2, { timeout: 5000 });
    await expect(page.locator('.bulk-status-error').first()).toBeVisible({ timeout: 10000 });
  });

});

const YT_LINK = 'https://youtu.be/4taYjKlmihU?is=YQq_o7bc6RAaqnx7';
const IG_LINK = 'https://www.instagram.com/p/DdFIrIfk0W2/?stkn=MWxrN3ZjaTBreG0xag==';

async function stubLinkServices(page, { oembed = 200 } = {}) {
  await page.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
  await page.route('https://www.instagram.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
  await page.route('https://www.youtube.com/oembed**', r => oembed === 200
    ? r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ title: 'Fast Footwork & Agility Ladder Drills | Speed & Agility Performance', author_name: "Pierre's Elite Performance" }) })
    : r.fulfill({ status: oembed, body: '' }));
}

// Intercept the INSERT so no 'pending' row ever reaches the live database
// (the NAS worker would try to copy it). Returns a getter for the posted body.
async function captureMovementInsert(page) {
  let body = null;
  await page.route('**/rest/v1/movements**', async route => {
    if (route.request().method() === 'POST') {
      body = route.request().postDataJSON();
      await route.fulfill({ status: 201, body: '' });
    } else {
      await route.continue();
    }
  });
  return () => body;
}

test.describe('Upload page — paste a link', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  });

  test('link field is visible under the drop zone', async ({ page }) => {
    await page.goto('/upload.html');
    await expect(page.locator('label[for="video-link"]')).toHaveText('…or paste a YouTube or Instagram link');
  });

  test('pasting a YouTube link shows the embed and suggests a name', async ({ page }) => {
    await stubLinkServices(page);
    await page.goto('/upload.html');
    await page.fill('#video-link', YT_LINK);
    await expect(page.locator('#single-mode')).toBeVisible();
    await expect(page.locator('#single-embed iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/4taYjKlmihU/);
    await expect(page.locator('#name')).toHaveValue('Fast Footwork & Agility Ladder Drills');
    await expect(page.locator('#name-ocr-hint')).toHaveText('Suggested from the YouTube title — edit if needed.');
    await expect(page.locator('#submit-btn')).toHaveText('Save Movement');
  });

  test('pasting an Instagram link leaves the name blank', async ({ page }) => {
    await stubLinkServices(page);
    await page.goto('/upload.html');
    await page.fill('#video-link', IG_LINK);
    await expect(page.locator('#single-embed iframe')).toHaveAttribute('src', 'https://www.instagram.com/p/DdFIrIfk0W2/embed/');
    await expect(page.locator('#name')).toHaveValue('');
  });

  test('an unsupported link shows a friendly error and no form', async ({ page }) => {
    await page.goto('/upload.html');
    await page.fill('#video-link', 'https://www.tiktok.com/@x/video/123');
    await expect(page.locator('#link-error')).toHaveText('That link isn’t supported — paste a YouTube or Instagram link.');
    await expect(page.locator('#single-mode')).toBeHidden();
  });

  test('changing a valid link to an unsupported one returns to the empty state', async ({ page }) => {
    await stubLinkServices(page);
    await page.goto('/upload.html');
    const inserted = await captureMovementInsert(page);
    await page.fill('#video-link', YT_LINK);
    await expect(page.locator('#single-mode')).toBeVisible();
    await page.fill('#video-link', 'https://www.tiktok.com/@x/video/123');
    await expect(page.locator('#link-error')).toHaveText('That link isn’t supported — paste a YouTube or Instagram link.');
    await expect(page.locator('#link-error')).toBeVisible();
    await expect(page.locator('#single-mode')).toBeHidden();
    expect(inserted()).toBeNull();
  });

  test('link input is styled like other inputs', async ({ page }) => {
    await page.goto('/upload.html');
    const s = await page.locator('#video-link').evaluate(e => { const c = getComputedStyle(e); return { w: e.offsetWidth, p: c.paddingLeft, b: c.borderTopWidth }; });
    expect(s.p).toBe('14px');
    expect(s.b).toBe('1px');
    expect(s.w).toBeGreaterThan(200);
  });

  test('saving a link inserts a pending movement with the canonical URL', async ({ page }) => {
    await stubLinkServices(page);
    await page.goto('/upload.html');
    const inserted = await captureMovementInsert(page);
    await page.fill('#video-link', YT_LINK);
    await expect(page.locator('#name')).toHaveValue('Fast Footwork & Agility Ladder Drills');
    await page.click('#submit-btn');
    await page.waitForURL('**/catalog.html');
    expect(inserted()).toMatchObject({
      name: 'Fast Footwork & Agility Ladder Drills',
      video_path: null,
      source_url: 'https://www.youtube.com/watch?v=4taYjKlmihU',
      source_author: "Pierre's Elite Performance",
      clip_start: null,
      clip_end: null,
      download_status: 'pending',
    });
  });

  test('Whole video is the default; choosing a part shows Start/End and its length', async ({ page }) => {
    await stubLinkServices(page);
    await page.goto('/upload.html');
    await page.fill('#video-link', YT_LINK);
    await expect(page.locator('input[name="clip-mode"][value="whole"]')).toBeChecked();
    await expect(page.locator('#clip-times')).toBeHidden();
    await page.check('input[name="clip-mode"][value="part"]');
    await page.fill('#clip-start', '1:09');
    await page.fill('#clip-end', '1:39');
    await expect(page.locator('#clip-note')).toHaveText('30 seconds');
    await expect(page.locator('#single-embed iframe')).toHaveAttribute('src', /&start=69&end=99$/);
  });

  test('saving a part stores clip_start and clip_end', async ({ page }) => {
    await stubLinkServices(page);
    await page.goto('/upload.html');
    const inserted = await captureMovementInsert(page);
    await page.fill('#video-link', YT_LINK);
    await expect(page.locator('#name')).toHaveValue('Fast Footwork & Agility Ladder Drills');
    await page.check('input[name="clip-mode"][value="part"]');
    await page.fill('#clip-start', '1:09');
    await page.fill('#clip-end', '1:39');
    await page.click('#submit-btn');
    await page.waitForURL('**/catalog.html');
    expect(inserted()).toMatchObject({ clip_start: 69, clip_end: 99, download_status: 'pending' });
  });

  test('an invalid part blocks Save with an inline message', async ({ page }) => {
    await stubLinkServices(page);
    await page.goto('/upload.html');
    const inserted = await captureMovementInsert(page);
    await page.fill('#video-link', YT_LINK);
    await page.check('input[name="clip-mode"][value="part"]');
    await page.fill('#clip-start', '1:39');
    await page.fill('#clip-end', '1:09');
    await expect(page.locator('#clip-note')).toHaveText('End must be after Start.');
    await expect(page.locator('#submit-btn')).toBeDisabled();
    expect(inserted()).toBeNull();
  });

  test('a YouTube link with ?t= pre-fills Start but stays on Whole video', async ({ page }) => {
    await stubLinkServices(page);
    await page.goto('/upload.html');
    await page.fill('#video-link', 'https://youtu.be/4taYjKlmihU?t=69');
    await expect(page.locator('input[name="clip-mode"][value="whole"]')).toBeChecked();
    await page.check('input[name="clip-mode"][value="part"]');
    await expect(page.locator('#clip-start')).toHaveValue('1:09');
  });

  test('oEmbed failing never blocks saving', async ({ page }) => {
    await stubLinkServices(page, { oembed: 500 });
    await page.goto('/upload.html');
    const inserted = await captureMovementInsert(page);
    await page.fill('#video-link', YT_LINK);
    await page.fill('#name', 'Ladder Drill');
    await page.click('#submit-btn');
    await page.waitForURL('**/catalog.html');
    expect(inserted()).toMatchObject({ name: 'Ladder Drill', source_author: null, download_status: 'pending' });
  });

  test('choosing a file after a link clears the link', async ({ page }) => {
    await stubLinkServices(page);
    await page.goto('/upload.html');
    await page.fill('#video-link', YT_LINK);
    await expect(page.locator('#single-embed iframe')).toBeVisible();
    await mockFrameExtraction(page);
    await mockVisionName(page, 'Goblet Squat');
    await page.setInputFiles('#video-file', FAKE_VIDEO);
    await expect(page.locator('#video-link')).toHaveValue('');
    await expect(page.locator('#single-embed')).toBeHidden();
    await expect(page.locator('#submit-btn')).toHaveText('Upload Movement');
  });

  test('a slow AI name for a dropped file cannot overwrite a link pasted meanwhile', async ({ page }) => {
    await stubLinkServices(page);
    let release;
    const gate = new Promise(r => { release = r; });
    await page.route('**/functions/v1/vision-name', async route => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 200, headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
        return;
      }
      await gate;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ name: 'Slow AI Name' }), headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await page.goto('/upload.html');
    await mockFrameExtraction(page);
    await page.setInputFiles('#video-file', FAKE_VIDEO);
    await expect(page.locator('#name-ocr-hint')).toHaveText('Detecting movement name…');
    await page.fill('#video-link', YT_LINK);
    await expect(page.locator('#name')).toHaveValue('Fast Footwork & Agility Ladder Drills');
    release();
    await page.waitForTimeout(500);
    await expect(page.locator('#single-preview')).toBeHidden();
    await expect(page.locator('#submit-btn')).toHaveText('Save Movement');
    await expect(page.locator('#name')).toHaveValue('Fast Footwork & Agility Ladder Drills');
  });

  test('a link already in the library shows a duplicate warning', async ({ page }) => {
    const fx = await setupLinkMovementFixture(COACH_EMAIL, COACH_PASSWORD);
    try {
      await stubLinkServices(page);
      await page.goto('/upload.html');
      await page.fill('#video-link', YT_LINK);
      await expect(page.locator('#link-warning')).toHaveText('This link is already saved as "__test_link_fixture__" — check the catalog before saving.');
    } finally {
      await teardownLinkMovementFixture(fx.client, fx.id);
    }
  });
});
