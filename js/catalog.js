requireAuth();

let allMovements = [];
let sortAsc      = true;
let activeGroup  = 'All';

const listEl    = document.getElementById('catalog-list');
const searchEl  = document.getElementById('search');
const sortBtn   = document.getElementById('sort-btn');
const filterBar = document.getElementById('filter-bar');

// ── Fetch ────────────────────────────────────────────────────
async function loadMovements() {
  listEl.innerHTML = '<p class="status-msg">Loading…</p>';

  const { data, error } = await client
    .from('movements')
    .select('id, name, muscle_groups')
    .order('name', { ascending: true });

  if (error) {
    listEl.innerHTML = '<p class="status-msg error">Failed to load movements. Please refresh.</p>';
    return;
  }

  allMovements = data;
  render();
}

// ── Render ───────────────────────────────────────────────────
function render() {
  const query = searchEl.value.trim().toLowerCase();

  let filtered = allMovements.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(query);
    const matchesGroup  = activeGroup === 'All' || (m.muscle_groups || []).includes(activeGroup);
    return matchesSearch && matchesGroup;
  });

  // Sort
  filtered.sort((a, b) => {
    const cmp = a.name.localeCompare(b.name);
    return sortAsc ? cmp : -cmp;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = '<p class="status-msg">No movements found.</p>';
    return;
  }

  listEl.innerHTML = filtered.map(m => `
    <a href="movement.html?id=${m.id}" class="movement-card">
      <div class="movement-card-body">
        <span class="movement-name">${escape(m.name)}</span>
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
loadMovements();
