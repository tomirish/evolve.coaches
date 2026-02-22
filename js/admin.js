requireAdmin();

const groupList = document.getElementById('group-list');
const addForm   = document.getElementById('add-form');
const newInput  = document.getElementById('new-group');
const errorMsg  = document.getElementById('error-msg');

// ── Load ─────────────────────────────────────────────────────
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
    groupList.innerHTML = '<li class="status-msg">No muscle groups yet.</li>';
    return;
  }

  groupList.innerHTML = data.map(g => `
    <li class="admin-list-item">
      <span>${escape(g.name)}</span>
      <button class="btn-delete" data-id="${g.id}" data-name="${escape(g.name)}">Delete</button>
    </li>
  `).join('');
}

// ── Add ───────────────────────────────────────────────────────
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

// ── Delete ────────────────────────────────────────────────────
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
loadGroups();
