const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let _profile = null;

async function getSession() {
  const { data: { session } } = await client.auth.getSession();
  return session;
}

async function getProfile() {
  if (_profile) return _profile;
  const session = await getSession();
  if (!session) return null;
  const { data } = await client
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  _profile = data;
  return _profile;
}

async function requireAuth() {
  const session = await getSession();
  if (!session) window.location.href = 'index.html';
  return session;
}

async function requireAdmin() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || profile.role !== 'admin') window.location.href = 'catalog.html';
  return profile;
}

async function initNav() {
  const profile = await getProfile();
  if (!profile) return;

  if (profile.role === 'admin') {
    const adminLink = document.getElementById('admin-link');
    if (adminLink) adminLink.classList.remove('hidden');
  }

  if (profile.full_name) {
    const firstName   = profile.full_name.split(' ')[0];
    const signOutBtn  = document.querySelector('.nav-signout');
    if (signOutBtn) {
      const greeting = document.createElement('span');
      greeting.className   = 'nav-greeting';
      greeting.textContent = `Hi, ${firstName}`;
      signOutBtn.parentNode.insertBefore(greeting, signOutBtn);
    }
  }
}

async function signOut() {
  await client.auth.signOut();
  window.location.href = 'index.html';
}
