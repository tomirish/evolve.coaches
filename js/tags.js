requireAuth();

const tagList  = document.getElementById('tag-list');
const addForm  = document.getElementById('add-form');
const newInput = document.getElementById('new-tag');
const errorMsg = document.getElementById('error-msg');

let allTags = [];

// ── Load ──────────────────────────────────────────────────────
async function loadTags() {
  tagList.innerHTML = '<li class="status-msg">Loading…</li>';

  const [tagsResult, movementsResult] = await Promise.all([
    client.from('tags').select('id, name').order('name'),
    client.from('movements').select('tags'),
  ]);

  if (tagsResult.error) {
    tagList.innerHTML = '<li class="status-msg error">Failed to load. Please refresh.</li>';
    return;
  }

  // Build usage count map
  const usageMap = {};
  (movementsResult.data || []).forEach(m => (m.tags || []).forEach(t => {
    usageMap[t] = (usageMap[t] || 0) + 1;
  }));

  allTags = tagsResult.data.map(t => ({ ...t, count: usageMap[t.name] || 0 }));
  renderTags(allTags);
}

function renderTags(data) {
  if (data.length === 0) {
    tagList.innerHTML = '<li class="status-msg">No tags yet.</li>';
    return;
  }

  tagList.innerHTML = data.map(t => {
    const countLabel = t.count === 0 ? 'Not used' : `Used on ${t.count} movement${t.count === 1 ? '' : 's'}`;
    return `
      <li class="admin-list-item">
        <span>${escape(t.name)} <span class="admin-item-date">&middot; ${countLabel}</span></span>
        <button class="btn-sm btn-edit-tag" data-id="${t.id}" data-name="${escape(t.name)}">Edit</button>
      </li>
    `;
  }).join('');
}

function enterEditMode(li, id, name) {
  li.innerHTML = `
    <input class="edit-inline" type="text" value="${escape(name)}" style="flex:1">
    <div style="display:flex;gap:0.5rem;flex-shrink:0;margin-left:0.75rem">
      <button class="btn-sm btn-save-tag" data-id="${id}" data-oldname="${escape(name)}">Save</button>
      <button class="btn-sm btn-cancel-tag">Cancel</button>
    </div>
  `;
  const input = li.querySelector('.edit-inline');
  input.focus();
  input.select();
}

// ── Add ───────────────────────────────────────────────────────
addForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = newInput.value.trim();
  if (!name) return;

  errorMsg.classList.add('hidden');

  const { error } = await client.from('tags').insert({ name });

  if (error) {
    errorMsg.textContent = error.code === '23505'
      ? `"${name}" already exists.`
      : 'Failed to add. Please try again.';
    errorMsg.classList.remove('hidden');
    return;
  }

  newInput.value = '';
  loadTags();
});

// ── Edit / Save / Cancel ──────────────────────────────────────
tagList.addEventListener('click', async (e) => {
  // Edit
  const editBtn = e.target.closest('.btn-edit-tag');
  if (editBtn) {
    enterEditMode(editBtn.closest('li'), editBtn.dataset.id, editBtn.dataset.name);
    return;
  }

  // Cancel
  const cancelBtn = e.target.closest('.btn-cancel-tag');
  if (cancelBtn) {
    renderTags(allTags);
    return;
  }

  // Save
  const saveBtn = e.target.closest('.btn-save-tag');
  if (!saveBtn) return;

  const li      = saveBtn.closest('li');
  const id      = saveBtn.dataset.id;
  const oldName = saveBtn.dataset.oldname;
  const newName = li.querySelector('.edit-inline').value.trim();

  if (!newName) return;

  if (newName === oldName) {
    renderTags(allTags);
    return;
  }

  // Duplicate check (client-side, case-insensitive)
  const duplicate = allTags.find(t => t.name.toLowerCase() === newName.toLowerCase() && String(t.id) !== String(id));
  if (duplicate) {
    errorMsg.textContent = `"${newName}" already exists.`;
    errorMsg.classList.remove('hidden');
    return;
  }

  saveBtn.disabled    = true;
  saveBtn.textContent = 'Saving…';
  errorMsg.classList.add('hidden');

  // Update tag name in tags table
  const { error: tagError } = await client
    .from('tags')
    .update({ name: newName })
    .eq('id', id);

  if (tagError) {
    errorMsg.textContent = 'Failed to rename. Please try again.';
    errorMsg.classList.remove('hidden');
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

  loadTags();
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

// ── Init ──────────────────────────────────────────────────────
loadTags();
initNav();
