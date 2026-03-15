/**
 * Test fixtures — seed a minimal movement row before data-dependent tests,
 * clean it up after. This ensures tests never depend on production data.
 *
 * Uses the test coach account (same creds as the rest of the suite).
 * The fixture movement has a fake video_path so R2 is never touched —
 * the <video> element still renders visible, it just won't play.
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL     = 'https://rmgernpifsdqnnomlzvg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_rE93pQq6GtKA3Z2-3uOcSw_As3GUfz6';

async function setupMovementFixture(email, password) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError) throw new Error(`Fixture auth failed: ${authError.message}`);

  const { data: { user } } = await client.auth.getUser();

  const { data, error } = await client.from('movements').insert({
    name:        '__test_fixture__',
    alt_names:   [],
    tags:        [],
    comments:    null,
    video_path:  'test-fixture.mp4',
    uploaded_by: user.id,
  }).select('id').single();

  if (error) throw new Error(`Fixture insert failed: ${error.message}`);
  return { client, id: data.id };
}

async function teardownMovementFixture(client, id) {
  if (!client || !id) return;
  const { error } = await client.from('movements').delete().eq('id', id);
  if (error) throw new Error(`Fixture cleanup failed: ${error.message}`);
}

module.exports = { setupMovementFixture, teardownMovementFixture };
