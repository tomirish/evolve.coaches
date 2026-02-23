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

  const firstName  = profile.full_name ? profile.full_name.split(' ')[0] : 'Me';
  const signOutBtn = document.querySelector('.nav-signout');
  if (signOutBtn) {
    const wrapper = document.createElement('div');
    wrapper.className = 'nav-user';
    wrapper.innerHTML = `
      <button class="nav-user-btn">Hi, ${firstName} <span class="nav-caret">▾</span></button>
      <div class="nav-user-menu hidden">
        <a href="account.html">Account</a>
        <button class="nav-user-signout">Sign Out</button>
      </div>
    `;
    signOutBtn.parentNode.replaceChild(wrapper, signOutBtn);

    const userBtn     = wrapper.querySelector('.nav-user-btn');
    const menu        = wrapper.querySelector('.nav-user-menu');
    const menuSignOut = wrapper.querySelector('.nav-user-signout');

    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });
    menuSignOut.addEventListener('click', signOut);
    document.addEventListener('click', () => menu.classList.add('hidden'));
  }
}

async function signOut() {
  await client.auth.signOut();
  window.location.href = 'index.html';
}
