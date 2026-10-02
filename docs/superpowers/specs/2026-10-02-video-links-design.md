# Video Links — Design

**Date:** 2026-10-02
**Status:** Approved in conversation, awaiting spec review

## Goal

Coaches find good movement demos on Instagram and YouTube. They should be able to paste a link and get a normal movement — name, alt names, tags, comments — that plays inside the movement page just like an uploaded video.

Tom does not want the library to depend on third-party hosts staying up or creators keeping posts public. So every linked video is also **copied into R2 automatically**, with no manual step.

**Who:** all coaches (same permissions as uploading a file).
**Content:** short clips — roughly 10-second demos of a single movement (Reels, Shorts, short YouTube videos). No long videos, no start/end trimming.

## Approach

Embed first, archive in the background:

1. Coach pastes a link and saves. The movement appears in the catalog **immediately** and plays via the platform's embed player.
2. A worker on the NAS polls Supabase every 5 minutes, downloads pending links with `yt-dlp`, uploads the file to R2, and sets `video_path`.
3. From then on the movement plays from R2 exactly like an upload. The original link is kept for credit and reference.

**Why the NAS, not a server:** YouTube and Instagram aggressively block downloads from datacenter IPs (Supabase Edge Functions, Cloudflare Workers, GitHub Actions, cloud VMs). The NAS is on a residential IP. Edge Functions and Workers also cannot run `yt-dlp` at all. The NAS being offline is harmless — rows wait in the queue and coaches keep seeing the embed.

**Why polling, not email:** the NAS reaches out; nothing reaches in. No inbox rules or email parsing to break, and the queue is visible in the database and the Admin page.

**Accepted trade-off:** downloading violates YouTube's and Instagram's terms of service. Tom accepted this knowingly for a private library of ~8 coaches.

## Supported links

One link per upload. Only these shapes are accepted:

| Platform | Accepted forms | Canonical form stored |
|---|---|---|
| YouTube | `youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/shorts/ID` (with or without `www.`/`m.`) | `https://www.youtube.com/watch?v=ID` |
| Instagram | `instagram.com/p/ID/`, `instagram.com/reel/ID/`, `instagram.com/reels/ID/` | `https://www.instagram.com/p/ID/` or `https://www.instagram.com/reel/ID/` |

IDs must match `^[A-Za-z0-9_-]+$`. All query parameters are dropped — share links carry tracking tokens (`?si=`, `?is=`, `?stkn=`, `?igsh=`) that identify the sharer. Anything else gets a friendly error naming the supported sites.

## Data model

New columns on `movements` (one migration):

| Column | Type | Meaning |
|---|---|---|
| `source_url` | `text` | Canonical link. Null for file uploads. |
| `source_author` | `text` | Creator name, for the credit line. |
| `download_status` | `text` | `pending` / `done` / `failed`. Null for file uploads. CHECK constraint on the values. |
| `download_attempts` | `int NOT NULL DEFAULT 0` | Failed attempts so far. |
| `download_error` | `text` | Reason for the last failure. |

Deliberately **not** named `archive_*` — `archived_at` already means soft-deleted, and the two must not be confused.

A CHECK constraint on `source_url` enforces the canonical patterns above at the database level, so a crafted request cannot store an arbitrary URL even though coaches can write their own rows under RLS.

`video_path` is already nullable (verify against the live schema before writing the migration). No RLS policy changes: coaches already insert and update their own movements.

**What plays — one rule, one helper:**
- `video_path` set → play from R2 (existing path, unchanged).
- else `source_url` set → embed.

## Browser side

### Shared helpers (auth.js)

Following the existing rule that shared utilities live in auth.js (like `isImagePath`):

- `parseVideoLink(url)` → `{ platform, id, canonicalUrl, embedUrl }` or `null`. The embed URL is built **only from the parsed ID**, never from raw input.
  - YouTube: `https://www.youtube-nocookie.com/embed/ID?autoplay=1&mute=1&loop=1&playlist=ID&playsinline=1` — autoplays muted and loops, close to the native player.
  - Instagram: `https://www.instagram.com/p/ID/embed/` (or `/reel/ID/embed/`).
- `embedHtml(movement)` → the `<iframe>` markup, so movement.js and upload.js render embeds identically.

### Upload page

- Below the drop zone: a text field, **"…or paste a YouTube or Instagram link"**.
- A valid link opens the existing single-movement form (name, alt names, tags, comments) with the embed as the preview, in place of the file thumbnail.
- **Name suggestion:** for YouTube, the browser calls YouTube oEmbed (`https://www.youtube.com/oembed?url=…&format=json` — verified 2026-10-02 to return CORS headers for the site origin). Pre-fill the name with the title up to the first `|`, trimmed, with the hint "Suggested from the YouTube title". `author_name` is saved as `source_author`. If oEmbed fails, the name is simply left blank.
- Instagram: no name suggestion (its oEmbed "title" is the whole caption, and it has no CORS headers). `source_author` is filled later by the worker.
- No AI vision naming for links.
- **Duplicate check:** if a non-deleted movement already has the same `source_url`, show a warning in the same style as the existing duplicate-name warning.
- Save inserts the row with `source_url`, `source_author`, `download_status = 'pending'`, `video_path = null`.
- Pasting a link and dropping files are mutually exclusive — choosing one clears the other. Bulk mode stays file-only.

### Movement page

- Plays per the rule above. While pending, the embed is shown (no "archiving" message to coaches — it just works).
- When `source_url` is set, a credit line: **"From {source_author} on {YouTube|Instagram} ↗"** linking to `source_url` (`rel="noopener noreferrer"`, new tab). Falls back to "From YouTube ↗" when the author is unknown.
- **Replace** accepts either a file or a link:
  - File → link: update the row (`source_url`, `source_author`, `download_status = 'pending'`, `download_attempts = 0`, `video_path = null`), then delete the old R2 file. This follows the existing upload → update DB → delete old order.
  - Link → file: existing upload flow, plus clearing `source_url`, `source_author` and the `download_*` columns.
- Edit (name, alt names, tags, comments) is unchanged.

### Catalog

No change — link movements are ordinary cards.

### Admin Videos tab

- Thumbnail: R2 file when `video_path` is set (existing). Otherwise YouTube's `https://i.ytimg.com/vi/ID/hqdefault.jpg`, or an Instagram placeholder.
- Badge: **"Archiving…"** for `pending`, **"Archive failed"** for `failed`, with `download_error` as its tooltip.
- **Retry** button on failed rows → `download_status = 'pending'`, `download_attempts = 0`, `download_error = null`.

## NAS worker

Lives in **dev.tools**: `automation/archive_evolve_links/`, following the `backup_evolve_coaches` pattern (bash, runs directly on the NAS host — not Docker — `op read` for secrets, systemd service + timer, log in `/volume2/logs/`). It has its own spec in dev.tools covering that repo's conventions (spec_test, coverage, consistency checks); this section is the contract.

**Schedule:** systemd timer, every 5 minutes, `Type=oneshot`.

**Each run:**

1. `flock` a lock file; exit quietly if another run holds it.
2. Once a day (marker file), `yt-dlp -U` so YouTube/Instagram fixes arrive automatically.
3. `psql` (same Supabase credentials as the backup) for rows with `download_status = 'pending'` and `archived_at IS NULL`, oldest first.
4. For each row:
   - Re-validate `source_url` against the same strict patterns and rebuild the URL from the extracted ID. Never pass the stored string through unvalidated; pass it after `--`.
   - `yt-dlp` with: mp4 at 720p or lower; `--match-filter "duration < 180"` (3-minute cap); `--max-filesize 100M`; no playlists. Instagram photo posts are saved as images (jpg), which the app already supports.
   - Upload to R2 with `rclone` as `{random-uuid}.{ext}` — the same scheme the browser uses.
   - Single UPDATE: `video_path`, `source_author` (from yt-dlp's uploader metadata, only if currently null), `download_status = 'done'`, `download_error = null`.
   - Guard the UPDATE with `WHERE id = … AND download_status = 'pending' AND source_url = <the url it downloaded>`. If the coach replaced or deleted the media mid-download, zero rows update and the worker deletes the R2 object it just uploaded.
5. On failure: `download_attempts + 1`, `download_error = <short reason>`. At 3 attempts → `download_status = 'failed'`.
6. Exit non-zero **only if a row moved to `failed` in this run**, which triggers the existing `systemd-unit-failed` alert → email + ECHO investigation. Already-failed rows never re-alert. Infrastructure errors (Supabase or R2 unreachable, `op` failing) also exit non-zero.

**One-time setup:** `yt-dlp` standalone binary, `ffmpeg` from apt (to merge YouTube video and audio streams). `rclone` and `psql` already exist for the backup.

**Instagram login:** try without one first. If Instagram refuses anonymous downloads, use a **throwaway Instagram account** (never Tom's or the gym's — automated downloads can get an account flagged). Its cookies go in 1Password and are written to a temp file per run and deleted afterwards. Expired cookies show up as an "Archive failed" alert; refresh them every few months.

**Security:** outbound only, no listening ports. Writes only `video_path`, `source_author` and the `download_*` columns. Secrets come from 1Password at run time and never touch disk except the per-run cookie temp file.

## Testing

**evolve.coaches (Playwright):**
- `parseVideoLink`: both example links (`https://youtu.be/4taYjKlmihU?is=…`, `https://www.instagram.com/p/DdFIrIfk0W2/?stkn=…`), the shorts/reel/watch/m. variants, tracking params stripped, and rejection of other hosts, look-alike hosts (`youtube.com.evil.com`), `javascript:` URLs and IDs with bad characters.
- Upload with a link: embed preview shown; YouTube title pre-filled from a stubbed oEmbed (`page.route`); the row is saved pending; duplicate-link warning.
- Movement page: embed when only `source_url` is set; R2 player when `video_path` is set; credit line.
- Replace file ↔ link in both directions.
- Admin: pending and failed badges; Retry resets the row.
- `security.spec.js`: the database rejects a `source_url` outside the allowed patterns.

**dev.tools (worker):** tests in that repo's conventions, with `yt-dlp`, `rclone` and `psql` stubbed: the happy path, failure counting and the transition to failed, alerting only on that transition, URL re-validation rejecting a tampered row, and the replaced-mid-download guard cleaning up its upload.

**Live check before calling it done:** archive both example links end to end on the NAS.

## Out of scope

- Several links per upload / bulk links
- Platforms other than YouTube and Instagram (TikTok, Vimeo can be added later to `parseVideoLink` and the CHECK constraint)
- Long videos or trimming segments
- AI naming for links
- Re-checking that archived originals still exist

## Docs to update when built

- `CLAUDE.md` Decisions: link media model, why the NAS, download_* vs archived_at naming, `parseVideoLink` as the single source of truth.
- `README.md` feature list.
- dev.tools: the worker's README, plus the deploy-table row in its CLAUDE.md.
