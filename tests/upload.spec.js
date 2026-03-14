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

// A fake video file — enough to trigger the change handler without real decoding.
const FAKE_VIDEO = {
  name: 'test.mp4',
  mimeType: 'video/mp4',
  buffer: Buffer.from('fake'),
};

test.describe('Upload page', () => {

  // ── Structural ────────────────────────────────────────────────────────────

  test('video field appears above movement name field', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');

    const videoY = await page.locator('#video-file').evaluate(el => el.getBoundingClientRect().top);
    const nameY  = await page.locator('#name').evaluate(el => el.getBoundingClientRect().top);
    expect(videoY, 'Video field should be above the name field').toBeLessThan(nameY);
  });

  test('AI hint is visible inside video box before file is selected', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');

    await expect(page.locator('#file-ai-hint')).toBeVisible();
    await expect(page.locator('#file-ai-hint')).toContainText('AI will suggest a name');
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

    // Patch window.extractVideoFrame so the test skips real video decoding.
    // Since upload.js is a non-module script, top-level functions are on window.
    await page.evaluate(() => {
      window.extractVideoFrame = () => Promise.resolve('fake-base64');
    });

    await page.setInputFiles('#video-file', FAKE_VIDEO);

    await expect(page.locator('#name')).toHaveValue('Barbell Back Squat', { timeout: 5000 });
    await expect(page.locator('#name-ocr-hint')).toBeVisible();
    await expect(page.locator('#name-ocr-hint')).toContainText('suggested by AI');
  });

  test('new video selection replaces a previous AI-suggested name', async ({ page }) => {
    await mockVisionName(page, 'Romanian Deadlift');
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');

    await page.evaluate(() => {
      window.extractVideoFrame = () => Promise.resolve('fake-base64');
    });

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

    await page.evaluate(() => {
      window.extractVideoFrame = () => Promise.resolve('fake-base64');
    });

    await page.setInputFiles('#video-file', FAKE_VIDEO);
    await expect(page.locator('#name')).toHaveValue('Barbell Back Squat', { timeout: 5000 });

    await page.fill('#name', 'Romanian Deadlift');

    await expect(page.locator('#name-ocr-hint')).toBeHidden();
  });

  test('AI does not overwrite a manually typed name', async ({ page }) => {
    await mockVisionName(page, 'Barbell Back Squat');
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/upload.html');

    await page.evaluate(() => {
      window.extractVideoFrame = () => Promise.resolve('fake-base64');
    });

    // Coach types a name first
    await page.fill('#name', 'My Custom Movement');

    await page.setInputFiles('#video-file', FAKE_VIDEO);

    // Wait a moment for OCR to complete
    await page.waitForTimeout(1000);

    // AI should not have overwritten the manually typed name
    await expect(page.locator('#name')).toHaveValue('My Custom Movement');
  });

});
