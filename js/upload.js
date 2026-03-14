requireAuth();

const form         = document.getElementById('upload-form');
const errorMsg     = document.getElementById('error-msg');
const submitBtn    = document.getElementById('submit-btn');
const fileInput    = document.getElementById('video-file');
const fileLabel    = document.getElementById('file-label');
const progressWrap = document.getElementById('progress-wrap');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const pillGroup    = document.getElementById('pill-group');
const nameInput    = document.getElementById('name');
const nameWarning  = document.getElementById('name-warning');
const nameOcrHint  = document.getElementById('name-ocr-hint');
const fileAiHint   = document.getElementById('file-ai-hint');

// Track whether the current name value was set by OCR (so a new video can replace it)
let ocrFilledName = false;

// ── Clear OCR hint when coach types in the name field ────────
nameInput.addEventListener('input', () => {
  ocrFilledName = false;
  nameOcrHint.classList.add('hidden');
});

// ── Duplicate name check ──────────────────────────────────────
nameInput.addEventListener('blur', async () => {
  const name = nameInput.value.trim();
  nameWarning.classList.add('hidden');
  if (!name) return;

  const { data } = await client
    .from('movements')
    .select('name')
    .ilike('name', name)
    .limit(1);

  if (data && data.length > 0) {
    nameWarning.textContent = `A movement named "${data[0].name}" already exists — check the catalog before uploading.`;
    nameWarning.classList.remove('hidden');
  }
});

// ── Load muscle groups ────────────────────────────────────────
async function loadMuscleGroups() {
  const { data, error } = await client
    .from('tags')
    .select('name')
    .order('name');

  if (error || !data) {
    pillGroup.innerHTML = '<p class="status-msg error" style="padding:0;font-size:0.875rem;">Failed to load muscle groups.</p>';
    return;
  }

  pillGroup.innerHTML = data.map(g =>
    `<label class="pill"><input type="checkbox" value="${escape(g.name)}"> ${escape(g.name)}</label>`
  ).join('');
}

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

// ── File selection ────────────────────────────────────────────
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) {
    fileLabel.textContent = 'Tap to select a video';
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    fileInput.value = '';
    fileLabel.textContent = 'Tap to select a video';
    showError('File is too large. Maximum size is 500 MB.');
    return;
  }
  errorMsg.classList.add('hidden');
  fileLabel.textContent = file.name;
  fileAiHint.classList.add('hidden');
  suggestMovementName(file);
});

// ── Submit ────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name        = document.getElementById('name').value.trim();
  const comments    = document.getElementById('comments').value.trim();
  const altNamesRaw = document.getElementById('alt-names').value.trim();
  const alt_names   = altNamesRaw ? altNamesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
  const file        = fileInput.files[0];
  const tags = Array.from(
    document.querySelectorAll('.pill-group input[type="checkbox"]:checked')
  ).map(cb => cb.value);

  if (!name) {
    showError('Movement name is required.');
    return;
  }
  if (!file) {
    showError('Please select a video file.');
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    showError('File is too large. Maximum size is 500 MB.');
    return;
  }

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Uploading…';
  errorMsg.classList.add('hidden');
  progressWrap.classList.remove('hidden');

  const ext      = file.name.split('.').pop();
  const filename = `${crypto.randomUUID()}.${ext}`;

  const urlResult = await callEdgeFunction('r2-upload-url', { filename });
  if (urlResult.error) {
    showError('Video upload failed. Please try again.');
    resetUI();
    return;
  }

  try {
    await uploadToR2(file, urlResult.uploadUrl, (pct) => {
      progressFill.style.width = `${pct}%`;
      progressText.textContent = `Uploading… ${pct}%`;
    });
  } catch {
    showError('Video upload failed. Please try again.');
    resetUI();
    return;
  }

  const session = await getSession();
  const { error: dbError } = await client
    .from('movements')
    .insert({
      name,
      alt_names,
      tags,
      comments: comments || null,
      video_path: filename,
      uploaded_by: session.user.id
    });

  if (dbError) {
    await callEdgeFunction('r2-delete', { path: filename });
    showError('Failed to save movement. Please try again.');
    resetUI();
    return;
  }

  window.location.href = 'catalog.html';
});

// ── Vision OCR ───────────────────────────────────────────────
async function suggestMovementName(file) {
  nameOcrHint.textContent = 'Detecting movement name…';
  nameOcrHint.classList.remove('hidden');

  try {
    const base64 = await extractVideoFrame(file);
    const result = await callEdgeFunction('vision-name', { image: base64 });

    if (result.error || !result.name) {
      nameOcrHint.classList.add('hidden');
      return;
    }

    // Pre-fill only if coach hasn't typed anything, or if current value was also AI-suggested
    if (!nameInput.value.trim() || ocrFilledName) {
      nameInput.value = result.name;
      ocrFilledName = true;
      nameOcrHint.textContent = 'Name suggested by AI — confirm or edit.';
    } else {
      nameOcrHint.classList.add('hidden');
    }
  } catch {
    nameOcrHint.classList.add('hidden');
  }
}

function extractVideoFrame(file) {
  return new Promise((resolve, reject) => {
    const video  = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    const url    = URL.createObjectURL(file);
    let   sought = false;

    const cleanup = () => URL.revokeObjectURL(url);
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Timed out')); }, 10000);

    const trySeek = () => {
      if (sought || !video.videoWidth || !video.videoHeight) return;
      sought = true;
      video.currentTime = Math.min(1, video.duration * 0.1);
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

    video.addEventListener('error', () => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error('Video could not be decoded'));
    });

    video.muted   = true;
    video.preload = 'auto';
    video.src     = url;
  });
}

// ── Helpers ───────────────────────────────────────────────────
function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
}

function resetUI() {
  submitBtn.disabled    = false;
  submitBtn.textContent = 'Upload Movement';
  progressWrap.classList.add('hidden');
  progressFill.style.width = '0%';
}

// ── Init ─────────────────────────────────────────────────────
loadMuscleGroups();
initNav();
