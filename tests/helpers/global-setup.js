/**
 * Playwright global setup — logs in once per user type and saves storageState.
 * Runs before any tests. The web server is already up at this point.
 */
const { chromium } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs   = require('fs');

const SUPABASE_URL      = 'https://rmgernpifsdqnnomlzvg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_rE93pQq6GtKA3Z2-3uOcSw_As3GUfz6';

async function cleanupStaleFixtures() {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await client.auth.signInWithPassword({
    email:    process.env.COACH_EMAIL,
    password: process.env.COACH_PASSWORD,
  });
  await client.from('movements').delete().like('name', '__%__%');
}

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

  await cleanupStaleFixtures();

  const browser = await chromium.launch();
  await saveAuth(browser, process.env.COACH_EMAIL, process.env.COACH_PASSWORD, 'coach.json');
  await saveAuth(browser, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, 'admin.json');
  await browser.close();
};
