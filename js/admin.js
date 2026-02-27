requireAdmin();

let allMovements = [];

// ── Tabs ──────────────────────────────────────────────────────
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
  });
});

// ── Movements ─────────────────────────────────────────────────
const movementList     = document.getElementById('movement-list');
const movementErrorMsg = document.getElementById('movement-error-msg');
const movementSearch   = document.getElementById('movement-search');

async function loadMovements() {
  movementList.innerHTML = '<li class="status-msg">Loading…</li>';

  const { data, error } = await client
    .from('movements')
    .select('id, name, video_path, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    movementList.innerHTML = '<li class="status-msg error">Failed to load movements. Please refresh.</li>';
    return;
  }

  allMovements = data;
  applyMovementSearch();
}

function applyMovementSearch() {
  const query    = movementSearch.value.trim().toLowerCase();
  const filtered = query
    ? allMovements.filter(m => m.name.toLowerCase().includes(query))
    : allMovements;
  renderMovements(filtered);
}

function renderMovements(data) {
  if (data.length === 0) {
    movementList.innerHTML = '<li class="status-msg">No movements found.</li>';
    return;
  }

  movementList.innerHTML = data.map(m => `
    <li class="admin-list-item">
      <div>
        <div>${escape(m.name)}</div>
        <div class="admin-item-date">${formatDate(m.created_at)}</div>
      </div>
      <button class="btn-delete" data-id="${m.id}" data-name="${escape(m.name)}" data-path="${escape(m.video_path)}">Delete</button>
    </li>
  `).join('');
}

movementSearch.addEventListener('input', applyMovementSearch);

movementList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-delete');
  if (!btn) return;

  const { id, name, path } = btn.dataset;

  if (!confirm(`Delete "${name}"? This will permanently remove the video and cannot be undone.`)) return;

  btn.disabled    = true;
  btn.textContent = 'Deleting…';
  movementErrorMsg.classList.add('hidden');

  const { error: dbError } = await client
    .from('movements')
    .delete()
    .eq('id', id);

  if (dbError) {
    btn.disabled    = false;
    btn.textContent = 'Delete';
    movementErrorMsg.textContent = 'Failed to delete. Please try again.';
    movementErrorMsg.classList.remove('hidden');
    return;
  }

  await client.storage.from('videos').remove([path]);
  loadMovements();
});

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Tags ──────────────────────────────────────────────────────
const groupList = document.getElementById('group-list');
const addForm   = document.getElementById('add-form');
const newInput  = document.getElementById('new-group');
const errorMsg  = document.getElementById('error-msg');

async function loadGroups() {
  groupList.innerHTML = '<li class="status-msg">Loading…</li>';

  const { data, error } = await client
    .from('muscle_groups')
    .select('id, name')
    .order('name');

  if (error) {
    groupList.innerHTML = '<li class="status-msg error">Failed to load. Please refresh.</li>';
    return;
  }

  if (data.length === 0) {
    groupList.innerHTML = '<li class="status-msg">No tags yet.</li>';
    return;
  }

  groupList.innerHTML = data.map(g => `
    <li class="admin-list-item">
      <span>${escape(g.name)}</span>
      <button class="btn-delete" data-id="${g.id}" data-name="${escape(g.name)}">Delete</button>
    </li>
  `).join('');
}

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = newInput.value.trim();
  if (!name) return;

  errorMsg.classList.add('hidden');

  const { error } = await client
    .from('muscle_groups')
    .insert({ name });

  if (error) {
    errorMsg.textContent = error.code === '23505'
      ? `"${name}" already exists.`
      : 'Failed to add. Please try again.';
    errorMsg.classList.remove('hidden');
    return;
  }

  newInput.value = '';
  loadGroups();
});

groupList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-delete');
  if (!btn) return;

  const { id, name } = btn.dataset;

  if (!confirm(`Delete "${name}"? This won't affect movements already tagged with it.`)) return;

  const { error } = await client
    .from('muscle_groups')
    .delete()
    .eq('id', id);

  if (error) {
    errorMsg.textContent = 'Failed to delete. Please try again.';
    errorMsg.classList.remove('hidden');
    return;
  }

  loadGroups();
});

// ── Users ─────────────────────────────────────────────────────
let allUsers = [];

const userList       = document.getElementById('user-list');
const userSuccessMsg = document.getElementById('user-success-msg');
const userErrorMsg   = document.getElementById('user-error-msg');
const inviteForm     = document.getElementById('invite-form');

async function callFunction(name, body = null) {
  const { data: { session } } = await client.auth.getSession();
  if (!session) return { error: 'Not authenticated' };
  const { data, error } = await client.functions.invoke(name, {
    body: body || undefined,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) return { error: error.message };
  return data;
}

async function loadUsers() {
  userList.innerHTML = '<li class="status-msg">Loading…</li>';

  const result = await callFunction('list-users');
  if (result.error) {
    userList.innerHTML = '<li class="status-msg error">Failed to load users. Please refresh.</li>';
    return;
  }

  allUsers = result.users;
  renderUsers(allUsers);
}

function renderUsers(data) {
  if (data.length === 0) {
    userList.innerHTML = '<li class="status-msg">No users yet.</li>';
    return;
  }

  userList.innerHTML = data.map(u => `
    <li class="admin-list-item" data-id="${u.id}" data-email="${escape(u.email)}">
      <div class="admin-user-info">
        <div class="admin-user-name">${escape(u.full_name || '(No name)')}</div>
        <div class="admin-item-date">${escape(u.email)}</div>
        <span class="role-badge${u.role === 'admin' ? ' admin' : ''}">${u.role === 'admin' ? 'Admin' : 'Coach'}</span>
      </div>
      <div class="admin-user-actions">
        <button class="btn-sm btn-reset-pw" data-email="${escape(u.email)}" data-name="${escape(u.full_name || u.email)}">Reset Password</button>
        <button class="btn-sm btn-edit-user" data-id="${u.id}" data-name="${escape(u.full_name || '')}" data-role="${escape(u.role)}">Edit</button>
        <button class="btn-delete btn-delete-user" data-id="${u.id}" data-name="${escape(u.full_name || u.email)}">Delete</button>
      </div>
    </li>
  `).join('');
}

function enterEditMode(li, { id, name, role }) {
  const infoDiv    = li.querySelector('.admin-user-info');
  const actionsDiv = li.querySelector('.admin-user-actions');

  infoDiv.innerHTML = `
    <input class="edit-inline" type="text" value="${escape(name)}" placeholder="Full name">
    <select class="edit-inline">
      <option value="coach"${role === 'coach' ? ' selected' : ''}>Coach</option>
      <option value="admin"${role === 'admin' ? ' selected' : ''}>Admin</option>
    </select>
  `;
  actionsDiv.innerHTML = `
    <button class="btn-sm btn-save-user">Save</button>
    <button class="btn-sm btn-cancel-edit">Cancel</button>
  `;
}

inviteForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email     = document.getElementById('invite-email').value.trim();
  const full_name = document.getElementById('invite-name').value.trim();
  const role      = document.getElementById('invite-role').value;

  userSuccessMsg.classList.add('hidden');
  userErrorMsg.classList.add('hidden');

  const submitBtn = inviteForm.querySelector('button[type="submit"]');
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Inviting…';

  const result = await callFunction('invite-user', { email, full_name, role });

  submitBtn.disabled    = false;
  submitBtn.textContent = 'Invite';

  if (result.error) {
    userErrorMsg.textContent = result.error;
    userErrorMsg.classList.remove('hidden');
    return;
  }

  inviteForm.reset();
  userSuccessMsg.textContent = `Invite sent to ${email}.`;
  userSuccessMsg.classList.remove('hidden');
  loadUsers();
});

userList.addEventListener('click', async (e) => {
  // Edit button
  const editBtn = e.target.closest('.btn-edit-user');
  if (editBtn) {
    enterEditMode(editBtn.closest('li'), editBtn.dataset);
    return;
  }

  // Save edit
  const saveBtn = e.target.closest('.btn-save-user');
  if (saveBtn) {
    const li        = saveBtn.closest('li');
    const id        = li.dataset.id;
    const full_name = li.querySelector('input.edit-inline').value.trim();
    const role      = li.querySelector('select.edit-inline').value;

    if (!full_name) return;

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';
    userErrorMsg.classList.add('hidden');

    const { error } = await client.from('profiles').update({ full_name, role }).eq('id', id);

    if (error) {
      userErrorMsg.textContent = 'Failed to save. Please try again.';
      userErrorMsg.classList.remove('hidden');
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save';
      return;
    }

    loadUsers();
    return;
  }

  // Cancel edit
  const cancelBtn = e.target.closest('.btn-cancel-edit');
  if (cancelBtn) {
    renderUsers(allUsers);
    return;
  }

  // Reset password button
  const resetBtn = e.target.closest('.btn-reset-pw');
  if (resetBtn) {
    const { email, name } = resetBtn.dataset;
    if (!confirm(`Send a password reset email to ${email}?`)) return;

    resetBtn.disabled    = true;
    resetBtn.textContent = 'Sending…';
    userSuccessMsg.classList.add('hidden');
    userErrorMsg.classList.add('hidden');

    const { error } = await client.auth.resetPasswordForEmail(email);

    resetBtn.disabled    = false;
    resetBtn.textContent = 'Reset Password';

    if (error) {
      userErrorMsg.textContent = 'Failed to send reset email. Please try again.';
      userErrorMsg.classList.remove('hidden');
      return;
    }

    userSuccessMsg.textContent = `Password reset email sent to ${email}.`;
    userSuccessMsg.classList.remove('hidden');
    return;
  }

  // Delete button
  const deleteBtn = e.target.closest('.btn-delete-user');
  if (deleteBtn) {
    const { id, name } = deleteBtn.dataset;
    if (!confirm(`Remove ${name} from the app? This cannot be undone.`)) return;

    deleteBtn.disabled    = true;
    deleteBtn.textContent = 'Deleting…';
    userSuccessMsg.classList.add('hidden');
    userErrorMsg.classList.add('hidden');

    const result = await callFunction('delete-user', { user_id: id });

    if (result.error) {
      userErrorMsg.textContent = result.error;
      userErrorMsg.classList.remove('hidden');
      deleteBtn.disabled    = false;
      deleteBtn.textContent = 'Delete';
      return;
    }

    loadUsers();
  }
});

// ── Helper ────────────────────────────────────────────────────
function escape(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ─────────────────────────────────────────────────────
loadMovements();
loadGroups();
loadUsers();
initNav();
