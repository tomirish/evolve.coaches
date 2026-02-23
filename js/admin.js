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
initNav();
