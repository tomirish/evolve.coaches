const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/login');

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

// Patch extractVideoFrameWithDataUrl so tests skip real video decoding.
async function mockFrameExtraction(page) {
  await page.evaluate(() => {
    window.extractVideoFrameWithDataUrl = () => Promise.resolve({
      base64: 'fake-base64',
      dataUrl: 'data:image/jpeg;base64,fake',
    });
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

});
