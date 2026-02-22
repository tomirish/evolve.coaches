requireAuth();

const MUSCLE_GROUPS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
  'Core', 'Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Full Body'
];

const contentEl = document.getElementById('content');
const params    = new URLSearchParams(window.location.search);
const id        = params.get('id');

if (!id) window.location.href = 'catalog.html';

let movement = null;

// ── Load ─────────────────────────────────────────────────────
async function load() {
  const { data, error } = await client
    .from('movements')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    contentEl.innerHTML = '<p class="status-msg error">Movement not found.</p>';
    return;
  }

  movement = data;

  // Generate a signed URL (valid 1 hour) so the private video can be played
  const { data: signed, error: signedError } = await client.storage
    .from('videos')
    .createSignedUrl(movement.video_path, 3600);

  if (signedError || !signed) {
    contentEl.innerHTML = '<p class="status-msg error">Could not load video. Please try again.</p>';
    return;
  }

  movement.signedUrl = signed.signedUrl;
  renderView();
}

// ── View mode ────────────────────────────────────────────────
function renderView() {
  const groups = (movement.muscle_groups || []).length > 0
    ? movement.muscle_groups.map(g => `<span class="meta-tag">${escape(g)}</span>`).join('')
    : '<span class="meta-none">None listed</span>';

  contentEl.innerHTML = `
    <video class="video-player" controls playsinline>
      <source src="${movement.signedUrl}" type="video/mp4">
      Your browser does not support video playback.
    </video>

    <div class="detail-header">
      <h1 class="detail-title">${escape(movement.name)}</h1>
      <button class="btn btn-edit" id="edit-btn">Edit</button>
    </div>

    <div class="detail-section">
      <p class="detail-label">Muscle Groups</p>
      <div class="meta-tags">${groups}</div>
    </div>

    <div class="detail-section">
      <p class="detail-label">Comments</p>
      <p class="detail-comments">${movement.comments ? escape(movement.comments) : '<span class="meta-none">None</span>'}</p>
    </div>
  `;

  document.getElementById('edit-btn').addEventListener('click', renderEdit);
}

// ── Edit mode ────────────────────────────────────────────────
function renderEdit() {
  const pillsHtml = MUSCLE_GROUPS.map(g => {
    const checked = (movement.muscle_groups || []).includes(g) ? 'checked' : '';
    return `<label class="pill"><input type="checkbox" value="${g}" ${checked}> ${g}</label>`;
  }).join('');

  contentEl.innerHTML = `
    <video class="video-player" controls playsinline>
      <source src="${movement.signedUrl}" type="video/mp4">
      Your browser does not support video playback.
    </video>

    <form id="edit-form">
      <div id="error-msg" class="error hidden"></div>

      <div class="field">
        <label for="name">Movement Name <span class="required">*</span></label>
        <input type="text" id="name" value="${escape(movement.name)}" required>
      </div>

      <div class="field">
        <label>Muscle Groups</label>
        <div class="pill-group">${pillsHtml}</div>
      </div>

      <div class="field">
        <label for="comments">Comments</label>
        <textarea id="comments" rows="3">${escape(movement.comments || '')}</textarea>
      </div>

      <div class="edit-actions">
        <button type="submit" class="btn btn-primary" id="save-btn">Save Changes</button>
        <button type="button" class="btn btn-cancel" id="cancel-btn">Cancel</button>
      </div>
    </form>
  `;

  document.getElementById('cancel-btn').addEventListener('click', renderView);
  document.getElementById('edit-form').addEventListener('submit', saveChanges);
}

// ── Save ─────────────────────────────────────────────────────
async function saveChanges(e) {
  e.preventDefault();

  const name     = document.getElementById('name').value.trim();
  const comments = document.getElementById('comments').value.trim();
  const muscle_groups = Array.from(
    document.querySelectorAll('.pill-group input[type="checkbox"]:checked')
  ).map(cb => cb.value);

  if (!name) {
    const err = document.getElementById('error-msg');
    err.textContent = 'Movement name is required.';
    err.classList.remove('hidden');
    return;
  }

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled    = true;
  saveBtn.textContent = 'Saving…';

  const { error } = await client
    .from('movements')
    .update({ name, muscle_groups, comments: comments || null })
    .eq('id', id);

  if (error) {
    const err = document.getElementById('error-msg');
    err.textContent = 'Failed to save. Please try again.';
    err.classList.remove('hidden');
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save Changes';
    return;
  }

  // Update local copy and return to view
  movement.name          = name;
  movement.muscle_groups = muscle_groups;
  movement.comments      = comments || null;
  renderView();
}

// ── Helper ───────────────────────────────────────────────────
function escape(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ─────────────────────────────────────────────────────
load();
