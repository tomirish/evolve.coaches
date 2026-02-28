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

function escape(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

async function callEdgeFunction(name, body = null) {
  const { data: { session } } = await client.auth.getSession();
  if (!session) return { error: 'Not authenticated' };
  const { data, error } = await client.functions.invoke(name, {
    body: body || undefined,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    const ctx = error.context;
    if (ctx && typeof ctx === 'object' && ctx.error) return { error: ctx.error };
    return { error: error.message };
  }
  return data;
}

function uploadToR2(file, uploadUrl, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
    xhr.send(file);
  });
}
