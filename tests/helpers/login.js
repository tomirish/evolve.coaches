/**
 * Shared login helper — navigates to the login page, fills credentials,
 * submits, and waits until the URL contains catalog.html.
 */
async function loginAs(page, email, password) {
  await page.goto('/index.html');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('#login-btn');
  await page.waitForURL('**/catalog.html', { timeout: 15000 });
}

module.exports = { loginAs };
