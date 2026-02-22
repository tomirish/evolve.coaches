const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getSession() {
  const { data: { session } } = await client.auth.getSession();
  return session;
}

async function requireAuth() {
  const session = await getSession();
  if (!session) window.location.href = 'index.html';
  return session;
}

async function signOut() {
  await client.auth.signOut();
  window.location.href = 'index.html';
}
