# Video Links — Design

**Date:** 2026-10-02
**Status:** Approved in conversation, awaiting spec review

## Goal

Coaches find good movement demos on Instagram and YouTube. They should be able to paste a link and get a normal movement — name, alt names, tags, comments — that plays inside the movement page just like an uploaded video.

Tom does not want the library to depend on third-party hosts staying up or creators keeping posts public. So every linked video is also **copied into R2 automatically**, with no manual step.

**Who:** all coaches (same permissions as uploading a file).
**Content:** short clips — roughly 10-second demos of a single movement (Reels, Shorts, short YouTube videos). The source video can be long, because a coach can choose **just part of it** (added 2026-10-02 after talking with a coach). The default is the whole video.

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

The one parameter that is read before being dropped is YouTube's `t` (`?t=69`, `?t=69s`, `?t=1m9s`). It pre-fills the part's **Start**, because a coach who copies a link at a timestamp usually means "from here".

## Data model

New columns on `movements` (one migration):

| Column | Type | Meaning |
|---|---|---|
| `source_url` | `text` | Canonical link. Null for file uploads. |
| `source_author` | `text` | Creator name, for the credit line. |
| `download_status` | `text` | `pending` / `done` / `failed` / `link_only`. Null for file uploads. CHECK constraint on the values. |
| `download_attempts` | `int NOT NULL DEFAULT 0` | Failed attempts so far. |
| `download_error` | `text` | Reason for the last failure, or why the movement is link-only. |
| `clip_start` | `int` | Start of the chosen part, in whole seconds. Null = whole video. |
| `clip_end` | `int` | End of the chosen part, in whole seconds. Null = whole video. |

`link_only` means "plays from the embed permanently". It is set by the worker when the content itself can never be copied (a whole video longer than 3 minutes with no part chosen, over 100 MB, an Instagram post with no video, or a part that starts after the video ends), or by an admin choosing **Keep as link only** on a failed row. It never alerts.

Deliberately **not** named `archive_*` — `archived_at` already means soft-deleted, and the Admin page's existing **Archive Selected** button already uses "archive" for deletion. The UI also avoids the word: badges say "Saving copy…" and "Copy failed".

CHECK constraints, so a crafted request cannot get past the browser's validation (coaches can write their own rows under RLS):
- `source_url` must match the canonical patterns above: `^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$` or `^https://www\.instagram\.com/(p|reel)/[A-Za-z0-9_-]{5,40}/$`.
- `(source_url IS NULL) = (download_status IS NULL)`: a link always has a status, and a file upload never has one.
- `(clip_start IS NULL) = (clip_end IS NULL)`: a part has both ends or neither.
- `clip_start IS NULL OR source_url IS NOT NULL`: only links can be trimmed.
- `clip_start >= 0 AND clip_end > clip_start AND clip_end - clip_start <= 180`: a part is at most **3 minutes**.

`video_path` is already nullable (verify against the live schema before writing the migration). No RLS policy changes: coaches already insert and update their own movements.

**What plays — one rule, one helper:**
- `video_path` set → play from R2 (existing path, unchanged).
- else `source_url` set → embed.

## Browser side

### Shared helpers (auth.js)

Following the existing rule that shared utilities live in auth.js (like `isImagePath`):

- `parseVideoLink(url)` → `{ platform, id, canonicalUrl, startSeconds }` or `null`. `startSeconds` is YouTube's `t` parameter, or null.
- `embedUrl(link, clip)` → the iframe address, built **only from the parsed ID** and integer seconds, never from raw input.
  - YouTube, whole video: `https://www.youtube-nocookie.com/embed/ID?autoplay=1&mute=1&loop=1&playlist=ID&playsinline=1`. It autoplays muted and loops, close to the native player.
  - YouTube, a part: `…/embed/ID?autoplay=1&mute=1&playsinline=1&start=S&end=E`. There's no loop here, because YouTube's loop restarts at 0:00 rather than at `start`. The part loops once the R2 copy replaces the embed.
  - Instagram: `https://www.instagram.com/p/ID/embed/` (or `/reel/ID/embed/`). Instagram has no start or end option, so the **whole post shows until the NAS copy lands** (usually within 5–10 minutes).
- `embedHtml(link, title, clip)` → the `<iframe>` markup, so movement.js and upload.js render embeds the same way.
- `parseClipTime('1:09')` → `69` (accepts `m:ss`, `h:mm:ss`, or plain seconds; returns `null` on nonsense), and `formatClipTime(69)` → `'1:09'`.

### Upload page

- Below the drop zone: a text field, **"…or paste a YouTube or Instagram link"**.
- A valid link opens the existing single-movement form (name, alt names, tags, comments) with the embed as the preview, in place of the file thumbnail.
- **Name suggestion:** for YouTube, the browser calls YouTube oEmbed (`https://www.youtube.com/oembed?url=…&format=json` — verified 2026-10-02 to return CORS headers for the site origin). Pre-fill the name with the title up to the first `|`, trimmed, with the hint "Suggested from the YouTube title". `author_name` is saved as `source_author`. If oEmbed fails, the name is simply left blank.
- Instagram: no name suggestion (its oEmbed "title" is the whole caption, and it has no CORS headers). `source_author` is filled later by the worker.
- No AI vision naming for links.
- **Choosing a part:** below the preview, **Whole video** is selected by default. A **Use only part of it** option reveals **Start** and **End** fields (`m:ss`) with a live note under them: "30 seconds", or an inline error such as "End must be after Start" or "A part can be at most 3 minutes". Start is pre-filled from YouTube's `t` when present. For YouTube, the preview embed updates to play just that part.
- **Duplicate check:** if a non-deleted movement already has the same `source_url`, show a warning in the same style as the existing duplicate-name warning.
- Save inserts the row with `source_url`, `source_author`, `clip_start`/`clip_end` (null for the whole video), `download_status = 'pending'`, `video_path = null`. Save is blocked while the part fields are invalid.
- Pasting a link and dropping files are mutually exclusive — choosing one clears the other. Bulk mode stays file-only.

### Movement page

- Plays per the rule above. While pending, the embed is shown (no "archiving" message to coaches — it just works).
- When `source_url` is set, a credit line: **"From {source_author} on {YouTube|Instagram} ↗"** linking to `source_url` (`rel="noopener noreferrer"`, new tab). For a YouTube part, the link adds `&t={clip_start}s` so it opens at the same moment. Falls back to "From YouTube ↗" when the author is unknown.
- **Replace** accepts either a file or a link:
  - File or link → link: update the row (`source_url`, `source_author`, `clip_start`/`clip_end`, `download_status = 'pending'`, `download_attempts = 0`, `download_error = null`, `video_path = null`), deleting the old R2 file first because `r2-delete` checks the path against the row (the existing replace order). **This is also how a coach changes the part:** the edit page pre-fills the current link and part, the coach adjusts Start/End and presses Replace, and the worker makes a new copy.
  - Link → file: existing upload flow, plus clearing `source_url`, `source_author`, the `clip_*` columns and the `download_*` columns.
- Edit (name, alt names, tags, comments) is unchanged.

### Catalog

No change — link movements are ordinary cards.

### Admin Videos tab

- Thumbnail: R2 file when `video_path` is set (existing). Otherwise YouTube's `https://i.ytimg.com/vi/ID/hqdefault.jpg`, or an Instagram placeholder.
- Badge: **"Saving copy…"** for `pending`, **"Copy failed"** for `failed`, **"Link only"** for `link_only`, with `download_error` as its tooltip.
- On failed rows:
  - **Retry** → `download_status = 'pending'`, `download_attempts = 0`, `download_error = null`.
  - **Keep as link only** → `download_status = 'link_only'`. This clears the alert when the original cannot be copied, for example when it has been deleted.
- Clicking the thumbnail of a row with no R2 file opens the movement page, not the R2 preview modal.

## NAS worker

Lives in **dev.tools**: `automation/archive_evolve_links/`, following the `backup_evolve_coaches` pattern (bash, runs directly on the NAS host — not Docker — `op read` for secrets, systemd service + timer, log in `/volume2/logs/`). It has its own spec in dev.tools covering that repo's conventions (spec_test, coverage, consistency checks); this section is the contract.

**Schedule:** systemd timer, every 5 minutes, `Type=oneshot`.

**Each run:**

1. `flock` a lock file **before** touching the log; exit 0 quietly if another run holds it, so a contended run never rotates the log out from under the run doing the work.
2. Once a day (marker file), `yt-dlp -U` so YouTube/Instagram fixes arrive automatically.
3. `psql` (same Supabase credentials as the backup) for rows with `download_status = 'pending'`, `archived_at IS NULL`, and `updated_at < now() - download_attempts × 15 minutes` (backoff: retries at roughly +15 and +30 minutes, so a brief Instagram rate limit doesn't burn all three attempts), oldest first, at most 10 per run.
4. For each row:
   - Re-validate `source_url` against the same strict patterns and rebuild the URL from the extracted ID. Never pass the stored string through unvalidated; pass it after `--`.
   - `yt-dlp` with: mp4 at 720p or lower; `--max-filesize 100M`; no playlists; 5-minute timeout; and either
     - **a part chosen:** `--download-sections "*S-E" --force-keyframes-at-cuts` (ffmpeg cuts exactly at the chosen seconds). For YouTube, only that section is fetched. No duration filter is used, because the database already caps the part at 3 minutes and the worker re-checks that.
     - **whole video:** `--match-filter "duration < 180"` (3-minute cap). If the video is longer, it becomes `link_only` with the reason "longer than 3 minutes — edit it and choose a part", which tells the coach exactly what to do.
   - **No file produced means not archived**, whatever yt-dlp's exit code is. yt-dlp exits 0 when a filter rejects the video.
   - Upload to R2 with `rclone` as `{random-uuid}.{ext}` — the same scheme the browser uses.
   - Single UPDATE: `video_path`, `source_author` (from yt-dlp's uploader metadata, only if currently null), `download_status = 'done'`, `download_error = null`.
   - Guard the UPDATE with `WHERE id = … AND download_status = 'pending' AND source_url = <the url it downloaded> AND clip_start/clip_end IS NOT DISTINCT FROM <the part it cut> AND archived_at IS NULL`. A coach who changes the part mid-download therefore also causes a guard miss. If the coach replaced or deleted the media mid-download, zero rows update and the worker deletes the R2 object it just uploaded.
5. Failures are classified:
   - **Permanent** (too long with no part chosen, too large, no video in the post, part starts after the video ends — detected from the downloaded info JSON's `duration`) → `link_only` with the reason, and no alert. Retrying cannot change the content, and the embed keeps working.
   - **Anything else, including errors it doesn't recognise** → `download_attempts + 1` and `download_error = <short reason>`. At 3 attempts → `failed`. Unknown errors count as transient on purpose, so a mistake in the classification leads to an alert rather than silence.
6. **Exit non-zero whenever any non-deleted row is `failed`**, after processing. The unit then stays failed for as long as the problem is open, so the existing `systemd-unit-failed` rule (which waits `for: 5m`) fires once and resolves when Tom clicks Retry or Keep as link only. Exiting non-zero only on the run where a row became failed would be silent: the next run 5 minutes later would clear the failed state before the rule's 5 minutes elapsed. Infrastructure errors (Supabase or R2 unreachable, `op` failing) also exit non-zero.

**Monitoring registration:**
- The worker's log is added to `nas_facts.sh`'s outcome metrics.
- Its timer joins the 2-hour group in `scheduled-job-not-running`, so a timer that stops leaves pending links unarchived and also raises an alert instead of going unnoticed.

**One-time setup:** `yt-dlp` standalone binary, `ffmpeg` from apt (to merge YouTube video and audio streams). `rclone` and `psql` already exist for the backup.

**Instagram photo posts** are not copied. yt-dlp downloads video only, so a photo post becomes `link_only` ("no video in this post") and keeps playing from the embed. Coaches share clips, so this case should be rare.

**Test rows:** the Playwright suite runs against the live database, so the worker can see any link row a test creates. The tests therefore **never write a `pending` row**:
- Fixtures insert link rows as `link_only`, `done` or `failed`, none of which the worker picks up.
- UI tests that would save `pending` (saving a link, Retry, replacing with a link) intercept the Supabase REST write with `page.route` and assert on the request body instead of letting it reach the database.

The database constraints are exercised separately by direct inserts in `security.spec.js`.

**Instagram login:** try without one first. If Instagram refuses anonymous downloads, use a **throwaway Instagram account** (never Tom's or the gym's — automated downloads can get an account flagged). Its cookies go in 1Password and are written to a temp file per run and deleted afterwards. Expired cookies show up as a "Copy failed" alert; refresh them every few months.

**Security:** outbound only, no listening ports. Writes only `video_path`, `source_author` and the `download_*` columns. Secrets come from 1Password at run time and never touch disk except the per-run cookie temp file.

## Testing

**evolve.coaches (Playwright):**
- `parseVideoLink`: both example links (`https://youtu.be/4taYjKlmihU?is=…`, `https://www.instagram.com/p/DdFIrIfk0W2/?stkn=…`), the shorts/reel/watch/m. variants, tracking params stripped, and rejection of other hosts, look-alike hosts (`youtube.com.evil.com`), `javascript:` URLs and IDs with bad characters.
- Upload with a link: embed preview shown; YouTube title pre-filled from a stubbed oEmbed (`page.route`); the row is saved pending; duplicate-link warning; a part saved as `clip_start`/`clip_end`; Start pre-filled from `?t=`; invalid parts block Save with an inline message.
- `parseClipTime`/`formatClipTime` round-trips; `embedUrl` with and without a part.
- Movement page: embed when only `source_url` is set; R2 player when `video_path` is set; credit line.
- Replace file ↔ link in both directions.
- Admin: pending and failed badges; Retry resets the row.
- `security.spec.js`: the database rejects a `source_url` outside the allowed patterns, a half-set part, a part on a file upload, and a part longer than 180 seconds.

**dev.tools (worker):** tests in that repo's conventions, with `yt-dlp`, `rclone` and `psql` stubbed: the happy path; failure counting and the move to failed; non-zero exit while any failed row exists; a part passed as `--download-sections` and the duration filter only without a part; a part changed mid-download causing a guard miss; part-starts-after-end classified permanent; permanent failures going to link_only without alerting; unknown errors counted as transient; yt-dlp exiting 0 with no file is not a success; URL re-validation rejecting a tampered row; the replaced-mid-download guard cleaning up its upload; and every subprocess call having a timeout.

**Live check before calling it done:** archive both example links end to end on the NAS.

## Out of scope

- Several links per upload / bulk links
- Platforms other than YouTube and Instagram (TikTok, Vimeo can be added later to `parseVideoLink` and the CHECK constraint)
- Several parts from one video (make two movements)
- Trimming uploaded files (only links can be trimmed)
- AI naming for links
- Re-checking that archived originals still exist

## Docs to update when built

- `CLAUDE.md` Decisions: link media model, why the NAS, download_* vs archived_at naming, `parseVideoLink` as the single source of truth.
- `README.md` feature list.
- dev.tools: the worker's README, plus the deploy-table row in its CLAUDE.md.
