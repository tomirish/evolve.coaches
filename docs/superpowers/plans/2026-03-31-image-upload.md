# Image Upload Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow coaches to upload photos alongside videos — one file (video or image) per movement, with HEIC/HEIF automatically converted to JPEG in the browser before upload.

**Architecture:** Add `isImagePath()` to `auth.js` as the single source of truth for detecting image vs video by file extension. Add HEIC→JPEG conversion via `heic2any` (CDN) in `upload.html`. Update `upload.js` to branch on file type in single and bulk modes. Update `movement.js` to render `<img>` instead of `<video>` for image movements. No DB migration — `video_path` already stores the file extension. R2 Edge Functions unchanged.

**Tech Stack:** Vanilla JS, Playwright (E2E tests), heic2any v0.0.4 (CDN), Supabase JS client

---

## File Map

| File | Change |
|------|--------|
| `js/auth.js` | Add `isImagePath(path)` helper |
| `upload.html` | Add heic2any CDN script; update `accept`, drop zone label, AI hint |
| `js/upload.js` | Add `maybeConvertHeic()`, `readImageAsBase64()`; update file input handler, drop handler, `suggestMovementName()`, `addFilesToQueue()`, `runBulkOcr()`, `appendBulkRow()`; fix error message copy |
| `js/movement.js` | Update `renderView()` for img vs video; update `renderEdit()` for "Replace File"; update `replaceVideo()` copy |
| `tests/helpers/fixtures.js` | Add `setupImageMovementFixture()` and `teardownImageMovementFixture()` |
| `tests/upload.spec.js` | Add tests: image single mode, HEIC conversion, bulk with images |
| `tests/movement.spec.js` | Add tests: image detail view, edit mode shows "Replace File" |

---

## Task 1: Add `isImagePath()` to auth.js

**Files:**
- Modify: `js/auth.js`
- Test: `tests/upload.spec.js` (inline evaluate test)

- [ ] **Step 1: Write the failing test**

Add to the top of the `test.describe('Upload page', ...)` block in `tests/upload.spec.js`, after the existing imports and before the describe block:

```js
test('isImagePath returns true for image extensions and false for video', async ({ page }) => {
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  // Any authenticated page loads auth.js — catalog is simplest
  await page.goto('/catalog.html');

  const results = await page.evaluate(() => ({
    jpg:  window.isImagePath('thumb.jpg'),
    jpeg: window.isImagePath('thumb.jpeg'),
    png:  window.isImagePath('photo.png'),
    gif:  window.isImagePath('anim.gif'),
    webp: window.isImagePath('img.webp'),
    avif: window.isImagePath('img.avif'),
    mp4:  window.isImagePath('clip.mp4'),
    mov:  window.isImagePath('clip.mov'),
    none: window.isImagePath(''),
  }));

  expect(results.jpg).toBe(true);
  expect(results.jpeg).toBe(true);
  expect(results.png).toBe(true);
  expect(results.gif).toBe(true);
  expect(results.webp).toBe(true);
  expect(results.avif).toBe(true);
  expect(results.mp4).toBe(false);
  expect(results.mov).toBe(false);
  expect(results.none).toBe(false);
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
source ~/.zshrc && npx playwright test tests/upload.spec.js --grep "isImagePath" --reporter=line
```

Expected: FAIL — `window.isImagePath is not a function`

- [ ] **Step 3: Add `isImagePath` to auth.js**

Add after the `escape()` function in `js/auth.js`:

```js
function isImagePath(path) {
  const ext = (path || '').split('.').pop().toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext);
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
source ~/.zshrc && npx playwright test tests/upload.spec.js --grep "isImagePath" --reporter=line
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/auth.js tests/upload.spec.js
git commit -m "feat: add isImagePath() helper to auth.js"
```

---

## Task 2: Add heic2any dependency and `maybeConvertHeic()`

**Files:**
- Modify: `upload.html` (CDN script tag)
- Modify: `js/upload.js` (add helper)
- Test: `tests/upload.spec.js`

- [ ] **Step 1: Write the failing test**

Add a new helper function and test to `tests/upload.spec.js`, inside the `test.describe('Upload page', ...)` block:

```js
test('HEIC file is silently converted to JPEG', async ({ page }) => {
  await mockVisionName(page, 'Deadlift');
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await page.goto('/upload.html');

  // Mock heic2any before file selection
  await page.evaluate(() => {
    window.heic2any = ({ blob }) =>
      Promise.resolve(new Blob(['fake-jpeg-data'], { type: 'image/jpeg' }));
  });

  await page.setInputFiles('#video-file', {
    name: 'exercise.heic',
    mimeType: 'image/heic',
    buffer: Buffer.from('fake'),
  });

  // File label should show the converted .jpg name
  await expect(page.locator('#file-label')).toHaveText('exercise.jpg', { timeout: 5000 });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
source ~/.zshrc && npx playwright test tests/upload.spec.js --grep "HEIC file" --reporter=line
```

Expected: FAIL — file label shows `exercise.heic`, not `exercise.jpg`

- [ ] **Step 3: Add heic2any CDN to upload.html**

In `upload.html`, add the heic2any script tag before the `upload.js` script tag:

```html
  <script src="https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js"></script>
  <script src="js/upload.js"></script>
```

- [ ] **Step 4: Add `maybeConvertHeic()` to upload.js**

Add after the `OCR_CONCURRENCY` block at the top of `js/upload.js`, before the `scheduleOcr` function:

```js
// ── HEIC/HEIF conversion ──────────────────────────────────────────────────────

async function maybeConvertHeic(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const isHeic = ext === 'heic' || ext === 'heif' ||
                 file.type === 'image/heic' || file.type === 'image/heif';
  if (!isHeic) return file;
  const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
  const converted = Array.isArray(blob) ? blob[0] : blob;
  const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
  return new File([converted], newName, { type: 'image/jpeg' });
}
```

- [ ] **Step 5: Update the file input change handler to be async and apply conversion**

Replace the existing `fileInput.addEventListener('change', ...)` block in `js/upload.js`:

```js
fileInput.addEventListener('change', async () => {
  const rawFiles = Array.from(fileInput.files);
  if (!rawFiles.length) return;
  const files = await Promise.all(rawFiles.map(maybeConvertHeic));
  if (files.length === 1) {
    activateSingle(files[0]);
  } else {
    activateBulk(files);
  }
  fileInput.value = '';
});
```

- [ ] **Step 6: Update the drag-drop handler to apply conversion**

Replace the existing `fileDropEl.addEventListener('drop', ...)` block:

```js
fileDropEl.addEventListener('drop', async (e) => {
  e.preventDefault();
  fileDropEl.style.borderColor = '';
  const rawFiles = Array.from(e.dataTransfer.files).filter(f =>
    f.type.startsWith('video/') || f.type.startsWith('image/')
  );
  if (!rawFiles.length) return;
  const files = await Promise.all(rawFiles.map(maybeConvertHeic));
  if (currentMode === 'bulk') {
    addFilesToQueue(files);
    return;
  }
  if (files.length === 1) activateSingle(files[0]);
  else activateBulk(files);
});
```

- [ ] **Step 7: Run test to confirm it passes**

```bash
source ~/.zshrc && npx playwright test tests/upload.spec.js --grep "HEIC file" --reporter=line
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add upload.html js/upload.js tests/upload.spec.js
git commit -m "feat: add HEIC-to-JPEG conversion on upload via heic2any"
```

---

## Task 3: Image support — upload.html labels and single mode

**Files:**
- Modify: `upload.html` (accept attr, labels)
- Modify: `js/upload.js` (accept images, single mode preview, AI name, error copy)
- Test: `tests/upload.spec.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/upload.spec.js` inside the describe block:

```js
test('drop zone label mentions photos', async ({ page }) => {
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await page.goto('/upload.html');
  await expect(page.locator('#file-label')).toContainText('photos');
});

test('selecting a JPEG shows preview thumbnail without play overlay', async ({ page }) => {
  await mockVisionName(page, 'Push-up');
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await page.goto('/upload.html');

  await page.setInputFiles('#video-file', {
    name: 'exercise.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('fake'),
  });

  await expect(page.locator('#single-preview')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#single-preview .thumb-play-overlay')).toBeHidden();
});

test('AI pre-fills movement name after image is selected', async ({ page }) => {
  await mockVisionName(page, 'Push-up');
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await page.goto('/upload.html');

  await page.setInputFiles('#video-file', {
    name: 'exercise.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('fake'),
  });

  await expect(page.locator('#name')).toHaveValue('Push-up', { timeout: 5000 });
  await expect(page.locator('#name-ocr-hint')).toContainText('suggested by AI');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
source ~/.zshrc && npx playwright test tests/upload.spec.js --grep "photos|JPEG shows|image is selected" --reporter=line
```

Expected: all FAIL

- [ ] **Step 3: Update upload.html**

In `upload.html`:

1. Change the file input accept attribute:
```html
<input type="file" id="video-file" accept="video/*,image/*" multiple>
```

2. Change the drop zone label:
```html
<p id="file-label">Drop videos or photos here or click to browse</p>
```

3. Change the AI hint:
```html
<p id="file-ai-hint" style="font-size:0.8rem;margin-top:0.375rem;">AI will suggest a movement name for each file.</p>
```

- [ ] **Step 4: Add `readImageAsBase64()` to upload.js**

Add after `maybeConvertHeic()` in `js/upload.js`:

```js
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
```

- [ ] **Step 5: Update `suggestMovementName()` in upload.js to branch on image vs video**

Replace the existing `suggestMovementName` function:

```js
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
```

- [ ] **Step 6: Fix error message copy in form submit handler**

In the form submit handler in `js/upload.js`, change:
```js
if (!file)  { showSingleError('Please select a video file.'); return; }
```
to:
```js
if (!file)  { showSingleError('Please select a file.'); return; }
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
source ~/.zshrc && npx playwright test tests/upload.spec.js --grep "photos|JPEG shows|image is selected" --reporter=line
```

Expected: all PASS

- [ ] **Step 8: Run full upload suite to confirm no regressions**

```bash
source ~/.zshrc && npx playwright test tests/upload.spec.js --reporter=line
```

Expected: all PASS

- [ ] **Step 9: Commit**

```bash
git add upload.html js/upload.js tests/upload.spec.js
git commit -m "feat: image support in single upload mode"
```

---

## Task 4: Image support — bulk upload mode

**Files:**
- Modify: `js/upload.js` (`addFilesToQueue`, `runBulkOcr`, `appendBulkRow`)
- Test: `tests/upload.spec.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/upload.spec.js`:

```js
test('bulk mode accepts a mix of image and video files', async ({ page }) => {
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await page.goto('/upload.html');

  await page.setInputFiles('#video-file', [
    { name: 'exercise.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake1') },
    { name: 'clip.mp4',     mimeType: 'video/mp4',  buffer: Buffer.from('fake2') },
  ]);

  // Both rows appear in the queue
  await expect(page.locator('.bulk-row')).toHaveCount(2, { timeout: 10000 });
});

test('image row in bulk mode has no play overlay', async ({ page }) => {
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await page.goto('/upload.html');

  await page.setInputFiles('#video-file', [
    { name: 'exercise.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake1') },
    { name: 'clip.mp4',     mimeType: 'video/mp4',  buffer: Buffer.from('fake2') },
  ]);

  await expect(page.locator('.bulk-row')).toHaveCount(2, { timeout: 10000 });

  const rows = page.locator('.bulk-row');
  const imageRow = rows.filter({ hasText: 'exercise.jpg' }).first();
  const videoRow = rows.filter({ hasText: 'clip.mp4' }).first();

  // Image row: no play overlay (or hidden)
  await expect(imageRow.locator('.thumb-play-overlay')).toBeHidden();
  // Video row: play overlay visible
  await expect(videoRow.locator('.thumb-play-overlay')).toBeVisible();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
source ~/.zshrc && npx playwright test tests/upload.spec.js --grep "bulk mode accepts|image row in bulk" --reporter=line
```

Expected: FAIL — image files filtered out, only 1 row appears; play overlay visible on image row

- [ ] **Step 3: Update `addFilesToQueue()` to accept images**

In `js/upload.js`, replace the filter in `addFilesToQueue`:

```js
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
```

- [ ] **Step 4: Update `runBulkOcr()` to use direct image reading for images**

In `js/upload.js`, replace `runBulkOcr`:

```js
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
```

- [ ] **Step 5: Update `appendBulkRow()` to hide play overlay for images and disable click for images**

In `js/upload.js`, in `appendBulkRow`, replace the `.bulk-thumb` section of `row.innerHTML` and the click handler:

Change the thumbnail HTML in `row.innerHTML` from:
```js
    <div class="bulk-thumb">
      <img src="" class="hidden" alt="">
      <div class="bulk-thumb-placeholder"></div>
      <div class="thumb-play-overlay">&#9654;</div>
    </div>
```
to:
```js
    <div class="bulk-thumb">
      <img src="" class="hidden" alt="">
      <div class="bulk-thumb-placeholder"></div>
      ${!isImagePath(item.file.name) ? '<div class="thumb-play-overlay">&#9654;</div>' : ''}
    </div>
```

And replace the existing `.bulk-thumb` click listener:
```js
  row.querySelector('.bulk-thumb').addEventListener('click', () => {
    const i = queue.find(q => q.id === row.dataset.id);
    if (i && i.file && !isImagePath(i.file.name)) openVideoModal(i.file);
  });
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
source ~/.zshrc && npx playwright test tests/upload.spec.js --grep "bulk mode accepts|image row in bulk" --reporter=line
```

Expected: PASS

- [ ] **Step 7: Run full upload suite**

```bash
source ~/.zshrc && npx playwright test tests/upload.spec.js --reporter=line
```

Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add js/upload.js tests/upload.spec.js
git commit -m "feat: image support in bulk upload mode"
```

---

## Task 5: Movement detail page — image rendering

**Files:**
- Modify: `tests/helpers/fixtures.js` (add image fixture)
- Modify: `js/movement.js` (renderView — img vs video)
- Modify: `tests/movement.spec.js` (add image tests)

- [ ] **Step 1: Add image fixture helpers to fixtures.js**

In `tests/helpers/fixtures.js`, add after `setupMovementFixture`:

```js
async function setupImageMovementFixture(email, password) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError) throw new Error(`Fixture auth failed: ${authError.message}`);

  const { data: { user } } = await client.auth.getUser();

  const { data, error } = await client.from('movements').insert({
    name:        '__test_image_fixture__',
    alt_names:   [],
    tags:        [],
    comments:    null,
    video_path:  'test-fixture.jpg',
    uploaded_by: user.id,
  }).select('id').single();

  if (error) throw new Error(`Image fixture insert failed: ${error.message}`);
  return { client, id: data.id };
}

async function teardownImageMovementFixture(client, id) {
  if (!client || !id) return;
  const { error } = await client.from('movements').delete().eq('id', id);
  if (error) throw new Error(`Image fixture cleanup failed: ${error.message}`);
}
```

And add them to the `module.exports`:
```js
module.exports = {
  setupMovementFixture,
  teardownMovementFixture,
  setupImageMovementFixture,
  teardownImageMovementFixture,
};
```

- [ ] **Step 2: Write the failing test**

In `tests/movement.spec.js`, update the existing `require('./helpers/fixtures')` line at the top to include the new exports:

```js
const { setupMovementFixture, teardownMovementFixture, setupImageMovementFixture, teardownImageMovementFixture } = require('./helpers/fixtures');
```

Then add a new describe block after the existing one:

```js
let imageFixture;

test.describe('Movement detail page — image', () => {
  test.describe.configure({ retries: 2 });

  test.beforeAll(async () => {
    imageFixture = await setupImageMovementFixture(COACH_EMAIL, COACH_PASSWORD);
  });

  test.afterAll(async () => {
    await teardownImageMovementFixture(imageFixture?.client, imageFixture?.id);
  });

  test('image movement shows img element not video', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${imageFixture.id}`);

    await expect(page.locator('img.video-player')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('video.video-player')).toHaveCount(0);
  });

  test('image movement edit button shows the edit form', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${imageFixture.id}`);

    await expect(page.locator('#edit-btn')).toBeVisible({ timeout: 20000 });
    await page.locator('#edit-btn').click();
    await expect(page.locator('#edit-form')).toBeVisible();
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
source ~/.zshrc && npx playwright test tests/movement.spec.js --grep "image movement shows" --reporter=line
```

Expected: FAIL — `video.video-player` is rendered instead of `img.video-player`

- [ ] **Step 4: Update `renderView()` in movement.js**

Replace the `contentEl.innerHTML = \`...\`` assignment inside `renderView()` with a version that branches on media type. The `<video>` block is replaced by:

```js
function renderView() {
  const groups = (movement.tags || []).length > 0
    ? movement.tags.map(g => `<span class="meta-tag">${escape(g)}</span>`).join('')
    : '<span class="meta-none">None listed</span>';

  const altNames = (movement.alt_names || []).length > 0
    ? movement.alt_names.map(n => `<span class="meta-tag">${escape(n)}</span>`).join('')
    : '<span class="meta-none">None</span>';

  const mediaHtml = isImagePath(movement.video_path)
    ? `<img class="video-player" src="${movement.signedUrl}" alt="${escape(movement.name)}" id="movement-image" style="cursor:pointer;">`
    : `<video class="video-player" controls playsinline autoplay muted loop>
        <source src="${movement.signedUrl}" type="video/mp4">
        Your browser does not support video playback.
       </video>`;

  contentEl.innerHTML = `
    ${mediaHtml}

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

  if (isImagePath(movement.video_path)) {
    document.getElementById('movement-image').addEventListener('click', function () {
      this.requestFullscreen().catch(() => {});
    });
  }

  document.getElementById('edit-btn').addEventListener('click', renderEdit);
}
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
source ~/.zshrc && npx playwright test tests/movement.spec.js --grep "image movement" --reporter=line
```

Expected: PASS

- [ ] **Step 6: Run full movement suite**

```bash
source ~/.zshrc && npx playwright test tests/movement.spec.js --reporter=line
```

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add js/movement.js tests/movement.spec.js tests/helpers/fixtures.js
git commit -m "feat: render img element for image movements on detail page"
```

---

## Task 6: Movement edit mode — "Replace File"

**Files:**
- Modify: `js/movement.js` (`renderEdit`, `replaceVideo`)
- Test: `tests/movement.spec.js`

- [ ] **Step 1: Write the failing test**

Add to the `Movement detail page — image` describe block in `tests/movement.spec.js`:

```js
  test('image movement edit mode shows Replace File heading', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${imageFixture.id}`);

    await expect(page.locator('#edit-btn')).toBeVisible({ timeout: 20000 });
    await page.locator('#edit-btn').click();

    await expect(page.locator('.admin-section-title')).toHaveText('Replace File');
    await expect(page.locator('#replace-btn')).toHaveText('Replace File');
    await expect(page.locator('#replace-label')).toContainText('replacement file');
  });
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
source ~/.zshrc && npx playwright test tests/movement.spec.js --grep "Replace File heading" --reporter=line
```

Expected: FAIL — heading reads "Replace Video"

- [ ] **Step 3: Update `renderEdit()` in movement.js — Replace File section**

Inside `renderEdit()`, replace the "Replace Video" section of `contentEl.innerHTML`:

```js
      <section class="admin-section" style="margin-top: 2rem;">
        <h2 class="admin-section-title">Replace File</h2>
        <div id="replace-error" class="error hidden"></div>
        <div id="replace-success" class="success hidden"></div>
        <div class="file-drop" id="replace-drop">
          <input type="file" id="replace-file" accept="video/*,image/*">
          <p id="replace-label">Tap to select a replacement file</p>
        </div>
        <div class="progress-wrap hidden" id="replace-progress-wrap">
          <div class="progress-bar">
            <div class="progress-fill" id="replace-progress-fill"></div>
          </div>
          <p class="progress-text" id="replace-progress-text">Uploading…</p>
        </div>
        <button type="button" class="btn btn-primary" id="replace-btn" style="margin-top: 1rem;">Replace File</button>
      </section>
```

Also update the `replace-file` change handler inside `renderEdit()`:

```js
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
  });
```

- [ ] **Step 4: Update `replaceVideo()` copy in movement.js**

In `replaceVideo()`, update all user-facing strings that say "video" to say "file":

```js
  if (!file) {
    replaceError.textContent = 'Please select a file.';
    replaceError.classList.remove('hidden');
    return;
  }
```

```js
  // On upload error (appears twice — both PUT failure and DB failure):
  replaceError.textContent = 'Upload failed. Please try again.';
  replaceBtn.disabled    = false;
  replaceBtn.textContent = 'Replace File';
```

```js
  // On DB error:
  replaceError.textContent = 'Failed to save. Please try again.';
  replaceBtn.disabled    = false;
  replaceBtn.textContent = 'Replace File';
```

```js
  // On success:
  replaceSuccess.textContent = 'File replaced successfully.';
```

And update the initial button state set during upload:
```js
  replaceBtn.disabled    = true;
  replaceBtn.textContent = 'Uploading…';
```
(this one is fine — "Uploading…" is correct for both)

Also update the reset after upload attempt (all `replaceBtn.textContent = 'Replace Video'` → `'Replace File'`).

- [ ] **Step 5: Run test to confirm it passes**

```bash
source ~/.zshrc && npx playwright test tests/movement.spec.js --grep "Replace File heading" --reporter=line
```

Expected: PASS

- [ ] **Step 6: Run full test suite**

```bash
source ~/.zshrc && npx playwright test --reporter=line
```

Expected: all PASS (48 existing + new image tests)

- [ ] **Step 7: Commit**

```bash
git add js/movement.js tests/movement.spec.js
git commit -m "feat: replace file section accepts images, updates copy"
```

---

## Task 7: Final verification and push

- [ ] **Step 1: Run full test suite one final time**

```bash
source ~/.zshrc && npm test
```

Expected: all tests pass

- [ ] **Step 2: Start local dev server and do a quick visual check**

```bash
python3 -m http.server 8080
```

Navigate to `http://localhost:8080/upload.html`. Confirm:
- Drop zone label reads "Drop videos or photos here or click to browse"
- File input accepts images (click browse, verify image files are selectable)

- [ ] **Step 3: Push to develop**

```bash
git push origin develop
```

CI will run the full Playwright suite and auto-deploy to main on pass.
