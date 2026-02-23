requireAuth();

let allMovements = [];
let sortAsc      = true;
let activeGroup  = 'All';

const listEl    = document.getElementById('catalog-list');
const searchEl  = document.getElementById('search');
const sortBtn   = document.getElementById('sort-btn');
const filterBar = document.getElementById('filter-bar');

// ── Fetch ────────────────────────────────────────────────────
async function load() {
  listEl.innerHTML = '<p class="status-msg">Loading…</p>';

  const [movementsResult, groupsResult] = await Promise.all([
    client.from('movements').select('id, name, muscle_groups, alt_names').order('name'),
    client.from('muscle_groups').select('name').order('name')
  ]);

  if (movementsResult.error) {
    listEl.innerHTML = '<p class="status-msg error">Failed to load movements. Please refresh.</p>';
    return;
  }

  // Expand each movement into one entry per name (primary + each alt)
  allMovements = [];
  movementsResult.data.forEach(m => {
    allMovements.push({ id: m.id, name: m.name, muscle_groups: m.muscle_groups, alias: null });
    (m.alt_names || []).forEach(alt => {
      allMovements.push({ id: m.id, name: alt, muscle_groups: m.muscle_groups, alias: m.name });
    });
  });
  renderFilterPills(groupsResult.data || []);
  render();
  initNav();
}

// ── Filter pills ─────────────────────────────────────────────
function renderFilterPills(groups) {
  const pills = groups.map(g =>
    `<button class="filter-pill" data-group="${escape(g.name)}">${escape(g.name)}</button>`
  ).join('');
  filterBar.insertAdjacentHTML('beforeend', pills);
}

// ── Render ───────────────────────────────────────────────────
function render() {
  const query = searchEl.value.trim().toLowerCase();

  let filtered = allMovements.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(query);
    const matchesGroup  = activeGroup === 'All' || (m.muscle_groups || []).includes(activeGroup);
    return matchesSearch && matchesGroup;
  });

  filtered.sort((a, b) => {
    const cmp = a.name.localeCompare(b.name);
    return sortAsc ? cmp : -cmp;
  });

  if (filtered.length === 0) {
    const msg = allMovements.length === 0
      ? 'No movements yet. <a href="upload.html">Upload the first one.</a>'
      : 'No movements match your search.';
    listEl.innerHTML = `<p class="status-msg">${msg}</p>`;
    return;
  }

  listEl.innerHTML = filtered.map(m => `
    <a href="movement.html?id=${m.id}" class="movement-card">
      <div class="movement-card-body">
        <span class="movement-name">${escape(m.name)}</span>
        ${m.alias ? `<span class="movement-alias">→ ${escape(m.alias)}</span>` : ''}
        <span class="movement-groups">${formatGroups(m.muscle_groups)}</span>
      </div>
      <span class="movement-arrow">›</span>
    </a>
  `).join('');
}

// ── Helpers ──────────────────────────────────────────────────
function formatGroups(groups) {
  if (!groups || groups.length === 0) return '';
  return groups.join(' · ');
}

function escape(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Events ───────────────────────────────────────────────────
searchEl.addEventListener('input', render);

sortBtn.addEventListener('click', () => {
  sortAsc = !sortAsc;
  sortBtn.textContent = sortAsc ? 'A–Z' : 'Z–A';
  render();
});

filterBar.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-pill');
  if (!btn) return;

  document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeGroup = btn.dataset.group;
  render();
});

// ── Init ─────────────────────────────────────────────────────
load();
