# Image Upload Support — Design Spec
_2026-03-31_

## Overview

Allow coaches to upload photos in addition to videos. Each movement card holds one file — video or image, never both. The storage layer (R2), auth, and DB schema require no changes.

## Media type detection

`video_path` already stores `UUID.ext`. At runtime, detect media type by checking the lowercase extension against a known image list:

```
IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif']
```

Anything not in that list is treated as video. A shared helper `isImagePath(path)` in `auth.js` handles this consistently across pages.

Note: HEIC/HEIF are excluded from this list because they are converted to JPEG before upload (see below) — they will never appear in R2.

## Dependencies

- `heic2any` added as a CDN `<script>` tag in `upload.html` (loaded before `upload.js`)

## Upload page (`upload.html` + `upload.js`)

- `accept` attribute on file input: `video/*,image/*`
- Drop zone drag-drop filter: allow `image/*` alongside `video/*`
- Drop zone label: "Drop videos or photos here or click to browse"
- AI hint text: "AI will suggest a movement name for each file."

**HEIC/HEIF conversion:**
- Detect by extension (`.heic`, `.heif`) or MIME type (`image/heic`, `image/heif`) before anything else
- Convert to JPEG using `heic2any` (CDN: `https://cdn.jsdelivr.net/npm/heic2any`) — runs entirely in the browser, no server changes
- The resulting `Blob` is wrapped into a `File` with a `.jpg` extension and used in place of the original for all subsequent steps (preview, AI name, upload)
- Applies to both single and bulk mode

**Single mode — images:**
- Skip `extractVideoFrameWithDataUrl` — use `FileReader.readAsDataURL` to read the image directly as base64
- Pass base64 to the existing `vision-name` edge function (no changes needed there)
- Show the actual photo as the preview thumbnail (no play overlay)

**Single mode — videos:** unchanged.

**Bulk mode:**
- Drop filter: accept `image/*` as well as `video/*`
- For image items: read image directly as base64 for AI name suggestion; show photo as thumbnail with no play overlay
- For video items: unchanged (frame extraction + play overlay)

## Movement detail page (`movement.js`)

**View mode (`renderView`):**
- Detect media type via `isImagePath(movement.video_path)`
- **Image:** render `<img class="video-player">` (reuses existing CSS class for consistent sizing); clicking the image calls `imgEl.requestFullscreen()`
- **Video:** unchanged `<video>` element with autoplay, muted, loop

**Edit mode (`renderEdit`):**
- "Replace Video" section heading → "Replace File"
- `accept` on the replace file input: `video/*,image/*`
- Drop zone label: "Tap to select a replacement file"

**Replace handler (`replaceVideo`):**
- Error/button text: "file" instead of "video" throughout
- Logic unchanged — upload → update DB → delete old — works identically for images

## What doesn't change

- R2 Edge Functions (`r2-upload-url`, `r2-signed-url`, `r2-delete`): no changes
- Supabase DB schema: no migration — `video_path` field name stays as-is
- Catalog page: text-only cards, no thumbnails — no changes needed
- Admin page: no changes needed
- Max file size: 500 MB cap applies to both (generous for images but harmless)
- Signed URL caching in `movement.js`: works identically for images

## Testing

- Upload a HEIC photo — verify it converts to JPEG silently, uploads correctly, renders on detail page
- Upload a single photo (JPEG/PNG) — verify AI name suggestion, preview thumbnail (no play overlay), movement saved and visible in catalog
- Upload a single video — verify existing flow unchanged
- Upload a mix of photos and videos in bulk — verify name detection, correct thumbnail treatment per file type
- View a photo movement — verify `<img>` renders in player area, clicking goes fullscreen
- Edit a photo movement — verify "Replace File" label, can replace with another photo or a video
- View a video movement after all changes — verify nothing regressed
