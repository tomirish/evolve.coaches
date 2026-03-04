# Feature Spec: Bulk Upload Web UI

**Status:** Planned — not yet implemented  
**Requested:** Coaches need to upload many videos at once without filling in optional metadata.

---

## Background

The existing `upload.html` handles one video at a time and requires a movement name + video file (minimum), with optional alt names, tags, and comments. This feature adds a `bulk-upload.html` page that lets coaches select multiple video files, confirm a movement name for each (auto-populated from the filename), and upload them all sequentially.

Optional fields (alt names, tags, comments) are intentionally omitted from the bulk form — coaches can fill those in later on the individual movement detail page.

---

## Decisions Made

| Decision | Choice | Reason |
|---|---|---|
| UI vs CLI script | Web UI (in-browser) | Coaches don't have CLI access |
| Name pre-fill | Auto-populate from filename, editable | Saves time; coaches just correct what's wrong |
| Upload order | Sequential (one at a time) | Easier to track progress + errors per video |
| Page placement | New page `bulk-upload.html` | Keeps single-upload flow clean |

---

## UI Design

### File Selection
- Drag-and-drop zone (same styling as existing `upload.html`) + `<input type="file" multiple accept="video/*">`
- After files are selected, render a queue table below the drop zone

### Upload Queue (one row per file)

```
[ #  |  Filename          |  Movement Name        |  Status      ]
[ 1  |  rdl.mp4           |  [Rdl            ]    |  Pending     ]
[ 2  |  back-squat.mp4    |  [Back Squat      ]    |  Pending     ]
[ 3  |  push-press.mp4    |  [Push Press      ]    |  Uploading 42% ]
```

- Movement name is auto-populated by stripping the file extension and replacing `-`/`_` with spaces, then title-cased (editable)
- Duplicate name check fires on blur (same `ilike` check as single upload)
- Status values: `Pending` → `Uploading X%` → `✓ Done` / `✗ Error — <message>`
- A row that errors is marked in place; upload continues to the next video

### Buttons
- **Upload All** — disabled until ≥1 file is queued and all name fields are non-empty
- **Clear** — removes pending rows (not ones already uploading/done)

### Completion
- Summary banner when the last video finishes: e.g. `"3 uploaded successfully, 1 failed."`

---

## Implementation Plan

### Files to Create

#### `bulk-upload.html`
- Same `<head>`, nav, and script loading pattern as `upload.html`
- Nav links: `Catalog`, `Upload`, `Bulk Upload` (active class on Bulk Upload)
- Multi-file drop zone `<div class="file-drop" id="file-drop">`
- Queue table `<table id="upload-queue">`
- Buttons: `<button id="upload-all-btn">` and `<button id="clear-btn">`
- Summary banner `<div id="bulk-summary" class="hidden">`
- Scripts: `config.js`, `auth.js`, `bulk-upload.js`

#### `js/bulk-upload.js`
- `requireAuth()` on load, `initNav()`
- File input `change` handler → call `buildQueue(files)`
- `buildQueue(files)` — for each file, append a row to `#upload-queue` with:
  - Auto-name: `file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())`
  - Per-row status cell, progress text, unique row ID
- Duplicate name check on each name input's `blur` event (same `ilike` query pattern as `upload.js`)
- `uploadAll()` — iterates queue rows in order, skips rows with empty names or already-done status:
  1. Set row status → `Uploading`
  2. `const urlResult = await callEdgeFunction('r2-upload-url', { filename })`
  3. `await uploadToR2(file, urlResult.uploadUrl, pct => updateRowProgress(rowId, pct))`
  4. Supabase insert: `{ name, video_path: filename, uploaded_by: session.user.id, alt_names: [], tags: [], comments: null }`
  5. Set row status → `Done` or `Error`
- `showSummary(succeeded, failed)` — reveals `#bulk-summary` with counts
- Max file size check: 500 MB per file (same as single upload)

### Files to Modify

#### `upload.html`
- Add `<a href="bulk-upload.html">Bulk Upload</a>` to `.nav-links`, after the Upload link

#### `css/style.css`
Add these classes:
- `.bulk-queue` — full-width table with column widths: auto / 1fr / 2fr / 160px
- `.bulk-row` — standard table row; row-level status modifier classes: `.is-uploading`, `.is-done`, `.is-error`
- `.bulk-status` — status cell; color-coded via modifier classes
- `.bulk-progress` — inline progress text within the status cell
- `.bulk-summary` — banner at bottom of page (green on success, amber if any errors)
- `.bulk-name-warning` — small warning text below each name input (duplicate check)

#### `tests/desktop.spec.js`
Add inside the `'Desktop layout (1280px)'` describe block:

```js
test('bulk upload: form visible, no horizontal scroll', async ({ page }) => {
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await page.goto('/bulk-upload.html');
  await expect(page.locator('#file-drop')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#upload-all-btn')).toBeVisible();
  await noHorizontalScroll(page);
});
```

---

## Task Checklist

- [ ] `bulk-upload.html` — new page
- [ ] `js/bulk-upload.js` — upload logic
- [ ] `css/style.css` — queue styles
- [ ] `upload.html` — add Bulk Upload nav link
- [ ] `tests/desktop.spec.js` — smoke test

---

## Key Code References

| What | Where |
|---|---|
| Auth helpers, `callEdgeFunction`, `uploadToR2` | `js/auth.js` |
| Single upload flow to copy patterns from | `js/upload.js` |
| Supabase `movements` insert shape | `js/upload.js` lines 121–131 |
| Existing upload form structure to mirror | `upload.html` |
| Existing CSS patterns | `css/style.css` |
| Playwright test patterns | `tests/desktop.spec.js` |

---

## File Count Limits

The browser, R2, and Supabase impose no hard limits on file count. The constraint is **time and session reliability**:

| Avg video size | Upload speed | Time per video | 25 videos | 500 videos |
|---|---|---|---|---|
| 50 MB | 10 Mbps | ~40 sec | ~17 min | ~5.5 hours |
| 100 MB | 10 Mbps | ~80 sec | ~33 min | ~11 hours |

A browser session open for several hours is vulnerable to: computer sleep, network drops, tab crash, or a single stalled upload. There is no resume capability in the web UI.

**Recommendation:** Soft-cap the web UI at **25 files per session** with a visible warning when the user exceeds it. For migrations of 50+ videos, direct coaches to the Node.js CLI script documented in `bulk-upload.md` (root), which is resumable and runs headlessly.

The soft cap should be a named constant in `bulk-upload.js` (e.g. `const MAX_FILES = 25`) so it's easy to adjust after evaluation.

---

## Open Questions

- [ ] Should the bulk upload page be accessible to all coaches, or admins only?
- [ ] Confirm the soft file cap — 25 feels right for a web session but needs sign-off
- [ ] Should failed rows be re-tryable individually without re-uploading successful ones?
