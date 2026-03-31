/**
 * Shared login helper — applies saved auth state (fast) or falls back to a
 * real Supabase login if the state file doesn't exist yet.
 */
const path = require('path');
const fs   = require('fs');

const AUTH_DIR = path.join(__dirname, '.auth');

async function loginAs(page, email, password) {
  const isAdmin   = email === process.env.ADMIN_EMAIL;
  const stateFile = path.join(AUTH_DIR, isAdmin ? 'admin.json' : 'coach.json');

  if (fs.existsSync(stateFile)) {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

    // Apply cookies
    if (state.cookies?.length) {
      await page.context().addCookies(state.cookies);
    }

    // Apply localStorage (Supabase auth token lives here)
    if (state.origins?.length) {
      for (const origin of state.origins) {
        if (origin.localStorage?.length) {
          await page.goto(origin.origin.replace(/\/$/, '') + '/index.html');
          for (const item of origin.localStorage) {
            await page.evaluate(
              ([k, v]) => localStorage.setItem(k, v),
              [item.name, item.value]
            );
          }
        }
      }
    }

    await page.goto('/catalog.html');
    await page.waitForURL('**/catalog.html', { timeout: 5000 });
    return;
  }

  // Fallback: real login (first run before global-setup has saved state)
  await page.goto('/index.html');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('#login-btn');
  await page.waitForURL('**/catalog.html', { timeout: 15000 });
}

module.exports = { loginAs };
