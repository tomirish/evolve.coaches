requireAuth();

const contentEl = document.getElementById('content');
const params    = new URLSearchParams(window.location.search);
const id        = params.get('id');

if (!id) window.location.href = 'catalog.html';

let movement     = null;
let muscleGroups = [];

// ── Load ─────────────────────────────────────────────────────
async function load() {
  const [movementResult, groupsResult] = await Promise.all([
    client.from('movements').select('*').eq('id', id).single(),
    client.from('tags').select('name').order('name')
  ]);

  if (movementResult.error || !movementResult.data) {
    contentEl.innerHTML = '<p class="status-msg error">Movement not found.</p>';
    return;
  }

  movement     = movementResult.data;
  muscleGroups = (groupsResult.data || []).map(g => g.name);

  const [signedResult, uploaderResult] = await Promise.all([
    client.storage.from('videos').createSignedUrl(movement.video_path, 86400),
    client.from('profiles').select('full_name').eq('id', movement.uploaded_by).single()
  ]);

  if (signedResult.error || !signedResult.data) {
    contentEl.innerHTML = '<p class="status-msg error">Could not load video. Please try again.</p>';
    return;
  }

  movement.signedUrl    = signedResult.data.signedUrl;
  movement.uploaderName = uploaderResult.data?.full_name || null;
  renderView();
  initNav();
}

// ── View mode ────────────────────────────────────────────────
function renderView() {
  const groups = (movement.tags || []).length > 0
    ? movement.tags.map(g => `<span class="meta-tag">${escape(g)}</span>`).join('')
    : '<span class="meta-none">None listed</span>';

  const altNames = (movement.alt_names || []).length > 0
    ? movement.alt_names.map(n => `<span class="meta-tag">${escape(n)}</span>`).join('')
    : '<span class="meta-none">None</span>';

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
      <p class="detail-label">Also Known As</p>
      <div class="meta-tags">${altNames}</div>
    </div>

    <div class="detail-section">
      <p class="detail-label">Tags</p>
      <div class="meta-tags">${groups}</div>
    </div>

    <div class="detail-section">
      <p class="detail-label">Comments</p>
      <p class="detail-comments">${movement.comments ? escape(movement.comments) : '<span class="meta-none">None</span>'}</p>
    </div>

    <div class="detail-section">
      <p class="detail-label">Uploaded by</p>
      <p class="detail-comments">${movement.uploaderName ? escape(movement.uploaderName) : '<span class="meta-none">Unknown</span>'}</p>
    </div>
  `;

  document.getElementById('edit-btn').addEventListener('click', renderEdit);
}

// ── Edit mode ────────────────────────────────────────────────
async function renderEdit() {
  const profile  = await getProfile();
  const isAdmin  = profile && profile.role === 'admin';

  const pillsHtml = muscleGroups.map(g => {
    const checked = (movement.tags || []).includes(g) ? 'checked' : '';
    return `<label class="pill"><input type="checkbox" value="${escape(g)}" ${checked}> ${escape(g)}</label>`;
  }).join('');

  contentEl.innerHTML = `
    <video class="video-player" controls playsinline id="video-player">
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
        <label for="alt-names">Alternative Names</label>
        <input type="text" id="alt-names" value="${escape((movement.alt_names || []).join(', '))}">
        <p class="field-hint">Other names coaches use for this movement — separate with commas.</p>
      </div>

      <div class="field">
        <label>Tags</label>
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

    <section class="admin-section" style="margin-top: 2rem;">
      <h2 class="admin-section-title">Replace Video</h2>
      <div id="replace-error" class="error hidden"></div>
      <div id="replace-success" class="success hidden"></div>
      <div class="file-drop" id="replace-drop">
        <input type="file" id="replace-file" accept="video/*">
        <p id="replace-label">Tap to select a replacement video</p>
      </div>
      <div class="progress-wrap hidden" id="replace-progress-wrap">
        <div class="progress-bar">
          <div class="progress-fill" id="replace-progress-fill"></div>
        </div>
        <p class="progress-text" id="replace-progress-text">Uploading…</p>
      </div>
      <button type="button" class="btn btn-primary" id="replace-btn" style="margin-top: 1rem;">Replace Video</button>
    </section>

    ${isAdmin ? `<button type="button" class="btn btn-danger" id="delete-btn" style="margin-top: 0.5rem;">Delete Movement</button>` : ''}
  `;

  document.getElementById('cancel-btn').addEventListener('click', renderView);
  document.getElementById('edit-form').addEventListener('submit', saveChanges);
  document.getElementById('replace-file').addEventListener('change', () => {
    const file = document.getElementById('replace-file').files[0];
    if (!file) {
      document.getElementById('replace-label').textContent = 'Tap to select a replacement video';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      document.getElementById('replace-file').value = '';
      document.getElementById('replace-label').textContent = 'Tap to select a replacement video';
      document.getElementById('replace-error').textContent = 'File is too large. Maximum size is 500 MB.';
      document.getElementById('replace-error').classList.remove('hidden');
      return;
    }
    document.getElementById('replace-error').classList.add('hidden');
    document.getElementById('replace-label').textContent = file.name;
  });
  document.getElementById('replace-btn').addEventListener('click', replaceVideo);
  if (isAdmin) {
    document.getElementById('delete-btn').addEventListener('click', deleteMovement);
  }
}

// ── Delete ────────────────────────────────────────────────────
async function deleteMovement() {
  if (!confirm(`Delete "${movement.name}"? This will permanently remove the video and cannot be undone.`)) return;

  const deleteBtn = document.getElementById('delete-btn');
  deleteBtn.disabled    = true;
  deleteBtn.textContent = 'Deleting…';

  const { error: dbError } = await client
    .from('movements')
    .delete()
    .eq('id', id);

  if (dbError) {
    deleteBtn.disabled    = false;
    deleteBtn.textContent = 'Delete Movement';
    const err = document.getElementById('error-msg');
    err.textContent = 'Failed to delete. Please try again.';
    err.classList.remove('hidden');
    return;
  }

  const { error: storageError } = await client.storage.from('videos').remove([movement.video_path]);
  if (storageError) console.error('Storage delete failed:', movement.video_path, storageError);

  window.location.href = 'catalog.html';
}

// ── Save ─────────────────────────────────────────────────────
async function saveChanges(e) {
  e.preventDefault();

  const name        = document.getElementById('name').value.trim();
  const comments    = document.getElementById('comments').value.trim();
  const altNamesRaw = document.getElementById('alt-names').value.trim();
  const alt_names   = altNamesRaw ? altNamesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
  const tags = Array.from(
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
    .update({ name, alt_names, tags, comments: comments || null })
    .eq('id', id);

  if (error) {
    const err = document.getElementById('error-msg');
    err.textContent = 'Failed to save. Please try again.';
    err.classList.remove('hidden');
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save Changes';
    return;
  }

  movement.name          = name;
  movement.alt_names     = alt_names;
  movement.tags = tags;
  movement.comments      = comments || null;
  renderView();
}

// ── Replace video ────────────────────────────────────────────
async function replaceVideo() {
  const file          = document.getElementById('replace-file').files[0];
  const replaceError  = document.getElementById('replace-error');
  const replaceSuccess= document.getElementById('replace-success');
  const replaceBtn    = document.getElementById('replace-btn');
  const progressWrap  = document.getElementById('replace-progress-wrap');
  const progressFill  = document.getElementById('replace-progress-fill');
  const progressText  = document.getElementById('replace-progress-text');

  replaceError.classList.add('hidden');
  replaceSuccess.classList.add('hidden');

  if (!file) {
    replaceError.textContent = 'Please select a video file.';
    replaceError.classList.remove('hidden');
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    replaceError.textContent = 'File is too large. Maximum size is 500 MB.';
    replaceError.classList.remove('hidden');
    return;
  }

  replaceBtn.disabled    = true;
  replaceBtn.textContent = 'Uploading…';
  progressWrap.classList.remove('hidden');

  const ext      = file.name.split('.').pop();
  const filename = `${crypto.randomUUID()}.${ext}`;

  const { data: storageData, error: storageError } = await client.storage
    .from('videos')
    .upload(filename, file, {
      onUploadProgress: (progress) => {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        progressFill.style.width = `${pct}%`;
        progressText.textContent = `Uploading… ${pct}%`;
      }
    });

  if (storageError) {
    replaceError.textContent = 'Upload failed. Please try again.';
    replaceError.classList.remove('hidden');
    replaceBtn.disabled    = false;
    replaceBtn.textContent = 'Replace Video';
    progressWrap.classList.add('hidden');
    progressFill.style.width = '0%';
    return;
  }

  const oldPath = movement.video_path;

  const { error: dbError } = await client
    .from('movements')
    .update({ video_path: storageData.path })
    .eq('id', id);

  if (dbError) {
    await client.storage.from('videos').remove([filename]);
    replaceError.textContent = 'Failed to save. Please try again.';
    replaceError.classList.remove('hidden');
    replaceBtn.disabled    = false;
    replaceBtn.textContent = 'Replace Video';
    progressWrap.classList.add('hidden');
    progressFill.style.width = '0%';
    return;
  }

  const { error: oldFileError } = await client.storage.from('videos').remove([oldPath]);
  if (oldFileError) console.error('Storage delete failed for old video:', oldPath, oldFileError);
  movement.video_path = storageData.path;

  const { data: signed } = await client.storage
    .from('videos')
    .createSignedUrl(movement.video_path, 86400);

  if (signed) {
    movement.signedUrl = signed.signedUrl;
    const videoEl = document.querySelector('#video-player source');
    if (videoEl) {
      videoEl.src = signed.signedUrl;
      videoEl.parentElement.load();
    }
  }

  progressWrap.classList.add('hidden');
  progressFill.style.width = '0%';
  replaceBtn.disabled    = false;
  replaceBtn.textContent = 'Replace Video';
  document.getElementById('replace-file').value = '';
  document.getElementById('replace-label').textContent = 'Tap to select a replacement video';
  replaceSuccess.textContent = 'Video replaced successfully.';
  replaceSuccess.classList.remove('hidden');
}

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

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
