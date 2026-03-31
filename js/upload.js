requireAuth();

// ── Shared elements ───────────────────────────────────────────────────────────
const fileInput   = document.getElementById('video-file');
const fileDropEl  = document.getElementById('file-drop');
const fileLabel   = document.getElementById('file-label');
const fileAiHint  = document.getElementById('file-ai-hint');
const mainPage    = document.getElementById('main-page');
const singleMode  = document.getElementById('single-mode');
const bulkMode    = document.getElementById('bulk-mode');

// ── Single mode elements ──────────────────────────────────────────────────────
const form         = document.getElementById('upload-form');
const errorMsg     = document.getElementById('error-msg');
const submitBtn    = document.getElementById('submit-btn');
const nameInput    = document.getElementById('name');
const nameWarning  = document.getElementById('name-warning');
const nameOcrHint  = document.getElementById('name-ocr-hint');
const pillGroup    = document.getElementById('pill-group');
const progressWrap = document.getElementById('progress-wrap');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');

// ── Bulk mode elements ────────────────────────────────────────────────────────
const bulkQueueEl   = document.getElementById('bulk-queue');
const actionsTop    = document.getElementById('bulk-actions-top');
const actionsBottom = document.getElementById('bulk-actions-bottom');
const summaryEl     = document.getElementById('bulk-summary');
const uploadBtnTop  = document.getElementById('upload-btn-top');
const uploadBtnBot  = document.getElementById('upload-btn-bottom');

// ── Shared state ──────────────────────────────────────────────────────────────
let currentMode   = 'single';
let allTags       = [];

// ── Single mode state ─────────────────────────────────────────────────────────
let ocrFilledName = false;
const MAX_FILE_SIZE = 500 * 1024 * 1024;

// ── Bulk mode state ───────────────────────────────────────────────────────────
let queue     = [];
let uploading = false;

// ── OCR concurrency limiter ───────────────────────────────────────────────────
const OCR_CONCURRENCY = 4;
let ocrInFlight = 0;
const ocrPending = [];

// ── HEIC/HEIF conversion ──────────────────────────────────────────────────────

async function maybeConvertHeic(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const isHeic = ext === 'heic' || ext === 'heif' ||
                 file.type === 'image/heic' || file.type === 'image/heif';
  if (!isHeic) return file;
  if (typeof heic2any === 'undefined') return file;  // CDN failed to load — pass through
  const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
  const converted = Array.isArray(blob) ? blob[0] : blob;
  const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
  return new File([converted], newName, { type: 'image/jpeg' });
}

function readImageAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      resolve({ base64: dataUrl.split(',')[1], dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function scheduleOcr(item) {
  ocrPending.push(item);
  drainOcrQueue();
}

function drainOcrQueue() {
  while (ocrInFlight < OCR_CONCURRENCY && ocrPending.length > 0) {
    const next = ocrPending.shift();
    ocrInFlight++;
    runBulkOcr(next).finally(() => {
      ocrInFlight--;
      drainOcrQueue();
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO PREVIEW MODAL
// ─────────────────────────────────────────────────────────────────────────────

let modalObjectUrl = null;

function openVideoModal(file) {
  if (modalObjectUrl) URL.revokeObjectURL(modalObjectUrl);
  modalObjectUrl = URL.createObjectURL(file);
  const video = document.getElementById('modal-video');
  video.src = modalObjectUrl;
  video.muted = true;
  video.play();
  const modal = document.getElementById('video-modal');
  modal.classList.remove('hidden');
  modal.onclick = (e) => { if (e.target === modal) closeVideoModal(); };
}

function closeVideoModal() {
  const modal = document.getElementById('video-modal');
  modal.classList.add('hidden');
  const video = document.getElementById('modal-video');
  video.pause();
  video.src = '';
  if (modalObjectUrl) { URL.revokeObjectURL(modalObjectUrl); modalObjectUrl = null; }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeVideoModal();
});

// ─────────────────────────────────────────────────────────────────────────────
// FILE INPUT
// ─────────────────────────────────────────────────────────────────────────────

fileInput.addEventListener('change', async () => {
  const rawFiles = Array.from(fileInput.files);
  if (!rawFiles.length) return;
  fileInput.value = '';
  try {
    const files = await Promise.all(rawFiles.map(maybeConvertHeic));
    if (files.length === 1) {
      activateSingle(files[0]);
    } else {
      activateBulk(files);
    }
  } catch {
    showSingleError('Could not process file. Please try a JPEG or MP4 instead.');
  }
});

fileDropEl.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileDropEl.style.borderColor = 'var(--accent)';
});
fileDropEl.addEventListener('dragleave', () => {
  fileDropEl.style.borderColor = '';
});
fileDropEl.addEventListener('drop', async (e) => {
  e.preventDefault();
  fileDropEl.style.borderColor = '';
  const rawFiles = Array.from(e.dataTransfer.files).filter(f =>
    f.type.startsWith('video/') || f.type.startsWith('image/')
  );
  if (!rawFiles.length) return;
  try {
    const files = await Promise.all(rawFiles.map(maybeConvertHeic));
    if (currentMode === 'bulk') {
      addFilesToQueue(files);
      return;
    }
    if (files.length === 1) activateSingle(files[0]);
    else activateBulk(files);
  } catch {
    showSingleError('Could not process file. Please try a JPEG or MP4 instead.');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE MODE
// ─────────────────────────────────────────────────────────────────────────────

function activateSingle(file) {
  if (currentMode === 'bulk') {
    queue = [];
    bulkQueueEl.innerHTML = '';
    bulkMode.classList.add('hidden');
    mainPage.classList.remove('page-wide');
  }
  currentMode = 'single';
  fileDropEl.classList.add('compact');
  singleMode.classList.remove('hidden');
  fileAiHint.classList.add('hidden');

  if (file.size > MAX_FILE_SIZE) {
    showSingleError('File is too large. Maximum size is 500 MB.');
    fileLabel.textContent = 'Tap to select videos — or drag here';
    return;
  }
  errorMsg.classList.add('hidden');
  fileLabel.textContent = file.name;
  nameInput.placeholder = 'e.g. Barbell Back Squat';
  nameInput.closest('.field').classList.remove('needs-name');
  document.getElementById('single-preview').classList.add('hidden');
  suggestMovementName(file);
}

// ── Duplicate name check ──────────────────────────────────────────────────────
nameInput.addEventListener('input', () => {
  ocrFilledName = false;
  nameOcrHint.classList.add('hidden');
  nameInput.closest('.field').classList.toggle('needs-name', !nameInput.value.trim());
});

nameInput.addEventListener('blur', async () => {
  const name = nameInput.value.trim();
  nameWarning.classList.add('hidden');
  if (!name) return;
  const { data } = await client.from('movements').select('name').ilike('name', name).limit(1);
  if (data && data.length > 0) {
    nameWarning.textContent = `A movement named "${data[0].name}" already exists — check the catalog before uploading.`;
    nameWarning.classList.remove('hidden');
  }
});

// ── Single form submit ────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name        = nameInput.value.trim();
  const comments    = document.getElementById('comments').value.trim();
  const altNamesRaw = document.getElementById('alt-names').value.trim();
  const alt_names   = altNamesRaw ? altNamesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
  const file        = fileInput.files[0] || singleFile;
  const tags = Array.from(
    document.querySelectorAll('.pill-group input[type="checkbox"]:checked')
  ).map(cb => cb.value);

  if (!name) { showSingleError('Movement name is required.'); return; }
  if (!file)  { showSingleError('Please select a file.'); return; }
  if (file.size > MAX_FILE_SIZE) { showSingleError('File is too large. Maximum size is 500 MB.'); return; }

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Uploading…';
  errorMsg.classList.add('hidden');
  progressWrap.classList.remove('hidden');

  const ext      = file.name.split('.').pop();
  const filename = `${crypto.randomUUID()}.${ext}`;

  const urlResult = await callEdgeFunction('r2-upload-url', { filename });
  if (urlResult.error) { showSingleError('Video upload failed. Please try again.'); resetSingleUI(); return; }

  try {
    await uploadToR2(file, urlResult.uploadUrl, (pct) => {
      progressFill.style.width = `${pct}%`;
      progressText.textContent = `Uploading… ${pct}%`;
    });
  } catch {
    showSingleError('Video upload failed. Please try again.');
    resetSingleUI();
    return;
  }

  const session = await getSession();
  const { error: dbError } = await client.from('movements').insert({
    name, alt_names, tags, comments: comments || null,
    video_path: filename, uploaded_by: session.user.id,
  });

  if (dbError) {
    await callEdgeFunction('r2-delete', { path: filename });
    showSingleError('Failed to save movement. Please try again.');
    resetSingleUI();
    return;
  }

  window.location.href = 'catalog.html';
});

// ── Single mode OCR ───────────────────────────────────────────────────────────
let singleFile = null;

async function suggestMovementName(file) {
  singleFile = file;
  nameOcrHint.textContent = 'Detecting movement name…';
  nameOcrHint.classList.remove('hidden');
  try {
    const { base64, dataUrl } = isImagePath(file.name)
      ? await readImageAsBase64(file)
      : await extractVideoFrameWithDataUrl(file);

    const previewEl   = document.getElementById('single-preview');
    const thumbEl     = document.getElementById('single-thumb');
    const playOverlay = previewEl ? previewEl.querySelector('.thumb-play-overlay') : null;

    if (previewEl && thumbEl) {
      thumbEl.src = dataUrl;
      previewEl.classList.remove('hidden');
      if (isImagePath(file.name)) {
        if (playOverlay) playOverlay.classList.add('hidden');
        previewEl.onclick = null;
      } else {
        if (playOverlay) playOverlay.classList.remove('hidden');
        previewEl.onclick = () => openVideoModal(file);
      }
    }

    const result = await callEdgeFunction('vision-name', { image: base64 });
    if (result.error || !result.name) {
      nameInput.placeholder = 'AI couldn\'t read a name from this file — please type it in.';
      nameInput.closest('.field').classList.add('needs-name');
      nameOcrHint.classList.add('hidden');
      return;
    }
    if (!nameInput.value.trim() || ocrFilledName) {
      nameInput.value = result.name;
      ocrFilledName   = true;
      nameOcrHint.textContent = 'Name suggested by AI — confirm or edit.';
      nameOcrHint.classList.remove('hidden');
    } else {
      nameOcrHint.classList.add('hidden');
    }
  } catch {
    nameInput.placeholder = 'AI couldn\'t read a name from this file — please type it in.';
    nameOcrHint.classList.add('hidden');
  }
}

function showSingleError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
}

function resetSingleUI() {
  submitBtn.disabled    = false;
  submitBtn.textContent = 'Upload Movement';
  progressWrap.classList.add('hidden');
  progressFill.style.width = '0%';
}

// ── Load tags for single mode pills ──────────────────────────────────────────
async function loadTags() {
  const { data, error } = await client.from('tags').select('name').order('name');
  if (error || !data) {
    pillGroup.innerHTML = '<p class="status-msg error" style="padding:0;font-size:0.875rem;">Failed to load tags.</p>';
    return;
  }
  allTags = data.map(t => t.name);
  pillGroup.innerHTML = allTags.map(name =>
    `<label class="pill"><input type="checkbox" value="${escape(name)}"> ${escape(name)}</label>`
  ).join('') + `<span class="bulk-tag-add-wrap"><input type="text" class="bulk-tag-input single-tag-input" placeholder="Add tag" onkeydown="if(event.key==='Enter'){event.preventDefault();addNewTagSingle(this)}"><button type="button" class="bulk-tag-add-btn" onclick="addNewTagSingle(this.previousElementSibling)">+</button></span>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// BULK MODE
// ─────────────────────────────────────────────────────────────────────────────

function activateBulk(files) {
  if (currentMode !== 'bulk') {
    currentMode = 'bulk';
    fileDropEl.classList.add('compact');
    singleMode.classList.add('hidden');
    bulkMode.classList.remove('hidden');
    mainPage.classList.add('page-wide');
    fileLabel.textContent = 'Drop more videos here or click to browse';
    fileAiHint.classList.add('hidden');
  }
  addFilesToQueue(files);
}

function addFilesToQueue(files) {
  for (const file of files) {
    if (!file.type.startsWith('video/') && !file.type.startsWith('image/')) continue;
    const item = { id: crypto.randomUUID(), file, name: '', tags: [], status: 'detecting', progress: 0, errorMsg: '' };
    queue.push(item);
    appendBulkRow(item);
    scheduleOcr(item);
  }
  syncBulkUI();
}

// ── Bulk OCR ──────────────────────────────────────────────────────────────────
async function runBulkOcr(item) {
  try {
    const { base64, dataUrl } = isImagePath(item.file.name)
      ? await readImageAsBase64(item.file)
      : await extractVideoFrameWithDataUrl(item.file);

    const thumbImg = document.querySelector(`[data-id="${item.id}"] .bulk-thumb img`);
    if (thumbImg) {
      thumbImg.src = dataUrl;
      thumbImg.classList.remove('hidden');
      const placeholder = document.querySelector(`[data-id="${item.id}"] .bulk-thumb-placeholder`);
      if (placeholder) placeholder.classList.add('hidden');
    }

    const result = await callEdgeFunction('vision-name', { image: base64 });
    item.name = (result && result.name) ? result.name : '';
  } catch {
    item.name = '';
  }
  item.status = 'ready';
  updateBulkRow(item.id);
  syncBulkUI();
}

// ── Bulk upload all ───────────────────────────────────────────────────────────
async function uploadAll() {
  if (uploading) return;
  uploading = true;
  syncBulkUI();

  const session = await getSession();

  for (const item of queue) {
    if (item.status !== 'ready') continue;

    const nameEl = document.querySelector(`[data-id="${item.id}"] .bulk-name`);
    item.name = nameEl ? nameEl.value.trim() : item.name.trim();

    if (!item.name) {
      item.status   = 'error';
      item.errorMsg = 'Name required';
      updateBulkRow(item.id);
      continue;
    }

    item.status   = 'uploading';
    item.progress = 0;
    updateBulkRow(item.id);

    const ext      = item.file.name.split('.').pop() || 'mp4';
    const filename = `${crypto.randomUUID()}.${ext}`;

    const urlResult = await callEdgeFunction('r2-upload-url', { filename });
    if (urlResult.error) {
      item.status   = 'error';
      item.errorMsg = 'Could not get upload URL';
      updateBulkRow(item.id);
      continue;
    }

    try {
      await uploadToR2(item.file, urlResult.uploadUrl, (pct) => {
        item.progress = pct;
        updateBulkRow(item.id);
      });
    } catch {
      item.status   = 'error';
      item.errorMsg = 'Upload failed';
      updateBulkRow(item.id);
      continue;
    }

    const { error: dbError } = await client.from('movements').insert({
      name:        item.name,
      alt_names:   [],
      tags:        item.tags,
      comments:    null,
      video_path:  filename,
      uploaded_by: session.user.id,
    });

    if (dbError) {
      await callEdgeFunction('r2-delete', { path: filename });
      item.status   = 'error';
      item.errorMsg = 'Failed to save';
      updateBulkRow(item.id);
      continue;
    }

    item.status = 'done';
    updateBulkRow(item.id);
  }

  uploading = false;
  syncBulkUI();
}

// ── Remove bulk row ───────────────────────────────────────────────────────────
function removeBulkItem(id) {
  const idx = queue.findIndex(i => i.id === id);
  if (idx !== -1) queue.splice(idx, 1);
  const row = document.querySelector(`[data-id="${id}"]`);
  if (row) row.remove();
  if (queue.length === 0) {
    bulkMode.classList.add('hidden');
    singleMode.classList.add('hidden');
    fileDropEl.classList.remove('compact');
    mainPage.classList.remove('page-wide');
    fileLabel.textContent = 'Tap to select videos — or drag here';
    fileAiHint.classList.remove('hidden');
    currentMode = 'single';
  }
  syncBulkUI();
}

async function addNewTag(id, input) {
  const name = input.value.trim();
  if (!name) return;
  if (allTags.includes(name)) {
    // Tag already exists — just select it for this row
    autoSelectTag(id, name);
    input.value = '';
    return;
  }

  input.disabled = true;
  const { error } = await client.from('tags').insert({ name });
  input.disabled = false;
  if (error) { input.placeholder = 'Error — try again'; return; }

  allTags.push(name);
  allTags.sort();

  // Add the new pill to every row's expanded tag list
  const pillHtml = (rowId) =>
    `<label class="bulk-pill"><input type="checkbox" value="${escape(name)}" onchange="onBulkTagChange('${rowId}','${escape(name)}',this.checked)">${escape(name)}</label>`;

  document.querySelectorAll('.bulk-pill-group').forEach(group => {
    const rowId = group.closest('.bulk-row')?.dataset.id;
    if (!rowId) return;
    const wrap = group.querySelector('.bulk-tag-add-wrap');
    const pill = document.createElement('label');
    pill.className = 'bulk-pill';
    pill.innerHTML = `<input type="checkbox" value="${escape(name)}" onchange="onBulkTagChange('${rowId}','${escape(name)}',this.checked)">${escape(name)}`;
    group.insertBefore(pill, wrap);
  });

  // Also add to single-mode pill group if visible
  if (currentMode === 'single') {
    const pg = document.getElementById('pill-group');
    if (pg) {
      pg.innerHTML += `<label class="pill"><input type="checkbox" value="${escape(name)}"> ${escape(name)}</label>`;
    }
  }

  // Auto-select for this row
  autoSelectTag(id, name);
  input.value = '';
}

async function addNewTagSingle(input) {
  const name = input.value.trim();
  if (!name) return;
  if (allTags.includes(name)) {
    // Already exists — just check it
    const existing = pillGroup.querySelector(`input[value="${CSS.escape(name)}"]`);
    if (existing) existing.checked = true;
    input.value = '';
    return;
  }
  input.disabled = true;
  const { error } = await client.from('tags').insert({ name });
  input.disabled = false;
  if (error) { input.placeholder = 'Error — try again'; return; }

  allTags.push(name);
  allTags.sort();
  const wrap = pillGroup.querySelector('.bulk-tag-add-wrap');
  const pill = document.createElement('label');
  pill.className = 'pill';
  pill.innerHTML = `<input type="checkbox" value="${escape(name)}" checked> ${escape(name)}`;
  pillGroup.insertBefore(pill, wrap);
  input.value = '';
}

function autoSelectTag(id, name) {
  const pill = document.querySelector(`#tags-pills-${id} input[value="${CSS.escape(name)}"]`);
  if (pill && !pill.checked) {
    pill.checked = true;
    onBulkTagChange(id, name, true);
  }
}

function toggleBulkTags(id) {
  const pills = document.getElementById(`tags-pills-${id}`);
  if (pills) pills.classList.toggle('hidden');
}

function onBulkTagChange(id, tag, checked) {
  const item = queue.find(i => i.id === id);
  if (!item) return;
  if (checked) {
    if (!item.tags.includes(tag)) item.tags.push(tag);
  } else {
    item.tags = item.tags.filter(t => t !== tag);
  }
  const btn = document.getElementById(`tags-btn-${id}`);
  if (btn) btn.textContent = item.tags.length ? `Tags · ${item.tags.length}` : 'Tags';
}


// ── Bulk UI sync ──────────────────────────────────────────────────────────────
function syncBulkUI() {
  if (queue.length === 0) return;

  actionsTop.classList.remove('hidden');
  actionsBottom.classList.remove('hidden');

  const total      = queue.length;
  const detecting  = queue.filter(i => i.status === 'detecting').length;
  const ready      = queue.filter(i => i.status === 'ready').length;
  const done       = queue.filter(i => i.status === 'done').length;
  const errors     = queue.filter(i => i.status === 'error').length;
  const allFinished = done + errors === total;

  if (allFinished && total > 0) {
    summaryEl.classList.remove('hidden');
    summaryEl.className = errors > 0 ? 'bulk-summary warning' : 'bulk-summary success';
    summaryEl.textContent = errors > 0
      ? `${done} uploaded, ${errors} failed.`
      : `All ${done} movement${done !== 1 ? 's' : ''} uploaded successfully.`;

    const catalogLink = '<a href="catalog.html" class="btn btn-primary bulk-upload-btn">View Catalog</a>';
    document.querySelector('#bulk-actions-top .bulk-action-buttons').innerHTML = catalogLink;
    const botBtn = document.getElementById('upload-btn-bottom');
    if (botBtn) {
      const a = document.createElement('a');
      a.href = 'catalog.html';
      a.className = 'btn btn-primary bulk-upload-btn';
      a.textContent = 'View Catalog';
      botBtn.replaceWith(a);
    }
    return;
  }

  const canUpload = detecting === 0 && ready > 0 && !uploading;
  const label     = uploading ? 'Uploading…' : `Upload All (${ready})`;

  [uploadBtnTop, uploadBtnBot].forEach(btn => {
    if (!btn || btn.tagName === 'A') return;
    btn.textContent = label;
    btn.disabled    = !canUpload;
  });

  if (detecting > 0) {
    summaryEl.classList.remove('hidden');
    summaryEl.className   = 'bulk-summary';
    summaryEl.textContent = `Detecting names… ${detecting} of ${total} remaining`;
  } else {
    summaryEl.classList.add('hidden');
  }
}

// ── Bulk row rendering ────────────────────────────────────────────────────────
function appendBulkRow(item) {
  const tagsHtml = allTags.length
    ? allTags.map(t =>
        `<label class="bulk-pill">
          <input type="checkbox" value="${escape(t)}" onchange="onBulkTagChange('${item.id}','${escape(t)}',this.checked)">
          ${escape(t)}
        </label>`
      ).join('')
    : '';

  const row = document.createElement('div');
  row.className  = 'bulk-row';
  row.dataset.id = item.id;
  row.innerHTML  = `
    <div class="bulk-thumb">
      <img src="" class="hidden" alt="">
      <div class="bulk-thumb-placeholder"></div>
      ${!isImagePath(item.file.name) ? '<div class="thumb-play-overlay">&#9654;</div>' : ''}
    </div>
    <div class="bulk-row-body">
      <div class="bulk-name-row">
        <input type="text" class="bulk-name bulk-name-empty" value="" placeholder="Movement name — required"
          oninput="this.dataset.edited='1'; this.classList.toggle('bulk-name-empty', !this.value.trim()); this.closest('.bulk-row').classList.toggle('bulk-row-needs-name', !this.value.trim())">
        ${tagsHtml ? `<button type="button" class="bulk-tags-toggle" id="tags-btn-${item.id}" onclick="toggleBulkTags('${item.id}')">Tags</button>` : ''}
      </div>
      ${tagsHtml !== undefined ? `<div class="bulk-pill-group hidden" id="tags-pills-${item.id}">${tagsHtml}<span class="bulk-tag-add-wrap"><input type="text" class="bulk-tag-input" placeholder="Add tag" onkeydown="if(event.key==='Enter'){event.preventDefault();addNewTag('${item.id}',this)}"><button type="button" class="bulk-tag-add-btn" onclick="addNewTag('${item.id}',this.previousElementSibling)">+</button></span></div>` : ''}
    </div>
    <div class="bulk-status bulk-status-detecting">Detecting…</div>
    <button class="bulk-remove" type="button" title="Remove">×</button>
  `;

  row.querySelector('.bulk-name').addEventListener('input', (e) => {
    const item = queue.find(i => i.id === row.dataset.id);
    if (item) item.name = e.target.value;
  });
  row.querySelector('.bulk-remove').addEventListener('click', () => {
    const i = queue.find(q => q.id === row.dataset.id);
    if (i && (i.status === 'uploading' || i.status === 'done')) return;
    removeBulkItem(row.dataset.id);
  });
  row.querySelector('.bulk-thumb').addEventListener('click', () => {
    const i = queue.find(q => q.id === row.dataset.id);
    if (i && i.file && !isImagePath(i.file.name)) openVideoModal(i.file);
  });

  bulkQueueEl.appendChild(row);
}

function updateBulkRow(id) {
  const item = queue.find(i => i.id === id);
  if (!item) return;
  const row = document.querySelector(`[data-id="${id}"]`);
  if (!row) return;

  const statusEl = row.querySelector('.bulk-status');
  if (statusEl) {
    statusEl.className   = `bulk-status bulk-status-${item.status}`;
    statusEl.textContent = bulkStatusText(item);
  }

  if (item.status === 'ready') {
    const nameEl = row.querySelector('.bulk-name');
    if (nameEl && !nameEl.dataset.edited) {
      nameEl.value = item.name;
      const needsName = !nameEl.value.trim();
      nameEl.classList.toggle('bulk-name-empty', needsName);
      row.classList.toggle('bulk-row-needs-name', needsName);
      if (needsName) {
        nameEl.placeholder = 'AI couldn\'t read a name — please enter Movement Name';
      }
    }
  }

  const removeBtn = row.querySelector('.bulk-remove');
  if (removeBtn) removeBtn.disabled = item.status === 'uploading' || item.status === 'done';
}

function bulkStatusText(item) {
  switch (item.status) {
    case 'detecting': return 'Detecting…';
    case 'ready':     return '';
    case 'uploading': return `${item.progress}%`;
    case 'done':      return '✓ Done';
    case 'error':     return item.errorMsg || 'Error';
    default:          return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED: FRAME EXTRACTION
// (top-level so Playwright tests can patch window.extractVideoFrame)
// ─────────────────────────────────────────────────────────────────────────────

function extractVideoFrame(file) {
  return new Promise((resolve, reject) => {
    const video  = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    const url    = URL.createObjectURL(file);
    let sought   = false;

    const cleanup = () => URL.revokeObjectURL(url);
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Timed out')); }, 20000);

    const doSeek = () => {
      video.currentTime = Math.min(1, (video.duration || 0) * 0.1);
    };

    const trySeek = () => {
      if (sought || !video.videoWidth || !video.videoHeight) return;
      sought = true;
      // iOS Safari requires play() before seeking a local file
      const p = video.play();
      if (p !== undefined) {
        p.then(() => { video.pause(); doSeek(); }).catch(() => doSeek());
      } else {
        doSeek();
      }
    };

    video.addEventListener('seeked', () => {
      clearTimeout(timeout);
      const maxW    = 800;
      const scale   = Math.min(1, maxW / video.videoWidth);
      canvas.width  = Math.round(video.videoWidth  * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      cleanup();
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    });

    video.addEventListener('loadedmetadata', trySeek);
    video.addEventListener('loadeddata',     trySeek);
    video.addEventListener('canplay',        trySeek);
    video.addEventListener('error', () => { clearTimeout(timeout); cleanup(); reject(new Error('Decode error')); });
    video.muted       = true;
    video.playsInline = true;
    video.preload     = 'auto';
    video.src         = url;
  });
}

// Variant that also returns the dataUrl for thumbnail display
function extractVideoFrameWithDataUrl(file) {
  return new Promise((resolve, reject) => {
    const video  = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    const url    = URL.createObjectURL(file);
    let sought   = false;

    const cleanup = () => URL.revokeObjectURL(url);
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Timed out')); }, 20000);

    const doSeek = () => {
      video.currentTime = Math.min(1, (video.duration || 0) * 0.1);
    };

    const trySeek = () => {
      if (sought || !video.videoWidth || !video.videoHeight) return;
      sought = true;
      // iOS Safari requires play() before seeking a local file
      const p = video.play();
      if (p !== undefined) {
        p.then(() => { video.pause(); doSeek(); }).catch(() => doSeek());
      } else {
        doSeek();
      }
    };

    video.addEventListener('seeked', () => {
      clearTimeout(timeout);
      const maxW    = 800;
      const scale   = Math.min(1, maxW / video.videoWidth);
      canvas.width  = Math.round(video.videoWidth  * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      cleanup();
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ base64: dataUrl.split(',')[1], dataUrl });
    });

    video.addEventListener('loadedmetadata', trySeek);
    video.addEventListener('loadeddata',     trySeek);
    video.addEventListener('canplay',        trySeek);
    video.addEventListener('error', () => { clearTimeout(timeout); cleanup(); reject(new Error('Decode error')); });
    video.muted       = true;
    video.playsInline = true;
    video.preload     = 'auto';
    video.src         = url;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────

loadTags();
initNav();
