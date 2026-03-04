# Bulk Upload — Feature Spec

**Status:** Planned — not yet implemented  
**Decision needed:** Two implementation options are on the table. Coach feedback required before building.

---

## Background

The existing `upload.html` handles one video at a time. Coaches need a way to upload many videos at once. Two approaches are being evaluated — a **Web UI** built into the app, and a **Node.js CLI script** run locally on a computer with the video files.

Only the minimum required fields are needed at upload time — movement name and video file. Optional metadata (alt names, tags, comments) can be filled in afterward on each movement's detail page.

---

## Options at a Glance

| | Option A: Web UI | Option B: Node.js CLI Script |
|---|---|---|
| **Where it runs** | Browser — any device, no setup | Terminal on a Mac or PC with Node.js installed |
| **Best for** | Small batches, ongoing use by coaches | Large one-time migrations (50–500+ videos) |
| **File limit** | ~25 per session (browser reliability) | Unlimited — resumable if it fails mid-run |
| **Metadata** | Name typed per file in the browser | CSV spreadsheet prepared in advance |
| **Requires dev** | Yes — new page to build | Yes — script to build |
| **Tech comfort needed** | None — works like the existing upload page | Low — run one command in Terminal |

---

## Option A: Web UI (in-browser)

Coaches visit a new `bulk-upload.html` page in the app, select multiple video files at once (or drag and drop), confirm a movement name for each (auto-populated from the filename), and click **Upload All**. Videos upload one at a time with live progress per row.

### How it looks

```
[ #  |  Filename           |  Movement Name         |  Status        ]
[ 1  |  rdl.mp4            |  [Rdl             ]    |  Pending       ]
[ 2  |  back-squat.mp4     |  [Back Squat       ]    |  Pending       ]
[ 3  |  push-press.mp4     |  [Push Press       ]    |  Uploading 42% ]
[ 4  |  lateral-raise.mp4  |  [Lateral Raise    ]    |  ✓ Done        ]
```

- Movement name is auto-filled from the filename (strips extension, fixes dashes/underscores, title-cases) — coaches just correct anything that looks wrong
- A row that errors is marked in place; the rest of the queue continues
- Summary banner at the end: `"4 uploaded successfully, 1 failed."`
- **Soft cap of 25 files per session** with a warning if exceeded (see File Count Limits below)

### Pros
- No setup — works for any coach right in the browser
- No CSV to prepare — names are auto-suggested
- Fits naturally into the existing app

### Cons
- ~25 file limit per session due to browser reliability
- Cannot add tags, alt names, or comments during bulk upload (do it afterward per movement)
- If the tab closes mid-upload, progress is lost for any remaining files

---

## Option B: Node.js CLI Script

A script run locally on the computer that holds the video files. It reads a `metadata.csv` spreadsheet and a folder of videos, uploads everything to R2 and Supabase in sequence, and prints a summary. Tom would be present during the run.

### Folder layout

```
/import/
  metadata.csv
  rdl.mp4
  back-squat.mp4
  push-press.mp4
  ...
```

### metadata.csv format

| Column | Required | Description |
|---|---|---|
| `filename` | Yes | Video file name including extension (e.g. `rdl.mp4`) |
| `name` | Yes | Primary movement name (e.g. `Romanian Deadlift`) |
| `alt_names` | No | Alternative names separated by `\|` (e.g. `RDL\|Stiff Leg Deadlift`) |
| `tags` | No | Tags separated by `\|` — must match existing tags exactly, or new ones will be created |
| `comments` | No | Coach notes shown on the movement detail page |

**Only `filename` and `name` are required.** Leave optional columns empty — they can be filled in later.

```csv
filename,name,alt_names,tags,comments
rdl.mp4,Romanian Deadlift,RDL|Stiff Leg Deadlift,Hamstrings|Glutes,Keep back flat throughout
back-squat.mp4,Back Squat,,Quadriceps|Glutes|Full Body,
push-press.mp4,Push Press,Shoulder Press,Shoulders|Triceps,
```

The easiest way to build this file is in **Google Sheets** or **Excel**, then export as CSV.

### How it runs

```bash
cd scripts
node import.js --dir /path/to/import/folder
```

The script will:
1. Read `metadata.csv` from the folder
2. Create any missing tags in Supabase
3. Upload each video to R2
4. Insert each movement record into Supabase
5. Print a summary of successes and any errors

If something fails mid-run — fix the issue and re-run. The script skips videos whose names already exist in the database.

### Pros
- Handles unlimited videos — no session reliability concerns
- Resumable — safe to re-run after failures
- Supports all metadata fields upfront (tags, alt names, comments)
- Runs headlessly — no browser tab to keep open

### Cons
- Requires Node.js installed on the computer with the videos
- Requires preparing a CSV spreadsheet in advance
- Tom needs to be present (or credentials need to be shared carefully)
- CLI script needs to be built first

### Portability note

If the script needs to run on someone else's computer, the simplest approach is to hardcode the credentials directly in the script before handing it over (not committed to the repo, deleted after use). Credentials needed: R2 Access Key ID + Secret, R2 bucket name + endpoint, Supabase URL + service role key (all in 1Password).

---

## File Count Limits

The browser, R2, and Supabase impose no hard limits on file count. The real constraint for Option A is **time and browser session reliability**:

| Avg video size | Upload speed | Time per video | 25 videos | 500 videos |
|---|---|---|---|---|
| 50 MB | 10 Mbps | ~40 sec | ~17 min | ~5.5 hours |
| 100 MB | 10 Mbps | ~80 sec | ~33 min | ~11 hours |

A browser tab open for several hours is vulnerable to: computer sleep, network drops, or a tab crash. There is no resume capability in the web UI. Option B (CLI script) does not have this constraint.

**Recommendation:** Option A with a soft cap of 25 files per session for regular use; Option B for any migration of 50+ videos.

---

## Questions for Coaches

These need answers before building:

- [ ] **How many videos do you typically need to upload at once?** (handful at a time vs. large one-time migration)
- [ ] **Do you have metadata (names, tags) ready before uploading, or do you figure it out as you go?** This affects whether a CSV is practical
- [ ] **Is this a one-time migration of existing videos, ongoing periodic uploads, or both?**
- [ ] **Are the videos already organized on a Mac/PC, or scattered across devices?**
- [ ] **Are coaches comfortable opening a Terminal and running one command, or should everything stay in the browser?**
- [ ] **Should bulk upload be available to all coaches, or admins only?**

---

## Dev Implementation Notes

*For the dev picking this up after coach feedback.*

### If Option A is chosen — files to create/modify

- **Create** `bulk-upload.html` — same nav/head as `upload.html`; multi-file drop zone (`#file-drop`), queue table (`#upload-queue`), `#upload-all-btn`, `#clear-btn`, `#bulk-summary`
- **Create** `js/bulk-upload.js` — `requireAuth()`, file→queue builder with auto-name (`file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())`), sequential `uploadAll()` loop using existing `callEdgeFunction('r2-upload-url')` + `uploadToR2()` + Supabase insert; `MAX_FILES = 25` constant
- **Modify** `upload.html` — add `<a href="bulk-upload.html">Bulk Upload</a>` to `.nav-links`
- **Modify** `css/style.css` — add `.bulk-queue`, `.bulk-row`, `.bulk-status` (variants: `.is-uploading`, `.is-done`, `.is-error`), `.bulk-summary`
- **Modify** `tests/desktop.spec.js` — smoke test: navigate to `/bulk-upload.html`, expect `#file-drop` and `#upload-all-btn` visible, no horizontal scroll

Key code references: auth helpers + `uploadToR2` in `js/auth.js`; single upload pattern in `js/upload.js` (Supabase insert at lines 121–131).

### If Option B is chosen — files to create

- **Create** `scripts/import.js` — reads `metadata.csv`, creates missing tags in Supabase, uploads each video to R2 via AWS SDK (`@aws-sdk/client-s3`), inserts movement records; skips names that already exist; prints pass/fail summary
- Credentials hardcoded per run (not committed); deleted after use
