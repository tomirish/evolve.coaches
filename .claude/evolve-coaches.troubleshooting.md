# evolve.coaches — Troubleshooting & Admin Notes

## Soft Delete / Archive

All video deletes in the app are **soft deletes** — the movement row stays in the database and the video file stays in R2. The `archived_at` timestamp is set, and the movement disappears from the catalog and all queries. Nothing is permanently removed.

### How to restore an archived movement

1. Go to [Supabase SQL Editor](https://supabase.com/dashboard/project/rmgernpifsdqnnomlzvg/sql/new)
2. Run:
```sql
-- Restore by name
UPDATE movements SET archived_at = NULL WHERE name = 'Movement Name Here';

-- Or restore by ID (more precise if there are duplicates)
UPDATE movements SET archived_at = NULL WHERE id = 'paste-uuid-here';
```
3. The movement will immediately reappear in the catalog.

### How to see all archived movements

```sql
SELECT id, name, video_path, archived_at
FROM movements
WHERE archived_at IS NOT NULL
ORDER BY archived_at DESC;
```

### How to permanently delete an archived movement (nuclear option)

Only do this if you're sure. The video file in R2 will need to be deleted separately.

```sql
-- Step 1: get the video_path first so you can delete from R2
SELECT id, name, video_path FROM movements WHERE name = 'Movement Name Here';

-- Step 2: hard delete the row
DELETE FROM movements WHERE id = 'paste-uuid-here';
```

Then delete the file from R2: go to Cloudflare dashboard → R2 → your bucket → find the file by `video_path` UUID and delete it.

---

## Bulk Archive (Admin Videos Tab)

On the Admin page → Videos tab:
- Check the box on the left of any row(s) to select them
- An **Archive Selected (N)** bar appears at the top
- Click it and confirm — selected movements are soft-deleted
- The Duplicates toggle helps find and clean up duplicate movement names

---

## Duplicate Movements

The DB allows two movements with the same name (intentional — two different videos can demo the same exercise). To find and review duplicates:

1. Go to Admin → Videos tab
2. Click the **Duplicates** toggle button
3. Movements are grouped by shared name with a header showing the count
4. Check the boxes on the copies you want to remove, then Archive Selected

---

## R2 Video Storage

Videos are stored in Cloudflare R2, **not** in Supabase Storage. The `video_path` column in the `movements` table stores the UUID filename (e.g. `3ca7b98d-ef85-44b2-9e7f-7e697d747952.mp4`).

When a movement is soft-deleted, its video file **stays in R2**. This is intentional — the file is still there if you need to restore.

If you ever need to manually browse R2 files: Cloudflare dashboard → R2 → evolve-coaches bucket.

---

## Supabase Quick Links

Project URL and credentials are in the password vault. From the Supabase dashboard, navigate to your project and use:
- **SQL Editor** — for running the queries above
- **Table Editor** → movements — for browsing rows
- **Authentication** → Users — for managing auth users
- **Edge Functions** — for function logs
