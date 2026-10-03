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
    client.from('movements').select('*').eq('id', id).is('archived_at', null).single(),
    client.from('tags').select('name').order('name')
  ]);

  if (movementResult.error || !movementResult.data) {
    contentEl.innerHTML = '<p class="status-msg error">Movement not found.</p>';
    return;
  }

  movement     = movementResult.data;
  muscleGroups = (groupsResult.data || []).map(g => g.name);

  // What plays: R2 file if there is one, else the pasted link's embed.
  movement.link = movement.video_path ? null : parseVideoLink(movement.source_url);

  if (!movement.video_path && !movement.link) {
    contentEl.innerHTML = '<p class="status-msg error">Movement has no media file.</p>';
    return;
  }

  let signedUrl = null;
  if (movement.video_path) {
    // Check cache before calling edge function (signed URLs last 24h)
    const cacheKey = `signed-url:${movement.video_path}`;
    const cached   = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { url, expires } = JSON.parse(cached);
        if (Date.now() < expires) signedUrl = url;
      } catch {}
    }
  }

  const [signedResult, uploaderResult] = await Promise.all([
    !movement.video_path ? Promise.resolve({ signedUrl: null })
      : signedUrl ? Promise.resolve({ signedUrl })
      : callEdgeFunction('r2-signed-url', { path: movement.video_path }),
    client.from('profiles').select('full_name').eq('id', movement.uploaded_by).single()
  ]);

  if (movement.video_path && (signedResult.error || !signedResult.signedUrl)) {
    contentEl.innerHTML = '<p class="status-msg error">Could not load file. Please try again.</p>';
    return;
  }

  if (movement.video_path && !signedUrl) {
    sessionStorage.setItem(`signed-url:${movement.video_path}`, JSON.stringify({
      url:     signedResult.signedUrl,
      expires: Date.now() + 60 * 60 * 1000,
    }));
  }

  movement.signedUrl    = signedResult.signedUrl;
  movement.uploaderName = uploaderResult.data?.full_name || null;

  if (params.get('edit') === '1') {
    renderEdit();
  } else {
    renderView();
  }
}

// ── Media ────────────────────────────────────────────────────
function mediaHtml(forEdit) {
  if (movement.link) return embedHtml(movement.link, movement.name, movementClip(movement));
  if (isImagePath(movement.video_path)) {
    return `<img class="video-player" src="${movement.signedUrl}" alt="${escape(movement.name)}" id="${forEdit ? 'edit-image' : 'movement-image'}"${forEdit ? '' : ' style="cursor:pointer;"'}>`;
  }
  return forEdit
    ? `<video class="video-player" controls playsinline id="video-player">
        <source src="${movement.signedUrl}">
        Your browser does not support video playback.
       </video>`
    : `<video class="video-player" controls playsinline autoplay muted loop>
        <source src="${movement.signedUrl}">
        Your browser does not support video playback.
       </video>`;
}

function sourceCreditHtml() {
  const src = parseVideoLink(movement.source_url);
  if (!src) return '';
  const label = movement.source_author
    ? `From ${escape(movement.source_author)} on ${platformLabel(src.platform)} ↗`
    : `From ${platformLabel(src.platform)} ↗`;
  return `<p class="source-credit"><a href="${escape(sourceLinkUrl(src, movementClip(movement)))}" target="_blank" rel="noopener noreferrer">${label}</a></p>`;
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
    ${mediaHtml(false)}
    ${sourceCreditHtml()}

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

  if (!movement.link && isImagePath(movement.video_path)) {
    document.getElementById('movement-image').addEventListener('click', function () {
      this.requestFullscreen().catch(() => {});
    });
  }

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
    ${mediaHtml(true)}

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
        <input type="file" id="replace-file" accept="video/*,image/*">
        <p id="replace-label">Tap to select a replacement file</p>
      </div>
      <div class="link-paste" style="margin-top: 0.75rem;">
        <label for="replace-link" class="link-paste-label">…or paste a YouTube or Instagram link</label>
        <input type="url" id="replace-link" placeholder="https://www.instagram.com/reel/…" inputmode="url" autocomplete="off"
               value="${movement.source_url ? escape(movement.source_url) : ''}">
      </div>
      ${clipFieldsHtml(movementClip(movement), null)}
      <div class="progress-wrap hidden" id="replace-progress-wrap">
        <div class="progress-bar">
          <div class="progress-fill" id="replace-progress-fill"></div>
        </div>
        <p class="progress-text" id="replace-progress-text">Uploading…</p>
      </div>
      <button type="button" class="btn btn-primary" id="replace-btn" style="margin-top: 1rem;">Replace</button>
    </section>

    ${isAdmin ? `<button type="button" class="btn btn-danger" id="delete-btn" style="margin-top: 0.5rem;">Delete Movement</button>` : ''}
  `;

  document.getElementById('cancel-btn').addEventListener('click', renderView);
  document.getElementById('edit-form').addEventListener('submit', saveChanges);
  document.getElementById('replace-file').addEventListener('change', () => {
    const file = document.getElementById('replace-file').files[0];
    if (!file) {
      document.getElementById('replace-label').textContent = 'Tap to select a replacement file';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      document.getElementById('replace-file').value = '';
      document.getElementById('replace-label').textContent = 'Tap to select a replacement file';
      document.getElementById('replace-error').textContent = 'File is too large. Maximum size is 500 MB.';
      document.getElementById('replace-error').classList.remove('hidden');
      return;
    }
    document.getElementById('replace-error').classList.add('hidden');
    document.getElementById('replace-label').textContent = file.name;
    document.getElementById('replace-link').value = '';
  });
  document.getElementById('replace-btn').addEventListener('click', replaceVideo);
  bindClipFields(result => { replaceClip = result; });
  if (isAdmin) {
    document.getElementById('delete-btn').addEventListener('click', deleteMovement);
  }
}

// ── Delete (soft) ─────────────────────────────────────────────
async function deleteMovement() {
  if (!confirm(`You are archiving "${movement.name}". It will no longer appear in the catalog. Continue?`)) return;

  const deleteBtn = document.getElementById('delete-btn');
  deleteBtn.disabled    = true;
  deleteBtn.textContent = 'Deleting…';

  const { error: dbError } = await client
    .from('movements')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);

  if (dbError) {
    deleteBtn.disabled    = false;
    deleteBtn.textContent = 'Delete Movement';
    const err = document.getElementById('error-msg');
    err.textContent = 'Failed to delete. Please try again.';
    err.classList.remove('hidden');
    return;
  }

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
  const rawLink       = document.getElementById('replace-link').value.trim();
  const replaceError  = document.getElementById('replace-error');
  const replaceSuccess= document.getElementById('replace-success');
  const replaceBtn    = document.getElementById('replace-btn');
  const progressWrap  = document.getElementById('replace-progress-wrap');
  const progressFill  = document.getElementById('replace-progress-fill');
  const progressText  = document.getElementById('replace-progress-text');

  replaceError.classList.add('hidden');
  replaceSuccess.classList.add('hidden');

  if (rawLink) { await replaceWithLink(rawLink); return; }

  if (!file) {
    replaceError.textContent = 'Please select a file or paste a link.';
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

  const urlResult = await callEdgeFunction('r2-upload-url', { filename });
  if (urlResult.error) {
    replaceError.textContent = 'Upload failed. Please try again.';
    replaceError.classList.remove('hidden');
    replaceBtn.disabled    = false;
    replaceBtn.textContent = 'Replace';
    progressWrap.classList.add('hidden');
    progressFill.style.width = '0%';
    return;
  }

  try {
    await uploadToR2(file, urlResult.uploadUrl, (pct) => {
      progressFill.style.width = `${pct}%`;
      progressText.textContent = `Uploading… ${pct}%`;
    });
  } catch {
    replaceError.textContent = 'Upload failed. Please try again.';
    replaceError.classList.remove('hidden');
    replaceBtn.disabled    = false;
    replaceBtn.textContent = 'Replace';
    progressWrap.classList.add('hidden');
    progressFill.style.width = '0%';
    return;
  }

  const oldPath = movement.video_path;

  if (oldPath) {
    // Delete old file before updating DB so the path check in r2-delete passes.
    // Non-fatal — if it fails, the orphan becomes inaccessible once the DB points to the new file.
    await callEdgeFunction('r2-delete', { path: oldPath, movementId: id });
  }

  const { error: dbError } = await client
    .from('movements')
    .update({
      video_path: filename,
      source_url: null, source_author: null, clip_start: null, clip_end: null,
      download_status: null, download_attempts: 0, download_error: null,
    })
    .eq('id', id);

  if (dbError) {
    replaceError.textContent = 'Failed to save. Please try again.';
    replaceError.classList.remove('hidden');
    replaceBtn.disabled    = false;
    replaceBtn.textContent = 'Replace';
    progressWrap.classList.add('hidden');
    progressFill.style.width = '0%';
    return;
  }

  movement.video_path = filename;
  const wasLink = !!movement.link;
  Object.assign(movement, { source_url: null, source_author: null, clip_start: null, clip_end: null, download_status: null, link: null });

  const signed = await callEdgeFunction('r2-signed-url', { path: movement.video_path });
  if (signed && signed.signedUrl) {
    movement.signedUrl = signed.signedUrl;
    if (wasLink) {
      await renderEdit();
      const success = document.getElementById('replace-success');
      success.textContent = 'File replaced successfully.';
      success.classList.remove('hidden');
      return;
    }
    const videoEl = document.querySelector('#video-player source');
    if (videoEl) {
      videoEl.src = signed.signedUrl;
      videoEl.parentElement.load();
    }
    const imgEl = document.querySelector('#edit-image');
    if (imgEl) imgEl.src = signed.signedUrl;
  }

  progressWrap.classList.add('hidden');
  progressFill.style.width = '0%';
  replaceBtn.disabled    = false;
  replaceBtn.textContent = 'Replace';
  document.getElementById('replace-file').value = '';
  document.getElementById('replace-label').textContent = 'Tap to select a replacement file';
  replaceSuccess.textContent = 'File replaced successfully.';
  replaceSuccess.classList.remove('hidden');
}

let replaceClip = { clip: null, error: null };   // latest validateClip() from the edit page

async function replaceWithLink(rawLink) {
  const replaceError   = document.getElementById('replace-error');
  const replaceBtn     = document.getElementById('replace-btn');

  const link = parseVideoLink(rawLink);
  if (!link) {
    replaceError.textContent = 'That link isn’t supported — paste a YouTube or Instagram link.';
    replaceError.classList.remove('hidden');
    return;
  }

  if (replaceClip.error) {
    replaceError.textContent = replaceClip.error;
    replaceError.classList.remove('hidden');
    return;
  }

  replaceBtn.disabled    = true;
  replaceBtn.textContent = 'Saving…';

  const info   = link.platform === 'youtube' ? await fetchYouTubeInfo(link.canonicalUrl) : null;
  const author = (info && info.author) || null;

  // Same order as the file replace: r2-delete checks the path against the row,
  // so it must run before the row stops pointing at the file.
  if (movement.video_path) {
    await callEdgeFunction('r2-delete', { path: movement.video_path, movementId: id });
  }

  const patch = {
    video_path: null, source_url: link.canonicalUrl, source_author: author,
    clip_start: replaceClip.clip ? replaceClip.clip.start : null,
    clip_end:   replaceClip.clip ? replaceClip.clip.end : null,
    download_status: 'pending', download_attempts: 0, download_error: null,
  };
  const { error } = await client.from('movements').update(patch).eq('id', id);

  replaceBtn.disabled    = false;
  replaceBtn.textContent = 'Replace';

  if (error) {
    replaceError.textContent = 'Failed to save. Please try again.';
    replaceError.classList.remove('hidden');
    return;
  }

  Object.assign(movement, patch, { link });
  await renderEdit();
  const success = document.getElementById('replace-success');
  success.textContent = 'Replaced with the link. A copy will be saved automatically.';
  success.classList.remove('hidden');
}

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

// ── Init ─────────────────────────────────────────────────────
load();
initNav();
