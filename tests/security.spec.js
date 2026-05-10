const { test, expect } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL      = 'https://rmgernpifsdqnnomlzvg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_rE93pQq6GtKA3Z2-3uOcSw_As3GUfz6';
const EDGE_BASE         = `${SUPABASE_URL}/functions/v1`;

const COACH_EMAIL    = process.env.COACH_EMAIL;
const COACH_PASSWORD = process.env.COACH_PASSWORD;
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

let coachToken;
let adminClient;
let adminMovementId;

test.beforeAll(async () => {
  const coachClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: coachData } = await coachClient.auth.signInWithPassword({ email: COACH_EMAIL, password: COACH_PASSWORD });
  coachToken = coachData.session.access_token;

  adminClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await adminClient.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const { data: { user } } = await adminClient.auth.getUser();

  const { data } = await adminClient.from('movements').insert({
    name:        '__test_security__',
    alt_names:   [],
    tags:        [],
    comments:    null,
    video_path:  '00000000-0000-0000-0000-000000000002.mp4',
    uploaded_by: user.id,
  }).select('id').single();
  adminMovementId = data.id;
});

test.afterAll(async () => {
  if (adminClient && adminMovementId) {
    await adminClient.from('movements').delete().eq('id', adminMovementId);
  }
});

test.describe('Edge Function security boundaries', () => {
  test('coach cannot delete a video they do not own', async ({ request }) => {
    const res = await request.post(`${EDGE_BASE}/r2-delete`, {
      headers: { Authorization: `Bearer ${coachToken}`, 'Content-Type': 'application/json' },
      data: { path: '00000000-0000-0000-0000-000000000002.mp4', movementId: adminMovementId },
    });
    expect(res.status()).toBe(403);
  });

  test('coach cannot list users', async ({ request }) => {
    const res = await request.post(`${EDGE_BASE}/list-users`, {
      headers: { Authorization: `Bearer ${coachToken}`, 'Content-Type': 'application/json' },
      data: {},
    });
    expect(res.status()).toBe(403);
  });

  test('coach cannot invite users', async ({ request }) => {
    const res = await request.post(`${EDGE_BASE}/invite-user`, {
      headers: { Authorization: `Bearer ${coachToken}`, 'Content-Type': 'application/json' },
      data: { email: 'nobody@example.com', full_name: 'Test', role: 'coach' },
    });
    expect(res.status()).toBe(403);
  });

  test('coach cannot delete users', async ({ request }) => {
    const res = await request.post(`${EDGE_BASE}/delete-user`, {
      headers: { Authorization: `Bearer ${coachToken}`, 'Content-Type': 'application/json' },
      data: { user_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(403);
  });

  // Regression: vision-name must be deployed with --no-verify-jwt.
  // Supabase's gateway rejects ES256 JWTs with 401 before the function runs
  // when verify_jwt: true (the default). A 400 here proves the function ran.
  test('unauthenticated request to vision-name is rejected', async ({ request }) => {
    const res = await request.post(`${EDGE_BASE}/vision-name`, {
      headers: { 'Content-Type': 'application/json' },
      data: {},
    });
    expect(res.status()).toBe(401);
  });

  test('authenticated coach reaches vision-name (verify_jwt deployment check)', async ({ request }) => {
    const res = await request.post(`${EDGE_BASE}/vision-name`, {
      headers: { Authorization: `Bearer ${coachToken}`, 'Content-Type': 'application/json' },
      data: {},
    });
    // 400 = function ran and rejected missing image input.
    // 401 = gateway rejected the JWT before the function ran (missing --no-verify-jwt).
    expect(res.status()).toBe(400);
  });
});
