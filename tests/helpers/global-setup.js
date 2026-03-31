/**
 * Playwright global setup — logs in once per user type and saves storageState.
 * Runs before any tests. The web server is already up at this point.
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const AUTH_DIR  = path.join(__dirname, '.auth');
const BASE_URL  = 'http://localhost:8080';

async function saveAuth(browser, email, password, filename) {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page    = await context.newPage();

  await page.goto('/index.html');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('#login-btn');
  await page.waitForURL('**/catalog.html', { timeout: 30000 });

  await context.storageState({ path: path.join(AUTH_DIR, filename) });
  await context.close();
}

module.exports = async function globalSetup() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const browser = await chromium.launch();
  await saveAuth(browser, process.env.COACH_EMAIL, process.env.COACH_PASSWORD, 'coach.json');
  await saveAuth(browser, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, 'admin.json');
  await browser.close();
};
