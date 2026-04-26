const { test, expect } = require('@playwright/test');

const ALL_PAGES = [
  '/index.html',
  '/catalog.html',
  '/movement.html',
  '/upload.html',
  '/account.html',
  '/admin.html',
  '/tags.html',
  '/reset.html',
];

test.describe('PWA', () => {
  test('manifest.json is reachable and valid', async ({ request }) => {
    const res = await request.get('/manifest.json');
    expect(res.status()).toBe(200);

    const manifest = await res.json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBeTruthy();
    // Must be relative so it works under any GitHub Pages subdirectory path
    expect(manifest.start_url).not.toMatch(/^\//);
    expect(manifest.icons?.length).toBeGreaterThan(0);
  });

  for (const path of ALL_PAGES) {
    test(`${path} has PWA meta tags and manifest link`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      const html = await res.text();

      expect(html).toContain('name="apple-mobile-web-app-capable"');
      expect(html).toContain('rel="manifest"');
    });
  }
});
