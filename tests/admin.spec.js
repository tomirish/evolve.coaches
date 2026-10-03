const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/login');
const { setupLinkMovementFixture, teardownLinkMovementFixture } = require('./helpers/fixtures');

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const COACH_EMAIL    = process.env.COACH_EMAIL;
const COACH_PASSWORD = process.env.COACH_PASSWORD;

test('coach accessing admin.html is redirected to catalog.html', async ({ page }) => {
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await page.goto('/admin.html');
  await page.waitForURL('**/catalog.html', { timeout: 10000 });
  await expect(page).toHaveURL(/catalog\.html/);
});

test('admin can access admin.html', async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto('/admin.html');
  await expect(page).toHaveURL(/admin\.html/);
  await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
});

test('user list is sorted A-Z with test accounts at the bottom', async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto('/admin.html');
  await page.waitForSelector('#user-list .admin-list-item');
  const names = await page.locator('#user-list .admin-user-name').allTextContents();

  // Regular accounts should be in A-Z order
  const regular = names.filter(n => !n.startsWith('*** DO NOT REMOVE ***'));
  expect(regular).toEqual([...regular].sort((a, b) => a.localeCompare(b)));

  // All test accounts should come after all regular accounts
  const firstTestIndex = names.findIndex(n => n.startsWith('*** DO NOT REMOVE ***'));
  if (firstTestIndex >= 0) {
    const afterFirst = names.slice(firstTestIndex);
    expect(afterFirst.every(n => n.startsWith('*** DO NOT REMOVE ***'))).toBe(true);
  }
});

test('tag search filters the list', async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto('/admin.html');
  await page.locator('.admin-tab[data-tab="tags"]').click();
  await page.waitForSelector('#group-list .admin-list-item');

  // Search for something that won't match any real tag
  await page.fill('#tag-search', 'zzzzzzzzz');
  await expect(page.locator('#group-list')).toContainText('No tags found.');

  // Clearing restores the list
  await page.fill('#tag-search', '');
  await expect(page.locator('#group-list .admin-list-item')).not.toHaveCount(0);
});

test.describe('Videos tab — pasted links', () => {
  let failedFx;
  test.beforeAll(async () => {
    failedFx = await setupLinkMovementFixture(COACH_EMAIL, COACH_PASSWORD, {
      name: '__test_link_failed__', download_status: 'failed', download_attempts: 3, download_error: 'HTTP Error 429',
    });
  });
  test.afterAll(async () => { await teardownLinkMovementFixture(failedFx?.client, failedFx?.id); });

  async function openRow(page) {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin.html');
    await page.locator('.admin-tab[data-tab="videos"]').click();
    await page.fill('#movement-search', '__test_link_failed__');
    return page.locator(`.admin-list-item[data-id="${failedFx.id}"]`);
  }

  test('failed link row shows a Copy failed badge with the reason', async ({ page }) => {
    const row = await openRow(page);
    const badge = row.locator('.download-badge');
    await expect(badge).toHaveText('Copy failed');
    await expect(badge).toHaveAttribute('title', 'HTTP Error 429');
  });

  test('link row thumbnail is the YouTube still and opens the movement page', async ({ page }) => {
    const row = await openRow(page);
    await expect(row.locator('.admin-thumb-link img')).toHaveAttribute('src', 'https://i.ytimg.com/vi/4taYjKlmihU/hqdefault.jpg');
    await expect(row.locator('.admin-thumb-link')).toHaveAttribute('href', `movement.html?id=${failedFx.id}`);
  });

  test('Retry resets the row to pending', async ({ page }) => {
    let patch = null;
    // Intercepted: a real 'pending' write would be picked up by the NAS worker.
    await page.route('**/rest/v1/movements**', async r => {
      if (r.request().method() === 'PATCH') { patch = r.request().postDataJSON(); await r.fulfill({ status: 204, body: '' }); }
      else await r.continue();
    });
    const row = await openRow(page);
    await row.locator('[data-download-action="retry"]').click();
    await expect.poll(() => patch).toEqual({ download_status: 'pending', download_attempts: 0, download_error: null });
  });

  test('Keep as link only stops the alert and the badge changes', async ({ page }) => {
    const row = await openRow(page);
    await row.locator('[data-download-action="link_only"]').click();
    await expect(page.locator(`.admin-list-item[data-id="${failedFx.id}"] .download-badge`)).toHaveText('Link only');
    const { data } = await failedFx.client.from('movements').select('download_status').eq('id', failedFx.id).single();
    expect(data.download_status).toBe('link_only');
    await failedFx.client.from('movements').update({ download_status: 'failed' }).eq('id', failedFx.id); // restore for reruns
  });
});
