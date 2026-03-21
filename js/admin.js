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
const dupFilterBtn     = document.getElementById('dup-filter-btn');
const archiveBar       = document.getElementById('archive-bar');
const archiveCount     = document.getElementById('archive-count');
const archiveBtn       = document.getElementById('archive-btn');

let showDupsOnly = false;
let selectedIds  = new Set();

async function loadMovements() {
  movementList.innerHTML = '<li class="status-msg">Loading…</li>';
  selectedIds.clear();
  updateArchiveBar();

  const { data, error } = await client
    .from('movements')
    .select('id, name, video_path, created_at, uploaded_by')
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    movementList.innerHTML = '<li class="status-msg error">Failed to load movements. Please refresh.</li>';
    return;
  }

  const uploaderIds = [...new Set(data.map(m => m.uploaded_by).filter(Boolean))];
  let profileMap = {};
  if (uploaderIds.length > 0) {
    const { data: profiles } = await client
      .from('profiles')
      .select('id, full_name')
      .in('id', uploaderIds);
    (profiles || []).forEach(p => { profileMap[p.id] = p.full_name; });
  }

  allMovements = data.map(m => ({ ...m, uploaderName: profileMap[m.uploaded_by] || 'Unknown' }));
  applyMovementFilter();
}

function applyMovementFilter() {
  const query = movementSearch.value.trim().toLowerCase();
  let filtered = query
    ? allMovements.filter(m => m.name.toLowerCase().includes(query))
    : allMovements;

  if (showDupsOnly) {
    const counts = {};
    filtered.forEach(m => {
      const key = m.name.trim().toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    });
    filtered = filtered.filter(m => counts[m.name.trim().toLowerCase()] > 1);
  }

  renderMovements(filtered);
}

function renderMovements(data) {
  if (data.length === 0) {
    const msg = showDupsOnly ? 'No duplicate movement names found.' : 'No movements found.';
    movementList.innerHTML = `<li class="status-msg">${msg}</li>`;
    return;
  }

  if (showDupsOnly) {
    renderMovementsDuped(data);
  } else {
    renderMovementsList(data);
  }
}

function movementRowHtml(m) {
  const checked = selectedIds.has(m.id) ? 'checked' : '';
  return `
    <li class="admin-list-item" data-id="${m.id}">
      <input type="checkbox" class="admin-row-check" data-id="${m.id}" ${checked}>
      <div class="admin-thumb" data-path="${escape(m.video_path)}" title="Preview video">
        <div class="admin-thumb-play">&#9654;</div>
      </div>
      <div class="admin-item-body">
        <div class="admin-user-name">${escape(m.name)}</div>
        <div class="admin-item-date">Uploaded by ${escape(m.uploaderName)} · ${formatDate(m.created_at)}</div>
      </div>
      <div class="admin-user-actions">
        <button class="btn-sm" onclick="location.href='movement.html?id=${m.id}&edit=1'">Edit</button>
      </div>
    </li>
  `;
}

// ── Lazy thumbnails via IntersectionObserver ──────────────────
const thumbObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const thumb = entry.target;
    thumbObserver.unobserve(thumb);
    loadThumb(thumb);
  });
}, { rootMargin: '200px' });

function observeThumbs() {
  movementList.querySelectorAll('.admin-thumb:not([data-thumb-loaded])').forEach(thumb => {
    thumbObserver.observe(thumb);
  });
}

async function loadThumb(thumbEl) {
  thumbEl.dataset.thumbLoaded = '1';
  const path = thumbEl.dataset.path;

  // Reuse the same sessionStorage cache as movement.js
  const cacheKey = `signed-url:${path}`;
  let signedUrl  = null;
  const cached   = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      const { url, expires } = JSON.parse(cached);
      if (Date.now() < expires) signedUrl = url;
    } catch {}
  }

  if (!signedUrl) {
    const result = await callEdgeFunction('r2-signed-url', { path });
    if (result.error || !result.signedUrl) return;
    signedUrl = result.signedUrl;
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({
        url:     signedUrl,
        expires: Date.now() + 60 * 60 * 1000,
      }));
    } catch {}
  }

  // Use a <video> element directly — avoids canvas cross-origin taint issues
  const video       = document.createElement('video');
  video.muted       = true;
  video.playsInline = true;
  video.preload     = 'auto';
  video.src         = signedUrl;
  video.addEventListener('loadedmetadata', () => {
    video.currentTime = Math.min(1, (video.duration || 0) * 0.1);
  });
  thumbEl.insertBefore(video, thumbEl.firstChild);
}

function renderMovementsList(data) {
  movementList.innerHTML = data.map(movementRowHtml).join('');
  observeThumbs();
}

function renderMovementsDuped(data) {
  const groups = {};
  data.forEach(m => {
    const key = m.name.trim().toLowerCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  });

  const html = Object.values(groups).map(group => {
    const header = `<li class="admin-dup-header">${escape(group[0].name)} · ${group.length} copies</li>`;
    return header + group.map(movementRowHtml).join('');
  }).join('');

  movementList.innerHTML = html;
  observeThumbs();
}

function updateArchiveBar() {
  if (selectedIds.size === 0) {
    archiveBar.classList.add('hidden');
  } else {
    archiveBar.classList.remove('hidden');
    archiveCount.textContent = `${selectedIds.size} selected`;
  }
}

movementSearch.addEventListener('input', applyMovementFilter);

dupFilterBtn.addEventListener('click', () => {
  showDupsOnly = !showDupsOnly;
  dupFilterBtn.classList.toggle('active', showDupsOnly);
  applyMovementFilter();
});

movementList.addEventListener('change', (e) => {
  const cb = e.target.closest('.admin-row-check');
  if (!cb) return;
  if (cb.checked) selectedIds.add(cb.dataset.id);
  else selectedIds.delete(cb.dataset.id);
  updateArchiveBar();
});

movementList.addEventListener('click', (e) => {
  const thumb = e.target.closest('.admin-thumb');
  if (thumb) { openAdminVideoModal(thumb.dataset.path); return; }
});

archiveBtn.addEventListener('click', async () => {
  const count = selectedIds.size;
  if (!count) return;
  const label = count === 1 ? '1 movement' : `${count} movements`;
  if (!confirm(`You are archiving ${label}. They will no longer appear in the catalog. Continue?`)) return;

  archiveBtn.disabled    = true;
  archiveBtn.textContent = 'Archiving…';
  movementErrorMsg.classList.add('hidden');

  const { error } = await client
    .from('movements')
    .update({ archived_at: new Date().toISOString() })
    .in('id', [...selectedIds]);

  archiveBtn.disabled    = false;
  archiveBtn.textContent = 'Archive Selected';

  if (error) {
    movementErrorMsg.textContent = 'Failed to archive. Please try again.';
    movementErrorMsg.classList.remove('hidden');
    return;
  }

  loadMovements();
});

// ── Admin video modal ──────────────────────────────────────────
function openAdminVideoModal(path) {
  const modal   = document.getElementById('admin-video-modal');
  const video   = document.getElementById('admin-modal-video');
  const loading = document.getElementById('admin-modal-loading');
  video.style.display = 'none';
  video.src = '';
  loading.style.display = 'block';
  modal.classList.remove('hidden');
  modal.onclick = (e) => { if (e.target === modal) closeAdminVideoModal(); };

  callEdgeFunction('r2-signed-url', { path }).then(result => {
    if (result.error || !result.signedUrl) {
      loading.textContent = 'Could not load video.';
      return;
    }
    loading.style.display = 'none';
    video.style.display   = 'block';
    video.src   = result.signedUrl;
    video.muted = true;
    video.play();
  });
}

function closeAdminVideoModal() {
  const modal = document.getElementById('admin-video-modal');
  modal.classList.add('hidden');
  const video = document.getElementById('admin-modal-video');
  video.pause();
  video.src = '';
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Tags ──────────────────────────────────────────────────────
let allTags = [];

const groupList    = document.getElementById('group-list');
const tagErrorMsg  = document.getElementById('tag-error-msg');
const tagSearch    = document.getElementById('tag-search');

async function loadGroups() {
  groupList.innerHTML = '<li class="status-msg">Loading…</li>';

  const [tagsResult, movementsResult] = await Promise.all([
    client.from('tags').select('id, name').order('name'),
    client.from('movements').select('tags').is('archived_at', null),
  ]);

  if (tagsResult.error) {
    groupList.innerHTML = '<li class="status-msg error">Failed to load. Please refresh.</li>';
    return;
  }

  const tags      = tagsResult.data;
  const movements = movementsResult.data || [];

  // Build usage count map
  const usageMap = {};
  movements.forEach(m => (m.tags || []).forEach(t => {
    usageMap[t] = (usageMap[t] || 0) + 1;
  }));

  allTags = tags.map(g => ({ ...g, count: usageMap[g.name] || 0 }));
  applyTagSearch();
}

function applyTagSearch() {
  const query    = tagSearch.value.trim().toLowerCase();
  const filtered = query
    ? allTags.filter(g => g.name.toLowerCase().includes(query))
    : allTags;
  renderTags(filtered);
}

function renderTags(data) {
  if (data.length === 0) {
    groupList.innerHTML = '<li class="status-msg">No tags found.</li>';
    return;
  }

  groupList.innerHTML = data.map(g => {
    const countLabel = g.count === 0 ? 'Not used' : `Used on ${g.count} movement${g.count === 1 ? '' : 's'}`;
    return `
      <li class="admin-list-item" data-id="${g.id}" data-name="${escape(g.name)}" data-count="${g.count}">
        <span>${escape(g.name)} <span class="admin-item-date">&middot; ${countLabel}</span></span>
        <div class="admin-user-actions">
          <button class="btn-sm btn-edit-tag">Edit</button>
          <button class="btn-delete btn-delete-tag">Delete</button>
        </div>
      </li>
    `;
  }).join('');
}

tagSearch.addEventListener('input', applyTagSearch);

groupList.addEventListener('click', async (e) => {
  // Edit
  const editBtn = e.target.closest('.btn-edit-tag');
  if (editBtn) {
    const li       = editBtn.closest('li');
    const { name } = li.dataset;

    li.innerHTML = `
      <input class="edit-inline" type="text" value="${escape(name)}" style="flex:1">
      <div style="display:flex;gap:0.5rem;flex-shrink:0;margin-left:0.75rem">
        <button class="btn-sm btn-save-tag">Save</button>
        <button class="btn-sm btn-cancel-tag">Cancel</button>
      </div>
    `;

    const input = li.querySelector('.edit-inline');
    input.focus();
    input.select();
    return;
  }

  // Save
  const saveBtn = e.target.closest('.btn-save-tag');
  if (saveBtn) {
    const li      = saveBtn.closest('li');
    const id      = li.dataset.id;
    const oldName = li.dataset.name;
    const newName = li.querySelector('input.edit-inline').value.trim();

    if (!newName) return;

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';
    tagErrorMsg.classList.add('hidden');

    const { error } = await client.from('tags').update({ name: newName }).eq('id', id);

    if (error) {
      tagErrorMsg.textContent = 'Failed to save. Please try again.';
      tagErrorMsg.classList.remove('hidden');
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save';
      return;
    }

    // Update all movements that use the old tag name
    const { data: movements } = await client
      .from('movements')
      .select('id, tags')
      .contains('tags', [oldName]);

    for (const m of movements || []) {
      await client
        .from('movements')
        .update({ tags: m.tags.map(t => t === oldName ? newName : t) })
        .eq('id', m.id);
    }

    loadGroups();
    return;
  }

  // Cancel
  const cancelBtn = e.target.closest('.btn-cancel-tag');
  if (cancelBtn) {
    applyTagSearch();
    return;
  }

  // Delete
  const deleteBtn = e.target.closest('.btn-delete-tag');
  if (deleteBtn) {
    const li       = deleteBtn.closest('li');
    const { id, name, count } = li.dataset;
    const countNum = parseInt(count, 10);
    const usageMsg = countNum > 0
      ? ` It's used on ${countNum} movement${countNum === 1 ? '' : 's'}.`
      : '';

    if (!confirm(`Delete "${name}"?${usageMsg} This won't remove it from those movements.`)) return;

    const { error } = await client.from('tags').delete().eq('id', id);

    if (error) {
      tagErrorMsg.textContent = 'Failed to delete. Please try again.';
      tagErrorMsg.classList.remove('hidden');
      return;
    }

    loadGroups();
  }
});

// ── Users ─────────────────────────────────────────────────────
let allUsers = [];

const userList       = document.getElementById('user-list');
const userSuccessMsg = document.getElementById('user-success-msg');
const userErrorMsg   = document.getElementById('user-error-msg');
const inviteForm     = document.getElementById('invite-form');

async function loadUsers() {
  userList.innerHTML = '<li class="status-msg">Loading…</li>';

  const result = await callEdgeFunction('list-users');
  if (result.error) {
    userList.innerHTML = '<li class="status-msg error">Failed to load users. Please refresh.</li>';
    return;
  }

  allUsers = result.users
    .filter(u => !(u.full_name || '').startsWith('*** DO NOT REMOVE ***'))
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
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

  const input = infoDiv.querySelector('input.edit-inline');
  const resize = () => { input.style.width = Math.max(12, input.value.length + 2) + 'ch'; };
  resize();
  input.addEventListener('input', resize);
}

inviteForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email      = document.getElementById('invite-email').value.trim();
  const full_name  = document.getElementById('invite-name').value.trim();
  const role       = document.getElementById('invite-role').value;
  const redirectTo = new URL('reset.html', window.location.href).href;

  userSuccessMsg.classList.add('hidden');
  userErrorMsg.classList.add('hidden');

  const submitBtn = inviteForm.querySelector('button[type="submit"]');
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Inviting…';

  const result = await callEdgeFunction('invite-user', { email, full_name, role, redirectTo });

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

    const redirectTo = new URL('reset.html', window.location.href).href;
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });

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

    const result = await callEdgeFunction('delete-user', { user_id: id });

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

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAdminVideoModal();
});

loadMovements();
loadGroups();
loadUsers();
initNav();
