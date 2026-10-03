const { test, expect } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const { loginAs } = require('./helpers/login');
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('./helpers/config');

const COACH_EMAIL    = process.env.COACH_EMAIL;
const COACH_PASSWORD = process.env.COACH_PASSWORD;
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const TAG = '__test_tag_count__';

let admin;
let movementId;

test.beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await admin.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const { data: { user } } = await admin.auth.getUser();

  await admin.from('tags').insert({ name: TAG });
  const { data } = await admin.from('movements').insert({
    name: '__test_tag_count_archived__', alt_names: [], tags: [TAG], comments: null,
    video_path: '00000000-0000-0000-0000-00000000000c.mp4', uploaded_by: user.id,
    archived_at: new Date().toISOString(),
  }).select('id').single();
  movementId = data.id;
});

test.afterAll(async () => {
  if (movementId) await admin.from('movements').delete().eq('id', movementId);
  await admin.from('tags').delete().eq('name', TAG);
});

test('tag usage count ignores archived movements', async ({ page }) => {
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await page.goto('/tags.html');
  await expect(page.getByText(`${TAG} · Not used`)).toBeVisible({ timeout: 15000 });
});
