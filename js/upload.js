requireAuth();

const form       = document.getElementById('upload-form');
const errorMsg   = document.getElementById('error-msg');
const submitBtn  = document.getElementById('submit-btn');
const fileInput  = document.getElementById('video-file');
const fileLabel  = document.getElementById('file-label');
const progressWrap = document.getElementById('progress-wrap');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');

// Show selected filename in the drop zone
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  fileLabel.textContent = file ? file.name : 'Tap to select a video';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name     = document.getElementById('name').value.trim();
  const comments = document.getElementById('comments').value.trim();
  const file     = fileInput.files[0];
  const muscle_groups = Array.from(
    document.querySelectorAll('.pill-group input[type="checkbox"]:checked')
  ).map(cb => cb.value);

  // Validate
  if (!name) {
    showError('Movement name is required.');
    return;
  }
  if (!file) {
    showError('Please select a video file.');
    return;
  }

  // Lock UI
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Uploading…';
  errorMsg.classList.add('hidden');
  progressWrap.classList.remove('hidden');

  // Build a unique filename
  const ext      = file.name.split('.').pop();
  const filename = `${crypto.randomUUID()}.${ext}`;

  // Upload video to Supabase Storage
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
    showError('Video upload failed. Please try again.');
    resetUI();
    return;
  }

  // Insert movement record
  const session = await getSession();
  const { error: dbError } = await client
    .from('movements')
    .insert({
      name,
      muscle_groups,
      comments: comments || null,
      video_path: storageData.path,
      uploaded_by: session.user.id
    });

  if (dbError) {
    // Clean up the uploaded file so storage stays tidy
    await client.storage.from('videos').remove([filename]);
    showError('Failed to save movement. Please try again.');
    resetUI();
    return;
  }

  // Success
  window.location.href = 'catalog.html';
});

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
