# Bulk Video Upload

For importing large batches of videos (e.g. 300+), use the Node.js import script instead of the web UI. The script uploads each video directly to Cloudflare R2 and inserts the movement record into Supabase.

## Prerequisites

The script needs to run on a Mac or PC with **Node.js** installed.
- Download from [nodejs.org](https://nodejs.org) — install the LTS version
- One-time setup, takes about 2 minutes
- Tom will be present to help with this step

Everything else is handled by the script itself.

## Folder Layout

```
/import/
  metadata.csv
  rdl.mp4
  back-squat.mp4
  push-press.mp4
  ...
```

## metadata.csv Format

| Column | Required | Description |
|---|---|---|
| `filename` | Yes | Video file name, including extension (e.g. `rdl.mp4`) |
| `name` | Yes | Primary movement name (e.g. `Romanian Deadlift`) |
| `alt_names` | No | Alternative names, separated by `\|` (e.g. `RDL\|Stiff Leg Deadlift`) |
| `tags` | No | Tags, separated by `\|` — must match existing tags exactly, or new ones will be created |
| `comments` | No | Coach notes shown on the movement detail page |

### Example

```csv
filename,name,alt_names,tags,comments
rdl.mp4,Romanian Deadlift,RDL|Stiff Leg Deadlift,Hamstrings|Glutes,Keep back flat throughout — avoid rounding at the bottom
back-squat.mp4,Back Squat,,Quadriceps|Glutes|Full Body,
push-press.mp4,Push Press,Shoulder Press,Shoulders|Triceps,Drive through the heels to initiate the press
lateral-raise.mp4,Lateral Raise,,Shoulders,Control the lowering phase — don't let them drop
pull-up.mp4,Pull-Up,Chin-Up|Pullup,Back|Biceps,
```

### Tips

- **Only `filename` and `name` are required.** `alt_names`, `tags`, and `comments` can all be left blank and filled in later via the movement detail page in the app.
- Leave optional fields empty by putting nothing between the commas — e.g. `rdl.mp4,Romanian Deadlift,,,`
- Separate multiple alt names or tags with a pipe character `|`, not a comma
- Tags are case-sensitive and must match the tags in the app exactly — check the Tags page first
- Any tags in the CSV that don't exist yet will be created automatically by the script
- The easiest way to build this file is in **Google Sheets** or **Excel**, then export as CSV

## Running the Script

> The script doesn't exist yet — this section will be filled in once it's built.

```bash
cd scripts
node import.js --dir /path/to/import/folder
```

The script will:
1. Read `metadata.csv` from the import folder
2. Create any missing tags in Supabase
3. Upload each video to R2
4. Insert each movement record into Supabase
5. Print a summary of successes and any errors

If a video fails mid-run, fix the issue and re-run — the script will skip videos whose names already exist in the database.

## Portability Note

If the script needs to run on someone else's computer (e.g. the person who has the videos), the simplest approach is to **hardcode the credentials directly in the script** before handing it over. This is acceptable because:
- It's a one-time use script, not committed to the repo
- Tom will be present while it runs
- The script gets deleted after the import is done

Credentials needed (from 1Password):
- R2 Access Key ID + Secret
- R2 bucket name + endpoint
- Supabase URL + service role key

## Open Questions

- [ ] Are videos already organized on the Mac?
- [ ] Is metadata ready in a spreadsheet, or does it still need to be gathered?
- [ ] Is this a one-time migration, or will periodic bulk uploads be needed?
