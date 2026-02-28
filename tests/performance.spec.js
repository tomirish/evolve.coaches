const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/login');

const COACH_EMAIL    = process.env.COACH_EMAIL;
const COACH_PASSWORD = process.env.COACH_PASSWORD;

// Threshold to tighten as we improve performance
const LOAD_TIME_THRESHOLD_MS = 6000;
const RUNS = 3;

test('movement page video load time is acceptable', async ({ page }) => {
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await page.goto('/catalog.html');
  await page.waitForSelector('.movement-card');

  const times = [];

  for (let i = 0; i < RUNS; i++) {
    await page.locator('.movement-card').first().click();
    await page.waitForURL('**/movement.html**', { timeout: 10000 });

    // Clear sessionStorage so each run hits the edge function fresh
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();

    const start = Date.now();
    await page.waitForSelector('video.video-player', { timeout: LOAD_TIME_THRESHOLD_MS });
    times.push(Date.now() - start);

    await page.goBack();
    await page.waitForSelector('.movement-card');
  }

  const avg = Math.round(times.reduce((a, b) => a + b) / times.length);
  console.log(`Load times: ${times.map(t => t + 'ms').join(', ')} | Avg: ${avg}ms`);

  expect(avg, `Avg load time ${avg}ms exceeded threshold of ${LOAD_TIME_THRESHOLD_MS}ms`).toBeLessThan(LOAD_TIME_THRESHOLD_MS);
});
