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

  const isAdmin   = profile.role === 'admin';
  const adminItem = isAdmin ? '<a href="admin.html">Admin</a>' : '';
  const initials  = getInitials(profile.full_name);
  const fullName  = (profile.full_name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const signOutBtn = document.querySelector('.nav-signout');
  if (signOutBtn) {
    const wrapper = document.createElement('div');
    wrapper.className = 'nav-user';
    wrapper.innerHTML = `
      <button class="nav-avatar" title="${fullName}">${initials}</button>
      <div class="nav-user-menu hidden">
        <a href="tags.html">Tags</a>
        ${adminItem}
        <a href="account.html" class="nav-menu-separator">Account</a>
        <button class="nav-user-signout">Sign Out</button>
      </div>
    `;
    signOutBtn.parentNode.replaceChild(wrapper, signOutBtn);

    const moreBtn = wrapper.querySelector('.nav-avatar');
    const menu    = wrapper.querySelector('.nav-user-menu');

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });
    wrapper.querySelector('.nav-user-signout').addEventListener('click', signOut);
    document.addEventListener('click', () => menu.classList.add('hidden'));
  }
}

function getInitials(fullName) {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function signOut() {
  await client.auth.signOut();
  window.location.href = 'index.html';
}
