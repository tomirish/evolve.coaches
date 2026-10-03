const { test, expect } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('./helpers/config');
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

  test('r2-delete rejects path that does not match the movement video_path', async ({ request }) => {
    // adminMovementId has video_path 00000000-0000-0000-0000-000000000002.mp4.
    // Path mismatch check fires before ownership check, so 400 regardless of who calls it.
    const res = await request.post(`${EDGE_BASE}/r2-delete`, {
      headers: { Authorization: `Bearer ${coachToken}`, 'Content-Type': 'application/json' },
      data: { path: '00000000-0000-0000-0000-000000000099.mp4', movementId: adminMovementId },
    });
    expect(res.status()).toBe(400);
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

test.describe('video link constraints', () => {
  let linkClient;
  let linkUserId;
  const insertedIds = [];

  test.beforeAll(async () => {
    linkClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await linkClient.auth.signInWithPassword({ email: COACH_EMAIL, password: COACH_PASSWORD });
    ({ data: { user: { id: linkUserId } } } = await linkClient.auth.getUser());
  });

  test.afterAll(async () => {
    if (insertedIds.length) await linkClient.from('movements').delete().in('id', insertedIds);
  });

  const row = (over) => ({
    name: '__test_link_constraint__', alt_names: [], tags: [], comments: null,
    video_path: null, uploaded_by: linkUserId, ...over,
  });

  test('accepts a canonical YouTube link as link_only', async () => {
    const { data, error } = await linkClient.from('movements')
      .insert(row({ source_url: 'https://www.youtube.com/watch?v=4taYjKlmihU', download_status: 'link_only' }))
      .select('id').single();
    expect(error).toBeNull();
    insertedIds.push(data.id);
  });

  test('accepts a canonical Instagram link as link_only', async () => {
    const { data, error } = await linkClient.from('movements')
      .insert(row({ source_url: 'https://www.instagram.com/p/DdFIrIfk0W2/', download_status: 'link_only' }))
      .select('id').single();
    expect(error).toBeNull();
    insertedIds.push(data.id);
  });

  for (const bad of [
    'https://evil.example/watch?v=4taYjKlmihU',
    'https://www.youtube.com.evil.example/watch?v=4taYjKlmihU',
    'https://youtu.be/4taYjKlmihU',                       // not canonical
    'https://www.youtube.com/watch?v=4taYjKlmihU&si=x',   // tracking param kept
    'https://www.instagram.com/p/DdFIrIfk0W2/?stkn=x',
    'javascript:alert(1)',
  ]) {
    test(`rejects non-canonical source_url ${bad}`, async () => {
      const { error } = await linkClient.from('movements')
        .insert(row({ source_url: bad, download_status: 'link_only' }));
      expect(error?.code).toBe('23514'); // check_violation
    });
  }

  test('rejects a link without a download_status', async () => {
    const { error } = await linkClient.from('movements')
      .insert(row({ source_url: 'https://www.youtube.com/watch?v=4taYjKlmihU', download_status: null }));
    expect(error?.code).toBe('23514');
  });

  test('rejects a download_status without a link', async () => {
    const { error } = await linkClient.from('movements')
      .insert(row({ video_path: '00000000-0000-0000-0000-000000000009.mp4', download_status: 'pending' }));
    expect(error?.code).toBe('23514');
  });

  test('rejects an unknown download_status', async () => {
    const { error } = await linkClient.from('movements')
      .insert(row({ source_url: 'https://www.youtube.com/watch?v=4taYjKlmihU', download_status: 'archived' }));
    expect(error?.code).toBe('23514');
  });

  const YT = { source_url: 'https://www.youtube.com/watch?v=4taYjKlmihU', download_status: 'link_only' };

  test('accepts a part of up to 180 seconds on a link', async () => {
    const { data, error } = await linkClient.from('movements')
      .insert(row({ ...YT, clip_start: 69, clip_end: 249 })).select('id').single();
    expect(error).toBeNull();
    insertedIds.push(data.id);
  });

  for (const [label, clip] of [
    ['half-set part', { clip_start: 69, clip_end: null }],
    ['end before start', { clip_start: 99, clip_end: 69 }],
    ['zero-length part', { clip_start: 69, clip_end: 69 }],
    ['negative start', { clip_start: -1, clip_end: 30 }],
    ['part over 180 seconds', { clip_start: 0, clip_end: 181 }],
  ]) {
    test(`rejects a ${label}`, async () => {
      const { error } = await linkClient.from('movements').insert(row({ ...YT, ...clip }));
      expect(error?.code).toBe('23514');
    });
  }

  test('rejects a part on a file upload', async () => {
    const { error } = await linkClient.from('movements')
      .insert(row({ video_path: '00000000-0000-0000-0000-00000000000a.mp4', clip_start: 0, clip_end: 30 }));
    expect(error?.code).toBe('23514');
  });
});
