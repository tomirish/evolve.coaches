# Video Links (browser side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coaches can paste a YouTube or Instagram link instead of uploading a file, optionally choosing just part of the video (Start/End). The link becomes a normal movement (name, alt names, tags, comments) that plays through the platform's embed until the NAS worker has copied, and if needed trimmed, it into R2.

**Architecture:** One migration adds `source_url`, `source_author`, `clip_start`/`clip_end` and `download_*` columns, with CHECK constraints. `parseVideoLink()` in `auth.js` is the single source of truth for which links are accepted and how embeds are built. Each page uses one rule: if `video_path` is set, play from R2; otherwise, if `source_url` is set, show the embed. The NAS worker is a **separate plan in dev.tools** (`dev.tools/docs/superpowers/plans/2026-10-02-archive-evolve-links.md`). This side ships first and works without it, because movements simply stay on the embed.

**Tech Stack:** Vanilla JS, Supabase (Postgres + RLS), Playwright, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-02-video-links-design.md`

## Global Constraints

- **Accepted links:** YouTube (`watch?v=`, `youtu.be/`, `shorts/`, including `www.` and `m.`) and Instagram (`/p/`, `/reel/`, `/reels/`). Nothing else.
- **Canonical stored forms:** `https://www.youtube.com/watch?v=<11-char id>` and `https://www.instagram.com/(p|reel)/<5–40 char id>/`. All query parameters are dropped.
- **ID charset:** `[A-Za-z0-9_-]`. YouTube IDs are exactly 11 characters; Instagram IDs are 5–40.
- **Embeds:** the embed URL is built only from the parsed ID and integer seconds, never from raw input. YouTube, whole video: `youtube-nocookie.com/embed/<id>?autoplay=1&mute=1&playsinline=1&loop=1&playlist=<id>`. YouTube, a part: `…?autoplay=1&mute=1&playsinline=1&start=<s>&end=<e>` (no loop). Instagram: `/<kind>/<id>/embed/` (whole post; it has no start/end).
- **Parts:** `clip_start`/`clip_end` are whole seconds, both set or both null, links only, `0 ≤ start < end`, `end − start ≤ 180`. The default is **Whole video**. The UI is Start + End (`m:ss`) with a live length note. YouTube `t=` pre-fills Start but doesn't switch on "part".
- **`download_status` values:** `pending` | `done` | `failed` | `link_only`, and NULL for file uploads. `(source_url IS NULL) = (download_status IS NULL)`.
- **The word "archive" is never used for copying.** `archived_at` means soft-deleted. Badges read "Saving copy…", "Copy failed" and "Link only".
- **One link per upload.** Bulk mode stays files-only. Choosing a link clears any file selection, and choosing a file clears the link.
- **Tests never write a `pending` row** to the live database. Writes that would be `pending` are intercepted with `page.route` and asserted on.
- **Shared helpers live in `auth.js`** (repo rule). No local copies in page scripts.
- Every page script still calls `initNav()`. No `type=` on `<source>` tags.

## Review Focus

1. **A pasted link with surrounding whitespace or a trailing newline** (common when copying from a phone share sheet) should be accepted. Covered: the `parseVideoLink` test includes `'  https://youtu.be/…\n'`.
2. **A look-alike host or a `javascript:` URL** should be rejected, and nothing from it should reach an iframe. Covered: `parseVideoLink` rejection cases, plus the DB CHECK test in `security.spec.js`.
3. **The YouTube oEmbed lookup failing or being slow** should never block saving. The name is simply left for the coach. Covered: an upload test where oEmbed returns 500 still lets the coach save.
4. **The coach changes their mind** (pastes a link, then picks a file, or the reverse) and the form should submit what is currently shown, not the earlier choice. Covered: the "choosing a file clears the link" test.
5. **A coach types a part in a loose format** (`1:9`, `69`, ` 1:09 `) or an impossible one (`1:60`, End before Start, 4 minutes long). Loose forms should be accepted and impossible ones rejected inline, before Save. Covered: the `parseClipTime` / `validateClip` cases in `links.spec.js`, plus the upload test that keeps Save blocked on an invalid part.
6. **A movement with neither `video_path` nor a parseable `source_url`** (a corrupt row) should show the existing "no media" error, not a blank iframe. Covered: the movement-page test with a bad `source_url`. That test cannot insert such a row past the CHECK constraint, so it stubs the REST read.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `supabase/migrations/20261002000000_video_links.sql` | Create | Columns and CHECK constraints |
| `js/auth.js` | Modify | Link helpers (`parseVideoLink`, `embedUrl`, `embedHtml`, `sourceLinkUrl`, `platformLabel`, `fetchYouTubeInfo`, `nameFromYouTubeTitle`) and part helpers (`parseClipTime`, `formatClipTime`, `validateClip`, `clipLengthLabel`, `movementClip`, `clipFieldsHtml`, `bindClipFields`) |
| `css/style.css` | Modify | `.embed-frame`, `.clip-*`, `.link-paste`, `.source-credit`, `.download-badge`, `.admin-thumb-link` |
| `upload.html`, `js/upload.js` | Modify | Link field, embed preview, name suggestion, duplicate-link warning, link insert |
| `js/movement.js` | Modify | Embed playback, credit line, replace with a file or a link |
| `js/admin.js` | Modify | Link thumbnails, badges, Retry / Keep as link only |
| `tests/helpers/fixtures.js` | Modify | `setupLinkMovementFixture` / `teardownLinkMovementFixture` |
| `tests/links.spec.js` | Create | Unit-style tests for the link and part helpers |
| `tests/upload.spec.js`, `tests/movement.spec.js`, `tests/admin.spec.js`, `tests/security.spec.js` | Modify | Feature tests |
| `CLAUDE.md`, `README.md` | Modify | Decisions and feature list |

**Running tests:** `source ~/.zshrc && npm test` runs the full suite, with secrets from 1Password. For a single file: `source ~/.zshrc && npx op run --env-file=.env.op -- npx playwright test tests/links.spec.js`. `playwright.config.js` starts `python3 -m http.server 8080` itself (`webServer`), so don't start one by hand for tests.

---

### Task 1: Migration — columns and constraints

**Files:**
- Create: `supabase/migrations/20261002000000_video_links.sql`
- Modify: `tests/security.spec.js` (append a describe block)

**Interfaces:**
- Produces: the columns `movements.source_url text`, `source_author text`, `download_status text`, `download_attempts int not null default 0`, `download_error text`, `clip_start int`, `clip_end int`; constraints `movements_source_url_format`, `movements_download_status_values`, `movements_link_has_status`, `movements_clip_pair`, `movements_clip_link_only`, `movements_clip_range`.

- [ ] **Step 1: Verify the live schema before writing anything** (CLAUDE.md principle 8)

The Supabase MCP must be authorized. If `mcp__supabase__*` tools aren't available, stop and ask Tom to authorize the connector. Run:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'movements'
order by ordinal_position;
```

Expected: `video_path` has `is_nullable = YES`, and none of the seven new columns exist yet. If `video_path` is NOT NULL, add `ALTER TABLE public.movements ALTER COLUMN video_path DROP NOT NULL;` to the migration in Step 3.

- [ ] **Step 2: Write the failing security tests**

Append to `tests/security.spec.js`:

```js
test.describe('video link constraints', () => {
  let linkClient;
  let linkUserId;
  const insertedIds = [];

  test.beforeAll(async () => {
    linkClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await linkClient.auth.signInWithPassword({ email: COACH_EMAIL, password: COACH_PASSWORD });
    ({ data: { user: { id: linkUserId } } } = await linkClient.auth.getUser());
  });

  test.afterAll(async () => {
    if (insertedIds.length) await linkClient.from('movements').delete().in('id', insertedIds);
  });

  const row = (over) => ({
    name: '__test_link_constraint__', alt_names: [], tags: [], comments: null,
    video_path: null, uploaded_by: linkUserId, ...over,
  });

  test('accepts a canonical YouTube link as link_only', async () => {
    const { data, error } = await linkClient.from('movements')
      .insert(row({ source_url: 'https://www.youtube.com/watch?v=4taYjKlmihU', download_status: 'link_only' }))
      .select('id').single();
    expect(error).toBeNull();
    insertedIds.push(data.id);
  });

  test('accepts a canonical Instagram link as link_only', async () => {
    const { data, error } = await linkClient.from('movements')
      .insert(row({ source_url: 'https://www.instagram.com/p/DdFIrIfk0W2/', download_status: 'link_only' }))
      .select('id').single();
    expect(error).toBeNull();
    insertedIds.push(data.id);
  });

  for (const bad of [
    'https://evil.example/watch?v=4taYjKlmihU',
    'https://www.youtube.com.evil.example/watch?v=4taYjKlmihU',
    'https://youtu.be/4taYjKlmihU',                       // not canonical
    'https://www.youtube.com/watch?v=4taYjKlmihU&si=x',   // tracking param kept
    'https://www.instagram.com/p/DdFIrIfk0W2/?stkn=x',
    'javascript:alert(1)',
  ]) {
    test(`rejects non-canonical source_url ${bad}`, async () => {
      const { error } = await linkClient.from('movements')
        .insert(row({ source_url: bad, download_status: 'link_only' }));
      expect(error?.code).toBe('23514'); // check_violation
    });
  }

  test('rejects a link without a download_status', async () => {
    const { error } = await linkClient.from('movements')
      .insert(row({ source_url: 'https://www.youtube.com/watch?v=4taYjKlmihU', download_status: null }));
    expect(error?.code).toBe('23514');
  });

  test('rejects a download_status without a link', async () => {
    const { error } = await linkClient.from('movements')
      .insert(row({ video_path: '00000000-0000-0000-0000-000000000009.mp4', download_status: 'pending' }));
    expect(error?.code).toBe('23514');
  });

  test('rejects an unknown download_status', async () => {
    const { error } = await linkClient.from('movements')
      .insert(row({ source_url: 'https://www.youtube.com/watch?v=4taYjKlmihU', download_status: 'archived' }));
    expect(error?.code).toBe('23514');
  });

  const YT = { source_url: 'https://www.youtube.com/watch?v=4taYjKlmihU', download_status: 'link_only' };

  test('accepts a part of up to 180 seconds on a link', async () => {
    const { data, error } = await linkClient.from('movements')
      .insert(row({ ...YT, clip_start: 69, clip_end: 249 })).select('id').single();
    expect(error).toBeNull();
    insertedIds.push(data.id);
  });

  for (const [label, clip] of [
    ['half-set part', { clip_start: 69, clip_end: null }],
    ['end before start', { clip_start: 99, clip_end: 69 }],
    ['zero-length part', { clip_start: 69, clip_end: 69 }],
    ['negative start', { clip_start: -1, clip_end: 30 }],
    ['part over 180 seconds', { clip_start: 0, clip_end: 181 }],
  ]) {
    test(`rejects a ${label}`, async () => {
      const { error } = await linkClient.from('movements').insert(row({ ...YT, ...clip }));
      expect(error?.code).toBe('23514');
    });
  }

  test('rejects a part on a file upload', async () => {
    const { error } = await linkClient.from('movements')
      .insert(row({ video_path: '00000000-0000-0000-0000-00000000000a.mp4', clip_start: 0, clip_end: 30 }));
    expect(error?.code).toBe('23514');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `source ~/.zshrc && npx op run --env-file=.env.op -- npx playwright test tests/security.spec.js -g "video link constraints"`
Expected: FAIL. The inserts error with `PGRST204` / `42703` ("column source_url does not exist").

- [ ] **Step 4: Write the migration**

`supabase/migrations/20261002000000_video_links.sql`:

```sql
-- Pasted YouTube/Instagram links as a second kind of movement media.
-- Design: docs/superpowers/specs/2026-10-02-video-links-design.md
--
-- What plays: video_path set -> R2 file (unchanged); else source_url -> embed.
-- The NAS worker (dev.tools/automation/archive_evolve_links) copies pending
-- links into R2 and fills video_path.
--
-- Named download_*, NOT archive_*: archived_at already means soft-deleted.

ALTER TABLE public.movements
  ADD COLUMN IF NOT EXISTS source_url        text,
  ADD COLUMN IF NOT EXISTS source_author     text,
  ADD COLUMN IF NOT EXISTS download_status   text,
  ADD COLUMN IF NOT EXISTS download_attempts int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS download_error    text,
  -- The chosen part of a linked video, in whole seconds. NULL/NULL = whole video.
  ADD COLUMN IF NOT EXISTS clip_start        int,
  ADD COLUMN IF NOT EXISTS clip_end          int;

-- Canonical forms only. Must match parseVideoLink() in js/auth.js and the
-- worker's parse_link(); a coach can write their own rows under RLS, so the
-- browser's validation alone is not a boundary.
ALTER TABLE public.movements
  ADD CONSTRAINT movements_source_url_format CHECK (
    source_url IS NULL
    OR source_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
    OR source_url ~ '^https://www\.instagram\.com/(p|reel)/[A-Za-z0-9_-]{5,40}/$'
  );

ALTER TABLE public.movements
  ADD CONSTRAINT movements_download_status_values CHECK (
    download_status IS NULL
    OR download_status IN ('pending', 'done', 'failed', 'link_only')
  );

-- A link always has a status; a file upload never has one.
ALTER TABLE public.movements
  ADD CONSTRAINT movements_link_has_status CHECK (
    (source_url IS NULL) = (download_status IS NULL)
  );

-- A part has both ends or neither, exists only on links, and is at most 3 minutes
-- (MAX_CLIP_SECONDS in js/auth.js; the worker re-checks it).
ALTER TABLE public.movements
  ADD CONSTRAINT movements_clip_pair CHECK ((clip_start IS NULL) = (clip_end IS NULL));

ALTER TABLE public.movements
  ADD CONSTRAINT movements_clip_link_only CHECK (clip_start IS NULL OR source_url IS NOT NULL);

ALTER TABLE public.movements
  ADD CONSTRAINT movements_clip_range CHECK (
    clip_start IS NULL
    OR (clip_start >= 0 AND clip_end > clip_start AND clip_end - clip_start <= 180)
  );

-- The worker's queue query.
CREATE INDEX IF NOT EXISTS movements_download_pending_idx
  ON public.movements (created_at)
  WHERE download_status = 'pending' AND archived_at IS NULL;
```

- [ ] **Step 5: Apply the migration to the live project**

Use `mcp__supabase__apply_migration` with name `video_links` and the SQL above. The change only adds columns and constraints, and every existing row passes them (all their new columns are NULL). Re-run the Step 1 query and confirm the seven columns exist.

- [ ] **Step 6: Run the tests to verify they pass**

Run the Step 3 command. Expected: all `video link constraints` tests PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261002000000_video_links.sql tests/security.spec.js
git commit -m "feat(db): source_url, clip_* and download_* columns for pasted video links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- supabase/migrations/20261002000000_video_links.sql tests/security.spec.js
```

---

### Task 2: Shared link and part helpers in auth.js

**Files:**
- Modify: `js/auth.js` (add after `isImagePath`)
- Modify: `css/style.css` (`.embed-frame`, `.clip-field`)
- Create: `tests/links.spec.js`

**Interfaces:**
- Produces (browser globals):
  - `parseVideoLink(raw) -> { platform: 'youtube'|'instagram', id, kind: 'watch'|'p'|'reel', canonicalUrl, startSeconds: number|null } | null`. `startSeconds` comes from YouTube's `t` and is always null for Instagram.
  - `embedUrl(link, clip|null) -> string`
  - `embedHtml(link, title, clip|null) -> string`, which returns `<div class="embed-frame embed-<platform>"><iframe …></div>`
  - `sourceLinkUrl(link, clip|null) -> string`: the canonical URL, plus `&t=<start>s` for a YouTube part
  - `platformLabel(platform) -> 'YouTube'|'Instagram'`
  - `fetchYouTubeInfo(canonicalUrl) -> Promise<{title, author}|null>` (never throws)
  - `nameFromYouTubeTitle(title) -> string`
  - `MAX_CLIP_SECONDS = 180`
  - `parseClipTime(text) -> int|null`; `formatClipTime(int) -> 'm:ss'|'h:mm:ss'`
  - `validateClip(usePart: bool, startText, endText) -> { clip: {start, end}|null, error: string|null }`
  - `clipLengthLabel(clip) -> '30 seconds'|'2:10 long'`
  - `movementClip(row) -> {start, end}|null`, built from `clip_start`/`clip_end`
  - `clipFieldsHtml(clip|null, prefillStart: int|null) -> string` and `bindClipFields(onChange: (result) => void)`. These render and wire the shared "Which part?" control, which uses the ids `clip-times`, `clip-start`, `clip-end`, `clip-note` and radios `name="clip-mode"` with values `whole` and `part`.

- [ ] **Step 1: Write the failing tests**

`tests/links.spec.js`:

```js
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/login');

const COACH_EMAIL    = process.env.COACH_EMAIL;
const COACH_PASSWORD = process.env.COACH_PASSWORD;

test.describe('link and part helpers', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/catalog.html');
  });

  const ACCEPT = [
    // The two links a coach actually sent (2026-10-02), tracking params and all
    ['https://youtu.be/4taYjKlmihU?is=YQq_o7bc6RAaqnx7', 'youtube', '4taYjKlmihU', 'https://www.youtube.com/watch?v=4taYjKlmihU', null],
    ['https://www.instagram.com/p/DdFIrIfk0W2/?stkn=MWxrN3ZjaTBreG0xag==', 'instagram', 'DdFIrIfk0W2', 'https://www.instagram.com/p/DdFIrIfk0W2/', null],
    ['https://www.youtube.com/watch?v=4taYjKlmihU&si=abc&t=69', 'youtube', '4taYjKlmihU', 'https://www.youtube.com/watch?v=4taYjKlmihU', 69],
    ['https://youtu.be/4taYjKlmihU?t=1m9s', 'youtube', '4taYjKlmihU', 'https://www.youtube.com/watch?v=4taYjKlmihU', 69],
    ['https://youtu.be/4taYjKlmihU?t=69s', 'youtube', '4taYjKlmihU', 'https://www.youtube.com/watch?v=4taYjKlmihU', 69],
    ['https://youtu.be/4taYjKlmihU?t=abc', 'youtube', '4taYjKlmihU', 'https://www.youtube.com/watch?v=4taYjKlmihU', null],
    ['https://m.youtube.com/watch?v=4taYjKlmihU', 'youtube', '4taYjKlmihU', 'https://www.youtube.com/watch?v=4taYjKlmihU', null],
    ['https://youtube.com/shorts/4taYjKlmihU?feature=share', 'youtube', '4taYjKlmihU', 'https://www.youtube.com/watch?v=4taYjKlmihU', null],
    ['https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=xyz', 'instagram', 'C1a2B3c4D5e', 'https://www.instagram.com/reel/C1a2B3c4D5e/', null],
    ['https://instagram.com/reels/C1a2B3c4D5e', 'instagram', 'C1a2B3c4D5e', 'https://www.instagram.com/reel/C1a2B3c4D5e/', null],
    ['  https://youtu.be/4taYjKlmihU\n', 'youtube', '4taYjKlmihU', 'https://www.youtube.com/watch?v=4taYjKlmihU', null],
  ];

  for (const [raw, platform, id, canonicalUrl, startSeconds] of ACCEPT) {
    test(`accepts ${JSON.stringify(raw)}`, async ({ page }) => {
      const r = await page.evaluate(u => parseVideoLink(u), raw);
      expect(r).toMatchObject({ platform, id, canonicalUrl, startSeconds });
    });
  }

  const REJECT = [
    '', 'not a url', 'javascript:alert(1)',
    'https://evil.example/watch?v=4taYjKlmihU',
    'https://www.youtube.com.evil.example/watch?v=4taYjKlmihU',
    'https://youtu.be.evil.example/4taYjKlmihU',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch?v=4taYjKlmih"',
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.instagram.com/someuser/',
    'https://www.instagram.com/p/a<b>c/',
    'https://www.tiktok.com/@x/video/123',
    'ftp://www.youtube.com/watch?v=4taYjKlmihU',
  ];

  for (const raw of REJECT) {
    test(`rejects ${JSON.stringify(raw)}`, async ({ page }) => {
      expect(await page.evaluate(u => parseVideoLink(u), raw)).toBeNull();
    });
  }

  test('embed URLs: whole video loops, a part starts and ends, Instagram ignores parts', async ({ page }) => {
    const r = await page.evaluate(() => {
      const yt = parseVideoLink('https://youtu.be/4taYjKlmihU?is=x');
      const ig = parseVideoLink('https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=x');
      return [embedUrl(yt, null), embedUrl(yt, { start: 69, end: 99 }), embedUrl(ig, { start: 69, end: 99 })];
    });
    expect(r).toEqual([
      'https://www.youtube-nocookie.com/embed/4taYjKlmihU?autoplay=1&mute=1&playsinline=1&loop=1&playlist=4taYjKlmihU',
      'https://www.youtube-nocookie.com/embed/4taYjKlmihU?autoplay=1&mute=1&playsinline=1&start=69&end=99',
      'https://www.instagram.com/reel/C1a2B3c4D5e/embed/',
    ]);
  });

  test('a non-integer part never reaches the embed URL', async ({ page }) => {
    const url = await page.evaluate(() =>
      embedUrl(parseVideoLink('https://youtu.be/4taYjKlmihU'), { start: '1&autoplay=0', end: 99 }));
    expect(url).not.toContain('start=');
    expect(url).toContain('loop=1');
  });

  test('sourceLinkUrl opens a YouTube part at its start', async ({ page }) => {
    const r = await page.evaluate(() => [
      sourceLinkUrl(parseVideoLink('https://youtu.be/4taYjKlmihU'), { start: 69, end: 99 }),
      sourceLinkUrl(parseVideoLink('https://youtu.be/4taYjKlmihU'), null),
      sourceLinkUrl(parseVideoLink('https://www.instagram.com/p/DdFIrIfk0W2/'), { start: 69, end: 99 }),
    ]);
    expect(r).toEqual([
      'https://www.youtube.com/watch?v=4taYjKlmihU&t=69s',
      'https://www.youtube.com/watch?v=4taYjKlmihU',
      'https://www.instagram.com/p/DdFIrIfk0W2/',
    ]);
  });

  test('embedHtml escapes the title', async ({ page }) => {
    const html = await page.evaluate(() =>
      embedHtml(parseVideoLink('https://youtu.be/4taYjKlmihU'), '"><script>x</script>', null));
    expect(html).not.toContain('<script>');
    expect(html).toContain('class="embed-frame embed-youtube"');
  });

  test('parseClipTime and formatClipTime', async ({ page }) => {
    const r = await page.evaluate(() => [
      parseClipTime('1:09'), parseClipTime('69'), parseClipTime(' 0:05 '), parseClipTime('1:02:03'),
      parseClipTime('1:9'), parseClipTime('1:60'), parseClipTime('abc'), parseClipTime(''), parseClipTime('-5'),
      formatClipTime(69), formatClipTime(5), formatClipTime(3723),
    ]);
    expect(r).toEqual([69, 69, 5, 3723, 69, null, null, null, null, '1:09', '0:05', '1:02:03']);
  });

  test('validateClip', async ({ page }) => {
    const r = await page.evaluate(() => [
      validateClip(false, '', ''),
      validateClip(true, '1:09', '1:39'),
      validateClip(true, '1:09', '1:09'),
      validateClip(true, '1:39', '1:09'),
      validateClip(true, '0:00', '3:01'),
      validateClip(true, '0:00', '3:00'),
      validateClip(true, 'x', '1:00'),
    ]);
    expect(r).toEqual([
      { clip: null, error: null },
      { clip: { start: 69, end: 99 }, error: null },
      { clip: null, error: 'End must be after Start.' },
      { clip: null, error: 'End must be after Start.' },
      { clip: null, error: 'A part can be at most 3 minutes.' },
      { clip: { start: 0, end: 180 }, error: null },
      { clip: null, error: 'Enter times like 1:09.' },
    ]);
  });

  test('clipLengthLabel', async ({ page }) => {
    expect(await page.evaluate(() => [clipLengthLabel({ start: 69, end: 99 }), clipLengthLabel({ start: 0, end: 130 })]))
      .toEqual(['30 seconds', '2:10 long']);
  });

  test('nameFromYouTubeTitle keeps the part before the first pipe', async ({ page }) => {
    const r = await page.evaluate(() => [
      nameFromYouTubeTitle('Fast Footwork & Agility Ladder Drills | Speed & Agility Performance'),
      nameFromYouTubeTitle('Goblet Squat'),
      nameFromYouTubeTitle(''),
    ]);
    expect(r).toEqual(['Fast Footwork & Agility Ladder Drills', 'Goblet Squat', '']);
  });

  test('fetchYouTubeInfo returns null instead of throwing when oEmbed fails', async ({ page }) => {
    await page.route('https://www.youtube.com/oembed**', route => route.fulfill({ status: 500, body: '' }));
    expect(await page.evaluate(() => fetchYouTubeInfo('https://www.youtube.com/watch?v=4taYjKlmihU'))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `source ~/.zshrc && npx op run --env-file=.env.op -- npx playwright test tests/links.spec.js`
Expected: FAIL with `parseVideoLink is not defined`.

- [ ] **Step 3: Implement the helpers in `js/auth.js`** (directly after `isImagePath`)

```js
// ── Video links (YouTube / Instagram) ─────────────────────────
// Single source of truth for which pasted links are accepted. Embed URLs are
// rebuilt from the parsed ID and integer seconds only — raw input never
// reaches an iframe src. Must stay in step with the source_url / clip CHECK
// constraints (supabase/migrations/20261002000000_video_links.sql) and the NAS
// worker's parse_link() (dev.tools/automation/archive_evolve_links/archive_links.py).
function parseVideoLink(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  let m;

  if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
    if (path === '/watch') return youtubeLink(u.searchParams.get('v'), u);
    m = path.match(/^\/shorts\/([^/]+)\/?$/);
    return youtubeLink(m && m[1], u);
  }
  if (host === 'youtu.be') {
    m = path.match(/^\/([^/]+)\/?$/);
    return youtubeLink(m && m[1], u);
  }
  if (host === 'instagram.com' || host === 'www.instagram.com') {
    m = path.match(/^\/(p|reels?)\/([^/]+)\/?$/);
    if (!m || !/^[A-Za-z0-9_-]{5,40}$/.test(m[2])) return null;
    const kind = m[1] === 'p' ? 'p' : 'reel';
    return {
      platform: 'instagram', id: m[2], kind,
      canonicalUrl: `https://www.instagram.com/${kind}/${m[2]}/`,
      startSeconds: null,
    };
  }
  return null;
}

function youtubeLink(id, u) {
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return {
    platform: 'youtube', id, kind: 'watch',
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
    startSeconds: parseYouTubeT(u.searchParams.get('t')),
  };
}

// YouTube's t= comes as 69, 69s or 1m9s. Anything else is ignored.
function parseYouTubeT(t) {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t || '');
  if (!t || !m) return null;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

function isValidClip(clip) {
  return !!clip && Number.isInteger(clip.start) && Number.isInteger(clip.end) && clip.end > clip.start;
}

function embedUrl(link, clip) {
  if (link.platform === 'instagram') {
    return `https://www.instagram.com/${link.kind}/${link.id}/embed/`;   // no start/end support
  }
  const base = `https://www.youtube-nocookie.com/embed/${link.id}?autoplay=1&mute=1&playsinline=1`;
  // YouTube's loop restarts at 0:00, not at start — so a part plays once until the R2 copy lands.
  return isValidClip(clip)
    ? `${base}&start=${clip.start}&end=${clip.end}`
    : `${base}&loop=1&playlist=${link.id}`;
}

function embedHtml(link, title, clip) {
  return `<div class="embed-frame embed-${link.platform}">` +
    `<iframe src="${escape(embedUrl(link, clip))}" title="${escape(title || 'Movement video')}" ` +
    `allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen ` +
    `referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
}

function sourceLinkUrl(link, clip) {
  return link.platform === 'youtube' && isValidClip(clip)
    ? `${link.canonicalUrl}&t=${clip.start}s`
    : link.canonicalUrl;
}

function platformLabel(platform) {
  return platform === 'youtube' ? 'YouTube' : 'Instagram';
}

// YouTube oEmbed answers CORS for this origin (verified 2026-10-02). Instagram's
// does not, and its "title" is the whole caption — so YouTube only.
async function fetchYouTubeInfo(canonicalUrl) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonicalUrl)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return { title: data.title || '', author: data.author_name || '' };
  } catch {
    return null;
  }
}

// YouTube titles are marketing — "Goblet Squat | 5 Tips for…". Keep the first part.
function nameFromYouTubeTitle(title) {
  return (title || '').split('|')[0].trim();
}

// ── Parts of a linked video ───────────────────────────────────
// Whole video by default; a coach can pick Start and End. Stored as whole
// seconds in clip_start / clip_end. The 180 s cap matches the CHECK constraint.
const MAX_CLIP_SECONDS = 180;

function parseClipTime(text) {
  const t = String(text ?? '').trim();
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
  const parts = t.split(':').map(Number);
  if (parts.slice(1).some(n => n > 59)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function formatClipTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function validateClip(usePart, startText, endText) {
  if (!usePart) return { clip: null, error: null };
  const start = parseClipTime(startText);
  const end   = parseClipTime(endText);
  if (start === null || end === null) return { clip: null, error: 'Enter times like 1:09.' };
  if (end <= start) return { clip: null, error: 'End must be after Start.' };
  if (end - start > MAX_CLIP_SECONDS) return { clip: null, error: 'A part can be at most 3 minutes.' };
  return { clip: { start, end }, error: null };
}

function clipLengthLabel(clip) {
  const n = clip.end - clip.start;
  return n < 60 ? `${n} seconds` : `${formatClipTime(n)} long`;
}

function movementClip(row) {
  return row && row.clip_start != null && row.clip_end != null
    ? { start: row.clip_start, end: row.clip_end }
    : null;
}

// The shared "Which part?" control — upload page and the movement edit page.
function clipFieldsHtml(clip, prefillStart) {
  const startVal = clip ? formatClipTime(clip.start) : (prefillStart != null ? formatClipTime(prefillStart) : '');
  const endVal   = clip ? formatClipTime(clip.end) : '';
  return `
    <div class="field clip-field">
      <label>Which part?</label>
      <div class="clip-mode">
        <label><input type="radio" name="clip-mode" value="whole" ${clip ? '' : 'checked'}> Whole video</label>
        <label><input type="radio" name="clip-mode" value="part" ${clip ? 'checked' : ''}> Use only part of it</label>
      </div>
      <div class="clip-times${clip ? '' : ' hidden'}" id="clip-times">
        <label>Start <input type="text" id="clip-start" inputmode="numeric" placeholder="1:09" value="${escape(startVal)}"></label>
        <label>End <input type="text" id="clip-end" inputmode="numeric" placeholder="1:39" value="${escape(endVal)}"></label>
      </div>
      <p class="field-hint" id="clip-note"></p>
    </div>`;
}

// Calls onChange({ clip, error }) now and after every edit.
function bindClipFields(onChange) {
  const times = document.getElementById('clip-times');
  const note  = document.getElementById('clip-note');
  const field = times.closest('.clip-field');
  const read = () => {
    const usePart   = field.querySelector('input[name="clip-mode"]:checked').value === 'part';
    const startText = document.getElementById('clip-start').value;
    const endText   = document.getElementById('clip-end').value;
    const result    = validateClip(usePart, startText, endText);
    // Don't nag before both times are typed.
    const incomplete = usePart && (!startText.trim() || !endText.trim());
    times.classList.toggle('hidden', !usePart);
    note.textContent = !usePart ? ''
      : result.clip ? clipLengthLabel(result.clip)
      : incomplete ? 'Enter a start and end time.'
      : result.error;
    note.classList.toggle('clip-error', usePart && !result.clip && !incomplete);
    onChange(result);
  };
  field.addEventListener('input', read);
  field.addEventListener('change', read);
  read();
}
```

- [ ] **Step 4: Add the CSS** to `css/style.css`, after `.video-player`

```css
.embed-frame {
  width: 100%;
  max-width: 420px;
  margin: 0 auto 1.5rem;
  border-radius: var(--radius);
  overflow: hidden;
  background: #000;
}

/* Clips are mostly vertical (Shorts / Reels); 9:16 suits them and letterboxes the rest. */
.embed-frame.embed-youtube { aspect-ratio: 9 / 16; max-height: 70vh; }
/* Instagram's embed adds its own header and caption — give it room. */
.embed-frame.embed-instagram { height: 70vh; background: #fff; }

.embed-frame iframe {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}

.clip-mode {
  display: flex;
  gap: 1.25rem;
  flex-wrap: wrap;
  font-size: 0.9375rem;
}

.clip-mode label { display: flex; align-items: center; gap: 0.375rem; font-weight: normal; }

.clip-times {
  display: flex;
  gap: 1rem;
  margin-top: 0.75rem;
}

.clip-times label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; }
.clip-times input { width: 6rem; }

.clip-error { color: #b91c1c; }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run the Step 2 command. Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/links.spec.js
git commit -m "feat: link, embed and part helpers for pasted video links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- js/auth.js css/style.css tests/links.spec.js
```

---

### Task 3: Movement page plays links, with a credit line

**Files:**
- Modify: `js/movement.js` (`load`, `renderView`, `renderEdit` media block)
- Modify: `css/style.css` (`.source-credit`)
- Modify: `tests/helpers/fixtures.js`, `tests/movement.spec.js`

**Interfaces:**
- Consumes: `parseVideoLink`, `embedHtml`, `sourceLinkUrl`, `platformLabel`, `movementClip` (Task 2).
- Produces: `movement.link` (the parsed link, or `null`) set in `load()`; `setupLinkMovementFixture(email, password, over) -> { client, id }` and `teardownLinkMovementFixture(client, id)` in fixtures.js.

- [ ] **Step 1: Add the fixture helpers** to `tests/helpers/fixtures.js` (and export them)

```js
// Link fixtures are NEVER inserted as 'pending' — the NAS worker polls the live
// database and would try to copy them. link_only / done / failed are ignored by it.
async function setupLinkMovementFixture(email, password, over = {}) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError) throw new Error(`Fixture auth failed: ${authError.message}`);
  const { data: { user } } = await client.auth.getUser();

  const { data, error } = await client.from('movements').insert({
    name:            '__test_link_fixture__',
    alt_names:       [],
    tags:            [],
    comments:        null,
    video_path:      null,
    source_url:      'https://www.youtube.com/watch?v=4taYjKlmihU',
    source_author:   "Pierre's Elite Performance",
    download_status: 'link_only',
    uploaded_by:     user.id,
    ...over,
  }).select('id').single();

  if (error) throw new Error(`Link fixture insert failed: ${error.message}`);
  return { client, id: data.id };
}

async function teardownLinkMovementFixture(client, id) {
  if (!client || !id) return;
  const { error } = await client.from('movements').delete().eq('id', id);
  if (error) throw new Error(`Link fixture cleanup failed: ${error.message}`);
}
```

- [ ] **Step 2: Write the failing tests** (append to `tests/movement.spec.js`; add the new helpers to the `require`)

```js
// Keep third-party players off the network in tests.
async function stubEmbeds(page) {
  await page.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
  await page.route('https://www.instagram.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
}

test.describe('Movement detail page — pasted link', () => {
  let linkFixture;
  test.beforeAll(async () => { linkFixture = await setupLinkMovementFixture(COACH_EMAIL, COACH_PASSWORD); });
  test.afterAll(async () => { await teardownLinkMovementFixture(linkFixture?.client, linkFixture?.id); });

  test('link-only movement plays the YouTube embed', async ({ page }) => {
    await stubEmbeds(page);
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${linkFixture.id}`);
    const frame = page.locator('.embed-frame iframe');
    await expect(frame).toBeVisible({ timeout: 20000 });
    await expect(frame).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/4taYjKlmihU\?/);
    await expect(page.locator('video.video-player')).toHaveCount(0);
  });

  test('credit line names the creator and links to the original', async ({ page }) => {
    await stubEmbeds(page);
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${linkFixture.id}`);
    const credit = page.locator('.source-credit a');
    await expect(credit).toHaveText("From Pierre's Elite Performance on YouTube ↗");
    await expect(credit).toHaveAttribute('href', 'https://www.youtube.com/watch?v=4taYjKlmihU');
    await expect(credit).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

test.describe('Movement detail page — copied link', () => {
  let doneFixture;
  test.beforeAll(async () => {
    doneFixture = await setupLinkMovementFixture(COACH_EMAIL, COACH_PASSWORD, {
      video_path: '00000000-0000-0000-0000-000000000003.mp4', download_status: 'done', source_author: null,
    });
  });
  test.afterAll(async () => { await teardownLinkMovementFixture(doneFixture?.client, doneFixture?.id); });

  test('a copied link plays from R2 and keeps a credit line', async ({ page }) => {
    await page.route('**/functions/v1/r2-signed-url', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedUrl: 'http://localhost:8080/img/logo.png' }) }));
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${doneFixture.id}`);
    await expect(page.locator('video.video-player')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.embed-frame')).toHaveCount(0);
    await expect(page.locator('.source-credit a')).toHaveText('From YouTube ↗');
  });
});

test.describe('Movement detail page — a part of a link', () => {
  let partFixture;
  test.beforeAll(async () => {
    partFixture = await setupLinkMovementFixture(COACH_EMAIL, COACH_PASSWORD, { clip_start: 69, clip_end: 99 });
  });
  test.afterAll(async () => { await teardownLinkMovementFixture(partFixture?.client, partFixture?.id); });

  test('the embed plays just the part, and the credit opens at its start', async ({ page }) => {
    await stubEmbeds(page);
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${partFixture.id}`);
    await expect(page.locator('.embed-frame iframe')).toHaveAttribute('src', /&start=69&end=99$/);
    await expect(page.locator('.source-credit a')).toHaveAttribute('href', 'https://www.youtube.com/watch?v=4taYjKlmihU&t=69s');
  });
});

test('a movement whose link cannot be parsed shows the no-media error', async ({ page }) => {
  // The CHECK constraint makes this row impossible to insert, so stub the read.
  await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  await page.route('**/rest/v1/movements**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 'x', name: 'Broken', tags: [], alt_names: [], comments: null,
      video_path: null, source_url: 'https://evil.example/x', download_status: 'link_only', uploaded_by: null }),
  }));
  await page.goto('/movement.html?id=00000000-0000-0000-0000-00000000000f');
  await expect(page.locator('.status-msg.error')).toHaveText('Movement has no media file.');
  await expect(page.locator('iframe')).toHaveCount(0);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `source ~/.zshrc && npx op run --env-file=.env.op -- npx playwright test tests/movement.spec.js`
Expected: the new tests FAIL (the page shows "Could not load file." or errors), and the existing tests still pass.

- [ ] **Step 4: Implement in `js/movement.js`**

In `load()`, replace everything from `// Check cache before calling edge function` through the end of the `if (!signedUrl) { sessionStorage.setItem… }` block with:

```js
  // What plays: R2 file if there is one, else the pasted link's embed.
  movement.link = movement.video_path ? null : parseVideoLink(movement.source_url);

  if (!movement.video_path && !movement.link) {
    contentEl.innerHTML = '<p class="status-msg error">Movement has no media file.</p>';
    return;
  }

  let signedUrl = null;
  if (movement.video_path) {
    // Check cache before calling edge function (signed URLs last 24h)
    const cacheKey = `signed-url:${movement.video_path}`;
    const cached   = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { url, expires } = JSON.parse(cached);
        if (Date.now() < expires) signedUrl = url;
      } catch {}
    }
  }

  const [signedResult, uploaderResult] = await Promise.all([
    !movement.video_path ? Promise.resolve({ signedUrl: null })
      : signedUrl ? Promise.resolve({ signedUrl })
      : callEdgeFunction('r2-signed-url', { path: movement.video_path }),
    client.from('profiles').select('full_name').eq('id', movement.uploaded_by).single()
  ]);

  if (movement.video_path && (signedResult.error || !signedResult.signedUrl)) {
    contentEl.innerHTML = '<p class="status-msg error">Could not load file. Please try again.</p>';
    return;
  }

  if (movement.video_path && !signedUrl) {
    sessionStorage.setItem(`signed-url:${movement.video_path}`, JSON.stringify({
      url:     signedResult.signedUrl,
      expires: Date.now() + 60 * 60 * 1000,
    }));
  }
```

(The old `if (!movement.video_path) { … 'Movement has no media file.' … }` block is now covered above, so delete it.)

Add a media helper above `renderView`:

```js
// ── Media ────────────────────────────────────────────────────
function mediaHtml(forEdit) {
  if (movement.link) return embedHtml(movement.link, movement.name, movementClip(movement));
  if (isImagePath(movement.video_path)) {
    return `<img class="video-player" src="${movement.signedUrl}" alt="${escape(movement.name)}" id="${forEdit ? 'edit-image' : 'movement-image'}"${forEdit ? '' : ' style="cursor:pointer;"'}>`;
  }
  return forEdit
    ? `<video class="video-player" controls playsinline id="video-player">
        <source src="${movement.signedUrl}">
        Your browser does not support video playback.
       </video>`
    : `<video class="video-player" controls playsinline autoplay muted loop>
        <source src="${movement.signedUrl}">
        Your browser does not support video playback.
       </video>`;
}

function sourceCreditHtml() {
  const src = parseVideoLink(movement.source_url);
  if (!src) return '';
  const label = movement.source_author
    ? `From ${escape(movement.source_author)} on ${platformLabel(src.platform)} ↗`
    : `From ${platformLabel(src.platform)} ↗`;
  return `<p class="source-credit"><a href="${escape(sourceLinkUrl(src, movementClip(movement)))}" target="_blank" rel="noopener noreferrer">${label}</a></p>`;
}
```

In `renderView()`, delete the local `const mediaHtml = …` and change the template's first lines to:

```js
  contentEl.innerHTML = `
    ${mediaHtml(false)}
    ${sourceCreditHtml()}

    <div class="detail-header">
```

Change the image fullscreen guard to `if (!movement.link && isImagePath(movement.video_path)) {`.

In `renderEdit()`, delete the local `const editMediaHtml = …` and use `${mediaHtml(true)}` where `${editMediaHtml}` was.

`css/style.css`, after `.embed-frame iframe`:

```css
.source-credit {
  text-align: center;
  margin: -1rem 0 1.25rem;
  font-size: 0.875rem;
}

.source-credit a {
  color: var(--text-muted);
  text-decoration: none;
}

.source-credit a:hover {
  color: var(--accent);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run the Step 3 command. Expected: all PASS, including the existing movement tests.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(movement): play pasted links via embed, credit the creator

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- js/movement.js css/style.css tests/helpers/fixtures.js tests/movement.spec.js
```

---

### Task 4: Upload page — paste a link

**Files:**
- Modify: `upload.html` (link field below `#file-drop`; `#single-embed` and `#link-warning` in single mode)
- Modify: `js/upload.js`
- Modify: `css/style.css` (`.link-paste`)
- Modify: `tests/upload.spec.js`

**Interfaces:**
- Consumes: `parseVideoLink`, `embedHtml`, `fetchYouTubeInfo`, `nameFromYouTubeTitle`, `clipFieldsHtml`, `bindClipFields` (Task 2).
- Produces: a movements INSERT with `{ name, alt_names, tags, comments, video_path: null, source_url: <canonical>, source_author: <YouTube author or null>, clip_start, clip_end (null for the whole video), download_status: 'pending', uploaded_by }`.

- [ ] **Step 1: Write the failing tests** (append to `tests/upload.spec.js`)

```js
const YT_LINK = 'https://youtu.be/4taYjKlmihU?is=YQq_o7bc6RAaqnx7';
const IG_LINK = 'https://www.instagram.com/p/DdFIrIfk0W2/?stkn=MWxrN3ZjaTBreG0xag==';

async function stubLinkServices(page, { oembed = 200 } = {}) {
  await page.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
  await page.route('https://www.instagram.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
  await page.route('https://www.youtube.com/oembed**', r => oembed === 200
    ? r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ title: 'Fast Footwork & Agility Ladder Drills | Speed & Agility Performance', author_name: "Pierre's Elite Performance" }) })
    : r.fulfill({ status: oembed, body: '' }));
}

// Intercept the INSERT so no 'pending' row ever reaches the live database
// (the NAS worker would try to copy it). Returns a getter for the posted body.
async function captureMovementInsert(page) {
  let body = null;
  await page.route('**/rest/v1/movements**', async route => {
    if (route.request().method() === 'POST') {
      body = route.request().postDataJSON();
      await route.fulfill({ status: 201, body: '' });
    } else {
      await route.continue();
    }
  });
  return () => body;
}

test.describe('Upload page — paste a link', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
  });

  test('link field is visible under the drop zone', async ({ page }) => {
    await page.goto('/upload.html');
    await expect(page.locator('label[for="video-link"]')).toHaveText('…or paste a YouTube or Instagram link');
  });

  test('pasting a YouTube link shows the embed and suggests a name', async ({ page }) => {
    await stubLinkServices(page);
    await page.goto('/upload.html');
    await page.fill('#video-link', YT_LINK);
    await expect(page.locator('#single-mode')).toBeVisible();
    await expect(page.locator('#single-embed iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/4taYjKlmihU/);
    await expect(page.locator('#name')).toHaveValue('Fast Footwork & Agility Ladder Drills');
    await expect(page.locator('#name-ocr-hint')).toHaveText('Suggested from the YouTube title — edit if needed.');
    await expect(page.locator('#submit-btn')).toHaveText('Save Movement');
  });

  test('pasting an Instagram link leaves the name blank', async ({ page }) => {
    await stubLinkServices(page);
    await page.goto('/upload.html');
    await page.fill('#video-link', IG_LINK);
    await expect(page.locator('#single-embed iframe')).toHaveAttribute('src', 'https://www.instagram.com/p/DdFIrIfk0W2/embed/');
    await expect(page.locator('#name')).toHaveValue('');
  });

  test('an unsupported link shows a friendly error and no form', async ({ page }) => {
    await page.goto('/upload.html');
    await page.fill('#video-link', 'https://www.tiktok.com/@x/video/123');
    await expect(page.locator('#link-error')).toHaveText('That link isn’t supported — paste a YouTube or Instagram link.');
    await expect(page.locator('#single-mode')).toBeHidden();
  });

  test('saving a link inserts a pending movement with the canonical URL', async ({ page }) => {
    await stubLinkServices(page);
    await page.goto('/upload.html');
    const inserted = await captureMovementInsert(page);
    await page.fill('#video-link', YT_LINK);
    await expect(page.locator('#name')).toHaveValue('Fast Footwork & Agility Ladder Drills');
    await page.click('#submit-btn');
    await page.waitForURL('**/catalog.html');
    expect(inserted()).toMatchObject({
      name: 'Fast Footwork & Agility Ladder Drills',
      video_path: null,
      source_url: 'https://www.youtube.com/watch?v=4taYjKlmihU',
      source_author: "Pierre's Elite Performance",
      clip_start: null,
      clip_end: null,
      download_status: 'pending',
    });
  });

  test('Whole video is the default; choosing a part shows Start/End and its length', async ({ page }) => {
    await stubLinkServices(page);
    await page.goto('/upload.html');
    await page.fill('#video-link', YT_LINK);
    await expect(page.locator('input[name="clip-mode"][value="whole"]')).toBeChecked();
    await expect(page.locator('#clip-times')).toBeHidden();
    await page.check('input[name="clip-mode"][value="part"]');
    await page.fill('#clip-start', '1:09');
    await page.fill('#clip-end', '1:39');
    await expect(page.locator('#clip-note')).toHaveText('30 seconds');
    await expect(page.locator('#single-embed iframe')).toHaveAttribute('src', /&start=69&end=99$/);
  });

  test('saving a part stores clip_start and clip_end', async ({ page }) => {
    await stubLinkServices(page);
    await page.goto('/upload.html');
    const inserted = await captureMovementInsert(page);
    await page.fill('#video-link', YT_LINK);
    await expect(page.locator('#name')).toHaveValue('Fast Footwork & Agility Ladder Drills');
    await page.check('input[name="clip-mode"][value="part"]');
    await page.fill('#clip-start', '1:09');
    await page.fill('#clip-end', '1:39');
    await page.click('#submit-btn');
    await page.waitForURL('**/catalog.html');
    expect(inserted()).toMatchObject({ clip_start: 69, clip_end: 99, download_status: 'pending' });
  });

  test('an invalid part blocks Save with an inline message', async ({ page }) => {
    await stubLinkServices(page);
    await page.goto('/upload.html');
    const inserted = await captureMovementInsert(page);
    await page.fill('#video-link', YT_LINK);
    await page.check('input[name="clip-mode"][value="part"]');
    await page.fill('#clip-start', '1:39');
    await page.fill('#clip-end', '1:09');
    await expect(page.locator('#clip-note')).toHaveText('End must be after Start.');
    await expect(page.locator('#submit-btn')).toBeDisabled();
    expect(inserted()).toBeNull();
  });

  test('a YouTube link with ?t= pre-fills Start but stays on Whole video', async ({ page }) => {
    await stubLinkServices(page);
    await page.goto('/upload.html');
    await page.fill('#video-link', 'https://youtu.be/4taYjKlmihU?t=69');
    await expect(page.locator('input[name="clip-mode"][value="whole"]')).toBeChecked();
    await page.check('input[name="clip-mode"][value="part"]');
    await expect(page.locator('#clip-start')).toHaveValue('1:09');
  });

  test('oEmbed failing never blocks saving', async ({ page }) => {
    await stubLinkServices(page, { oembed: 500 });
    await page.goto('/upload.html');
    const inserted = await captureMovementInsert(page);
    await page.fill('#video-link', YT_LINK);
    await page.fill('#name', 'Ladder Drill');
    await page.click('#submit-btn');
    await page.waitForURL('**/catalog.html');
    expect(inserted()).toMatchObject({ name: 'Ladder Drill', source_author: null, download_status: 'pending' });
  });

  test('choosing a file after a link clears the link', async ({ page }) => {
    await stubLinkServices(page);
    await page.goto('/upload.html');
    await page.fill('#video-link', YT_LINK);
    await expect(page.locator('#single-embed iframe')).toBeVisible();
    await mockFrameExtraction(page);
    await mockVisionName(page, 'Goblet Squat');
    await page.setInputFiles('#video-file', FAKE_VIDEO);
    await expect(page.locator('#video-link')).toHaveValue('');
    await expect(page.locator('#single-embed')).toBeHidden();
    await expect(page.locator('#submit-btn')).toHaveText('Upload Movement');
  });

  test('a link already in the library shows a duplicate warning', async ({ page }) => {
    const fx = await setupLinkMovementFixture(COACH_EMAIL, COACH_PASSWORD);
    try {
      await stubLinkServices(page);
      await page.goto('/upload.html');
      await page.fill('#video-link', YT_LINK);
      await expect(page.locator('#link-warning')).toHaveText('This link is already saved as "__test_link_fixture__" — check the catalog before saving.');
    } finally {
      await teardownLinkMovementFixture(fx.client, fx.id);
    }
  });
});
```

Add to the top of `tests/upload.spec.js`: `const { setupLinkMovementFixture, teardownLinkMovementFixture } = require('./helpers/fixtures');`

- [ ] **Step 2: Run the tests to verify they fail**

Run: `source ~/.zshrc && npx op run --env-file=.env.op -- npx playwright test tests/upload.spec.js -g "paste a link"`
Expected: FAIL (`#video-link` not found).

- [ ] **Step 3: Add the markup to `upload.html`**

Directly after the closing `</div>` of `#file-drop`:

```html
    <!-- Paste a link instead of a file (one per upload) -->
    <div class="link-paste" id="link-paste">
      <label for="video-link" class="link-paste-label">…or paste a YouTube or Instagram link</label>
      <input type="url" id="video-link" placeholder="https://www.instagram.com/reel/…" inputmode="url" autocomplete="off">
      <div id="link-error" class="error hidden"></div>
    </div>
```

Inside `#single-mode`, directly before `<div id="single-preview" …>`:

```html
      <!-- Embed preview + part chooser (link mode) -->
      <div id="single-embed" class="hidden"></div>
      <div id="link-warning" class="warning hidden"></div>
      <div id="clip-slot" class="hidden"></div>
```

- [ ] **Step 4: Implement in `js/upload.js`**

Under `// ── Single mode elements ──` add:

```js
const linkInput    = document.getElementById('video-link');
const linkError    = document.getElementById('link-error');
const linkWarning  = document.getElementById('link-warning');
const singleEmbed  = document.getElementById('single-embed');
const clipSlot     = document.getElementById('clip-slot');
```

Under `// ── Single mode state ──` add:

```js
let currentLink = null;   // parsed link when the coach pasted one instead of a file
let linkAuthor  = null;   // YouTube oEmbed author_name, saved as source_author
let linkClip    = { clip: null, error: null };   // latest validateClip() result
```

At the very start of `activateSingle(file)` add `clearLink();`. At the start of `activateBulk(…)` add `clearLink();`.

Add a new section after `// SINGLE MODE`'s `activateSingle`:

```js
// ── Link mode ─────────────────────────────────────────────────────────────────
linkInput.addEventListener('input', () => {
  const raw = linkInput.value.trim();
  linkError.classList.add('hidden');
  if (!raw) { if (currentLink) resetToEmpty(); return; }

  const link = parseVideoLink(raw);
  if (!link) {
    linkError.textContent = 'That link isn’t supported — paste a YouTube or Instagram link.';
    linkError.classList.remove('hidden');
    return;
  }
  if (currentLink && currentLink.canonicalUrl === link.canonicalUrl) return;
  activateLink(link);
});

function activateLink(link) {
  if (currentMode === 'bulk') {
    queue = [];
    bulkQueueEl.innerHTML = '';
    bulkMode.classList.add('hidden');
    mainPage.classList.remove('page-wide');
  }
  currentMode = 'single';
  singleFile  = null;
  fileInput.value       = '';
  fileLabel.textContent = 'Drop videos or photos here or click to browse';
  currentLink = link;
  linkAuthor  = null;

  singleMode.classList.remove('hidden');
  fileAiHint.classList.add('hidden');
  errorMsg.classList.add('hidden');
  document.getElementById('single-preview').classList.add('hidden');
  singleEmbed.innerHTML = embedHtml(link, 'Preview', null);
  singleEmbed.classList.remove('hidden');

  // Whole video by default; YouTube's t= only pre-fills Start.
  linkClip = { clip: null, error: null };
  clipSlot.innerHTML = clipFieldsHtml(null, link.startSeconds);
  clipSlot.classList.remove('hidden');
  bindClipFields(result => {
    const changed = JSON.stringify(result.clip) !== JSON.stringify(linkClip.clip);
    linkClip = result;
    submitBtn.disabled = !!result.error;
    // Re-render the preview only when the playable part actually changes.
    if (changed && link.platform === 'youtube') singleEmbed.innerHTML = embedHtml(link, 'Preview', result.clip);
  });
  if (ocrFilledName) { nameInput.value = ''; ocrFilledName = false; }
  nameOcrHint.classList.add('hidden');

  submitBtn.disabled    = false;
  submitBtn.textContent = 'Save Movement';

  checkDuplicateLink(link);
  if (link.platform === 'youtube') suggestNameFromYouTube(link);
}

function clearLink() {
  if (!currentLink && !linkInput.value) return;
  currentLink = null;
  linkAuthor  = null;
  linkInput.value = '';
  linkError.classList.add('hidden');
  linkWarning.classList.add('hidden');
  singleEmbed.innerHTML = '';
  singleEmbed.classList.add('hidden');
  clipSlot.innerHTML = '';
  clipSlot.classList.add('hidden');
  linkClip = { clip: null, error: null };
  submitBtn.disabled    = false;
  submitBtn.textContent = 'Upload Movement';
}

function resetToEmpty() {
  clearLink();
  singleMode.classList.add('hidden');
  fileAiHint.classList.remove('hidden');
}

async function suggestNameFromYouTube(link) {
  const info = await fetchYouTubeInfo(link.canonicalUrl);
  if (!info || currentLink !== link) return;   // coach moved on
  linkAuthor = info.author || null;
  const suggested = nameFromYouTubeTitle(info.title);
  if (suggested && (!nameInput.value.trim() || ocrFilledName)) {
    nameInput.value = suggested;
    ocrFilledName   = true;
    nameOcrHint.textContent = 'Suggested from the YouTube title — edit if needed.';
    nameOcrHint.classList.remove('hidden');
  }
}

async function checkDuplicateLink(link) {
  linkWarning.classList.add('hidden');
  const { data } = await client.from('movements').select('name')
    .eq('source_url', link.canonicalUrl).is('archived_at', null).limit(1);
  if (data && data.length > 0 && currentLink === link) {
    linkWarning.textContent = `This link is already saved as "${data[0].name}" — check the catalog before saving.`;
    linkWarning.classList.remove('hidden');
  }
}

async function submitLink({ name, alt_names, tags, comments }) {
  if (linkClip.error) { showSingleError(linkClip.error); return; }
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Saving…';
  errorMsg.classList.add('hidden');

  const session = await getSession();
  const { error } = await client.from('movements').insert({
    name, alt_names, tags, comments: comments || null,
    video_path:      null,
    source_url:      currentLink.canonicalUrl,
    source_author:   linkAuthor,
    clip_start:      linkClip.clip ? linkClip.clip.start : null,
    clip_end:        linkClip.clip ? linkClip.clip.end : null,
    download_status: 'pending',
    uploaded_by:     session.user.id,
  });

  if (error) {
    showSingleError('Failed to save movement. Please try again.');
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Save Movement';
    return;
  }
  window.location.href = 'catalog.html';
}
```

`let singleFile = null;` is currently declared further down the file (around line 339). Move that declaration up into the `// ── Single mode state ──` block so `activateLink` can reset it without a temporal-dead-zone error.

In the form `submit` handler, directly after `if (!name) { showSingleError('Movement name is required.'); return; }`, add:

```js
  if (currentLink) { await submitLink({ name, alt_names, tags, comments }); return; }
```

`css/style.css`, after `.file-drop` rules:

```css
.link-paste {
  margin: -0.5rem 0 1.25rem;
}

.link-paste-label {
  display: block;
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 0.375rem;
}

.link-paste .error {
  margin-top: 0.5rem;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run the full upload file: `source ~/.zshrc && npx op run --env-file=.env.op -- npx playwright test tests/upload.spec.js`
Expected: all PASS (the new tests and every existing upload test).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(upload): paste a YouTube or Instagram link, optionally just part of it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- upload.html js/upload.js css/style.css tests/upload.spec.js
```

---

### Task 5: Replace with a file or a link

**Files:**
- Modify: `js/movement.js` (`renderEdit` replace section, `replaceVideo`)
- Modify: `tests/movement.spec.js`

**Interfaces:**
- Consumes: `parseVideoLink`, `fetchYouTubeInfo`, `clipFieldsHtml`, `bindClipFields`, `movementClip` (Task 2), and `mediaHtml` (Task 3).
- Produces:
  - Link replace: a PATCH `{ video_path: null, source_url, source_author, clip_start, clip_end, download_status: 'pending', download_attempts: 0, download_error: null }`. **This is also how a coach changes the part of an existing link:** the edit page pre-fills the current link and part. The old R2 file is deleted first via `r2-delete`, the same order the file replace uses, because `r2-delete` checks the path against the row.
  - File replace: the existing PATCH, extended with `{ source_url: null, source_author: null, clip_start: null, clip_end: null, download_status: null, download_attempts: 0, download_error: null }`.

- [ ] **Step 1: Write the failing tests** (append to `tests/movement.spec.js`)

```js
test.describe('Replace — file and link', () => {
  let fx;
  test.beforeAll(async () => { fx = await setupMovementFixture(COACH_EMAIL, COACH_PASSWORD); });
  test.afterAll(async () => { await teardownMovementFixture(fx?.client, fx?.id); });

  test('replacing a file with a link deletes the old file and saves a pending link', async ({ page }) => {
    const calls = { r2Delete: null, patch: null };
    await page.route('**/functions/v1/r2-signed-url', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedUrl: 'http://localhost:8080/img/logo.png' }) }));
    await page.route('**/functions/v1/r2-delete', async r => {
      calls.r2Delete = r.request().postDataJSON();
      await r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.route('https://www.youtube.com/oembed**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title: 'T', author_name: 'Creator' }) }));
    await page.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '' }));
    // Intercept the PATCH — a real 'pending' write would be picked up by the NAS worker.
    await page.route('**/rest/v1/movements**', async r => {
      if (r.request().method() === 'PATCH') { calls.patch = r.request().postDataJSON(); await r.fulfill({ status: 204, body: '' }); }
      else await r.continue();
    });

    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${fx.id}&edit=1`);
    await page.fill('#replace-link', 'https://youtu.be/4taYjKlmihU?is=x');
    await page.click('#replace-btn');
    await expect(page.locator('#replace-success')).toHaveText('Replaced with the link. A copy will be saved automatically.');

    expect(calls.r2Delete).toMatchObject({ path: '00000000-0000-0000-0000-000000000000.mp4', movementId: fx.id });
    expect(calls.patch).toEqual({
      video_path: null, source_url: 'https://www.youtube.com/watch?v=4taYjKlmihU', source_author: 'Creator',
      clip_start: null, clip_end: null,
      download_status: 'pending', download_attempts: 0, download_error: null,
    });
    await expect(page.locator('.embed-frame iframe')).toBeVisible();
  });

  test('an unsupported replacement link is refused before anything is deleted', async ({ page }) => {
    let deleted = false;
    await page.route('**/functions/v1/r2-signed-url', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedUrl: 'http://localhost:8080/img/logo.png' }) }));
    await page.route('**/functions/v1/r2-delete', async r => { deleted = true; await r.fulfill({ status: 200, body: '{}' }); });
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${fx.id}&edit=1`);
    await page.fill('#replace-link', 'https://vimeo.com/123');
    await page.click('#replace-btn');
    await expect(page.locator('#replace-error')).toHaveText('That link isn’t supported — paste a YouTube or Instagram link.');
    expect(deleted).toBe(false);
  });
});

test.describe('Replace — link with file', () => {
  let linkFx;
  test.beforeAll(async () => { linkFx = await setupLinkMovementFixture(COACH_EMAIL, COACH_PASSWORD); });
  test.afterAll(async () => { await teardownLinkMovementFixture(linkFx?.client, linkFx?.id); });

  test('replacing a link with a file clears the link columns', async ({ page }) => {
    let patch = null;
    await page.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '' }));
    await page.route('**/functions/v1/r2-upload-url', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uploadUrl: 'http://localhost:8080/__upload' }) }));
    await page.route('http://localhost:8080/__upload', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**/functions/v1/r2-signed-url', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedUrl: 'http://localhost:8080/img/logo.png' }) }));
    await page.route('**/rest/v1/movements**', async r => {
      if (r.request().method() === 'PATCH') { patch = r.request().postDataJSON(); await r.fulfill({ status: 204, body: '' }); }
      else await r.continue();
    });
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto(`/movement.html?id=${linkFx.id}&edit=1`);
    await page.setInputFiles('#replace-file', { name: 'new.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fake') });
    await expect(page.locator('#replace-link')).toHaveValue('');
    await page.click('#replace-btn');
    await expect(page.locator('#replace-success')).toHaveText('File replaced successfully.');
    expect(patch).toMatchObject({
      source_url: null, source_author: null, clip_start: null, clip_end: null,
      download_status: null, download_attempts: 0, download_error: null,
    });
    expect(patch.video_path).toMatch(/^[0-9a-f-]{36}\.mp4$/);
  });

  test('changing the part of a link: the edit page pre-fills it, Replace saves the new part', async ({ page }) => {
    let patch = null;
    await linkFx.client.from('movements').update({ clip_start: 69, clip_end: 99 }).eq('id', linkFx.id);
    await page.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '' }));
    await page.route('https://www.youtube.com/oembed**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title: 'T', author_name: "Pierre's Elite Performance" }) }));
    await page.route('**/rest/v1/movements**', async r => {
      if (r.request().method() === 'PATCH') { patch = r.request().postDataJSON(); await r.fulfill({ status: 204, body: '' }); }
      else await r.continue();
    });
    try {
      await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
      await page.goto(`/movement.html?id=${linkFx.id}&edit=1`);
      await expect(page.locator('#replace-link')).toHaveValue('https://www.youtube.com/watch?v=4taYjKlmihU');
      await expect(page.locator('input[name="clip-mode"][value="part"]')).toBeChecked();
      await expect(page.locator('#clip-start')).toHaveValue('1:09');
      await page.fill('#clip-end', '1:49');
      await page.click('#replace-btn');
      await expect.poll(() => patch).toMatchObject({ clip_start: 69, clip_end: 109, download_status: 'pending' });
    } finally {
      await linkFx.client.from('movements').update({ clip_start: null, clip_end: null }).eq('id', linkFx.id);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `source ~/.zshrc && npx op run --env-file=.env.op -- npx playwright test tests/movement.spec.js -g "Replace"`
Expected: FAIL (`#replace-link` not found).

- [ ] **Step 3: Implement in `js/movement.js`**

In the `renderEdit()` template, rename the section title to `Replace Video` and insert this directly after the `#replace-drop` div:

```html
      <div class="link-paste" style="margin-top: 0.75rem;">
        <label for="replace-link" class="link-paste-label">…or paste a YouTube or Instagram link</label>
        <input type="url" id="replace-link" placeholder="https://www.instagram.com/reel/…" inputmode="url" autocomplete="off"
               value="${movement.source_url ? escape(movement.source_url) : ''}">
      </div>
      ${clipFieldsHtml(movementClip(movement), null)}
```

Change the button label from `Replace File` to `Replace`. Update every `replaceBtn.textContent = 'Replace File'` in `replaceVideo` to `'Replace'`.

In `renderEdit()`, next to the other listeners (after `document.getElementById('replace-btn').addEventListener('click', replaceVideo);`), add:

```js
  bindClipFields(result => { replaceClip = result; });
```

In the existing `replace-file` change handler, add `document.getElementById('replace-link').value = '';` once a valid file is picked. `replaceVideo` checks `rawLink` first, and a newly chosen file must win over the pre-filled link.

Replace the start of `replaceVideo()` (up to and including the `if (!file) {…}` block) with:

```js
async function replaceVideo() {
  const file          = document.getElementById('replace-file').files[0];
  const rawLink       = document.getElementById('replace-link').value.trim();
  const replaceError  = document.getElementById('replace-error');
  const replaceSuccess= document.getElementById('replace-success');
  const replaceBtn    = document.getElementById('replace-btn');
  const progressWrap  = document.getElementById('replace-progress-wrap');
  const progressFill  = document.getElementById('replace-progress-fill');
  const progressText  = document.getElementById('replace-progress-text');

  replaceError.classList.add('hidden');
  replaceSuccess.classList.add('hidden');

  if (rawLink) { await replaceWithLink(rawLink); return; }

  if (!file) {
    replaceError.textContent = 'Please select a file or paste a link.';
    replaceError.classList.remove('hidden');
    return;
  }
```

Guard the old-file delete in the file path, because a link movement may have no file:

```js
  const oldPath = movement.video_path;
  if (oldPath) {
    // Delete old file before updating DB so the path check in r2-delete passes.
    // Non-fatal — if it fails, the orphan becomes inaccessible once the DB points to the new file.
    await callEdgeFunction('r2-delete', { path: oldPath, movementId: id });
  }
```

Extend the file path's DB update and local state:

```js
  const { error: dbError } = await client
    .from('movements')
    .update({
      video_path: filename,
      source_url: null, source_author: null, clip_start: null, clip_end: null,
      download_status: null, download_attempts: 0, download_error: null,
    })
    .eq('id', id);
```

After the update succeeds (the next line is currently `movement.video_path = filename;`), add:

```js
  const wasLink = !!movement.link;
  Object.assign(movement, { source_url: null, source_author: null, clip_start: null, clip_end: null, download_status: null, link: null });
```

After `movement.signedUrl = signed.signedUrl;`, add `if (wasLink) { renderEdit(); return; }`. The existing in-place `<source>` swap assumes a `<video>` was already on the page, and a link movement had an iframe instead.

Add the link path:

```js
let replaceClip = { clip: null, error: null };   // latest validateClip() from the edit page

async function replaceWithLink(rawLink) {
  const replaceError   = document.getElementById('replace-error');
  const replaceSuccess = document.getElementById('replace-success');
  const replaceBtn     = document.getElementById('replace-btn');

  const link = parseVideoLink(rawLink);
  if (!link) {
    replaceError.textContent = 'That link isn’t supported — paste a YouTube or Instagram link.';
    replaceError.classList.remove('hidden');
    return;
  }

  if (replaceClip.error) {
    replaceError.textContent = replaceClip.error;
    replaceError.classList.remove('hidden');
    return;
  }

  replaceBtn.disabled    = true;
  replaceBtn.textContent = 'Saving…';

  const info   = link.platform === 'youtube' ? await fetchYouTubeInfo(link.canonicalUrl) : null;
  const author = (info && info.author) || null;

  // Same order as the file replace: r2-delete checks the path against the row,
  // so it must run before the row stops pointing at the file.
  if (movement.video_path) {
    await callEdgeFunction('r2-delete', { path: movement.video_path, movementId: id });
  }

  const patch = {
    video_path: null, source_url: link.canonicalUrl, source_author: author,
    clip_start: replaceClip.clip ? replaceClip.clip.start : null,
    clip_end:   replaceClip.clip ? replaceClip.clip.end : null,
    download_status: 'pending', download_attempts: 0, download_error: null,
  };
  const { error } = await client.from('movements').update(patch).eq('id', id);

  replaceBtn.disabled    = false;
  replaceBtn.textContent = 'Replace';

  if (error) {
    replaceError.textContent = 'Failed to save. Please try again.';
    replaceError.classList.remove('hidden');
    return;
  }

  Object.assign(movement, patch, { link });
  await renderEdit();
  const success = document.getElementById('replace-success');
  success.textContent = 'Replaced with the link. A copy will be saved automatically.';
  success.classList.remove('hidden');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `source ~/.zshrc && npx op run --env-file=.env.op -- npx playwright test tests/movement.spec.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(movement): replace media with a file or a link, change a link's part

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- js/movement.js tests/movement.spec.js
```

---

### Task 6: Admin Videos tab — link rows, badges, Retry / Keep as link only

**Files:**
- Modify: `js/admin.js`
- Modify: `css/style.css` (`.download-badge`, `.admin-thumb-link`)
- Modify: `tests/admin.spec.js`

**Interfaces:**
- Consumes: `parseVideoLink` (Task 2), `setupLinkMovementFixture` (Task 3).
- Produces:
  - Retry: a PATCH `{ download_status: 'pending', download_attempts: 0, download_error: null }`.
  - Keep as link only: a PATCH `{ download_status: 'link_only' }`.

- [ ] **Step 1: Write the failing tests** (append to `tests/admin.spec.js`; reuse that file's existing admin-login pattern and env names, and add the fixture require)

```js
test.describe('Videos tab — pasted links', () => {
  let failedFx;
  test.beforeAll(async () => {
    failedFx = await setupLinkMovementFixture(process.env.COACH_EMAIL, process.env.COACH_PASSWORD, {
      name: '__test_link_failed__', download_status: 'failed', download_attempts: 3, download_error: 'HTTP Error 429',
    });
  });
  test.afterAll(async () => { await teardownLinkMovementFixture(failedFx?.client, failedFx?.id); });

  async function openRow(page) {
    await loginAs(page, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    await page.goto('/admin.html');
    await page.fill('#movement-search', '__test_link_failed__');
    return page.locator(`.admin-list-item[data-id="${failedFx.id}"]`);
  }

  test('failed link row shows a Copy failed badge with the reason', async ({ page }) => {
    const row = await openRow(page);
    const badge = row.locator('.download-badge');
    await expect(badge).toHaveText('Copy failed');
    await expect(badge).toHaveAttribute('title', 'HTTP Error 429');
  });

  test('link row thumbnail is the YouTube still and opens the movement page', async ({ page }) => {
    const row = await openRow(page);
    await expect(row.locator('.admin-thumb-link img')).toHaveAttribute('src', 'https://i.ytimg.com/vi/4taYjKlmihU/hqdefault.jpg');
    await expect(row.locator('.admin-thumb-link')).toHaveAttribute('href', `movement.html?id=${failedFx.id}`);
  });

  test('Retry resets the row to pending', async ({ page }) => {
    let patch = null;
    // Intercepted: a real 'pending' write would be picked up by the NAS worker.
    await page.route('**/rest/v1/movements**', async r => {
      if (r.request().method() === 'PATCH') { patch = r.request().postDataJSON(); await r.fulfill({ status: 204, body: '' }); }
      else await r.continue();
    });
    const row = await openRow(page);
    await row.locator('[data-download-action="retry"]').click();
    await expect.poll(() => patch).toEqual({ download_status: 'pending', download_attempts: 0, download_error: null });
  });

  test('Keep as link only stops the alert and the badge changes', async ({ page }) => {
    const row = await openRow(page);
    await row.locator('[data-download-action="link_only"]').click();
    await expect(page.locator(`.admin-list-item[data-id="${failedFx.id}"] .download-badge`)).toHaveText('Link only');
    const { data } = await failedFx.client.from('movements').select('download_status').eq('id', failedFx.id).single();
    expect(data.download_status).toBe('link_only');
    await failedFx.client.from('movements').update({ download_status: 'failed' }).eq('id', failedFx.id); // restore for reruns
  });
});
```

`#movement-search` is the Videos-tab search input (`admin.html:77`). If the Videos tab isn't the default tab, add the tab click that `admin.spec.js` already uses.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `source ~/.zshrc && npx op run --env-file=.env.op -- npx playwright test tests/admin.spec.js -g "pasted links"`
Expected: FAIL (no `.download-badge`).

- [ ] **Step 3: Implement in `js/admin.js`**

Change the select to `'id, name, video_path, source_url, download_status, download_error, created_at, uploaded_by'`.

Replace `movementRowHtml`:

```js
const DOWNLOAD_BADGE = { pending: 'Saving copy…', failed: 'Copy failed', link_only: 'Link only' };

function movementRowHtml(m) {
  const checked = selectedIds.has(m.id) ? 'checked' : '';
  const link    = m.video_path ? null : parseVideoLink(m.source_url);

  // A link with no R2 copy yet has nothing to sign — show the platform's still
  // (YouTube) or a placeholder, and open the movement page instead of the modal.
  const thumb = link
    ? `<a class="admin-thumb admin-thumb-link" href="movement.html?id=${m.id}" data-thumb-loaded="1" title="Open movement">
         ${link.platform === 'youtube'
           ? `<img src="https://i.ytimg.com/vi/${link.id}/hqdefault.jpg" alt="">`
           : '<span class="admin-thumb-platform">Instagram</span>'}
       </a>`
    : `<div class="admin-thumb" data-path="${escape(m.video_path)}" title="Preview file">
         ${!isImagePath(m.video_path) ? '<div class="admin-thumb-play">&#9654;</div>' : ''}
       </div>`;

  const badgeText = DOWNLOAD_BADGE[m.download_status];
  const badge = badgeText
    ? `<span class="download-badge download-${m.download_status}"${m.download_error ? ` title="${escape(m.download_error)}"` : ''}>${badgeText}</span>`
    : '';

  const failedActions = m.download_status === 'failed'
    ? `<button class="btn-sm" data-download-action="retry" data-id="${m.id}">Retry</button>
       <button class="btn-sm" data-download-action="link_only" data-id="${m.id}">Keep as link only</button>`
    : '';

  return `
    <li class="admin-list-item" data-id="${m.id}">
      <input type="checkbox" class="admin-row-check" data-id="${m.id}" ${checked}>
      ${thumb}
      <div class="admin-item-body">
        <div class="admin-user-name">${escape(m.name)} ${badge}</div>
        <div class="admin-item-date">Uploaded by ${escape(m.uploaderName)} · ${formatDate(m.created_at)}</div>
      </div>
      <div class="admin-user-actions">
        ${failedActions}
        <button class="btn-sm" onclick="location.href='movement.html?id=${m.id}&edit=1'">Edit</button>
      </div>
    </li>
  `;
}
```

Replace the list click handler:

```js
movementList.addEventListener('click', async (e) => {
  const action = e.target.closest('[data-download-action]');
  if (action) { await setDownloadState(action.dataset.id, action.dataset.downloadAction); return; }
  const thumb = e.target.closest('.admin-thumb');
  if (thumb && !thumb.classList.contains('admin-thumb-link')) openAdminVideoModal(thumb.dataset.path);
});

async function setDownloadState(movementId, action) {
  const patch = action === 'retry'
    ? { download_status: 'pending', download_attempts: 0, download_error: null }
    : { download_status: 'link_only' };
  movementErrorMsg.classList.add('hidden');
  const { error } = await client.from('movements').update(patch).eq('id', movementId);
  if (error) {
    movementErrorMsg.textContent = 'Failed to update. Please try again.';
    movementErrorMsg.classList.remove('hidden');
    return;
  }
  loadMovements();
}
```

`css/style.css`, after `.admin-thumb img, .admin-thumb video`:

```css
.admin-thumb-link { text-decoration: none; }

.admin-thumb-platform {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.download-badge {
  display: inline-block;
  margin-left: 0.375rem;
  padding: 0.0625rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 500;
  vertical-align: middle;
}

.download-pending   { background: #eff6ff; color: #1e40af; }
.download-failed    { background: #fef2f2; color: #991b1b; cursor: help; }
.download-link_only { background: #f3f4f6; color: #4b5563; }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `source ~/.zshrc && npx op run --env-file=.env.op -- npx playwright test tests/admin.spec.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(admin): show link copy status with Retry / Keep as link only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- js/admin.js css/style.css tests/admin.spec.js
```

---

### Task 7: Docs, full verification, visual check

**Files:**
- Modify: `CLAUDE.md` (MVP Scope item 3 and 4 wording; Supabase Setup movements columns; Decisions)
- Modify: `README.md` (feature list)

- [ ] **Step 1: Update `CLAUDE.md`**

- **MVP Scope:** item 3 becomes "video file + metadata, **or a pasted YouTube/Instagram link, optionally just part of it (Start/End)**". Item 4 mentions "Replace with a file or a link; changing a link's part is a Replace".
- **Supabase Setup, `movements`:** add the columns `source_url, source_author, clip_start, clip_end, download_status, download_attempts, download_error`.
- **Decisions & Reasoning:** add these bullets:
  - **Pasted links: embed first, copy to R2 by the NAS.** `video_path` set → R2. Otherwise `source_url` → embed. The NAS worker (`dev.tools/automation/archive_evolve_links/`) copies pending links. The NAS is used, not a server, because YouTube and Instagram block datacenter IPs. See `docs/superpowers/specs/2026-10-02-video-links-design.md`.
  - **`parseVideoLink()` in auth.js is the single source of truth** for accepted links. It must match the `movements_source_url_format` CHECK and the worker's `parse_link()`. Embed URLs are built only from the parsed ID.
  - **`download_*`, never `archive_*`.** `archived_at` already means soft-deleted, and the UI says "Saving copy…" / "Copy failed".
  - **Parts of links are trimmed by the NAS, not the browser.** The YouTube embed honours `start`/`end` until the copy lands (no loop, because YouTube's loop restarts at 0:00); Instagram shows the whole post until then. A part is at most 180 s (CHECK constraint plus `MAX_CLIP_SECONDS`). Start + End with a live length note was chosen over an End/Length switch: one way to say it, zero onboarding.
  - **Tests never write a `pending` link row.** The worker polls the live DB. Fixtures use `link_only` / `done` / `failed`, and pending writes are intercepted with `page.route`.

- [ ] **Step 2: Update `README.md`.** Add one line to the feature list: "Paste a YouTube or Instagram link instead of uploading — a copy is saved automatically."

- [ ] **Step 3: Run the full suite**

Run: `source ~/.zshrc && npm test`
Expected: all tests PASS. Paste the summary line into the commit message.

- [ ] **Step 4: Visual check** (hookify rule 11)

Start `python3 -m http.server 8080`. Then, in the in-app browser, logged in as the test coach:
- Upload page: paste the two example links and screenshot the embed preview for each. Choose a part (1:09–1:39) and check that the YouTube preview plays only that part and the length note reads "30 seconds".
- Movement page: open a link-only movement on desktop and at the mobile preset, and check the embed sizing and the credit line.
- Admin Videos tab: check the badge layout.

Then `kill $(lsof -ti :8080)`.

- [ ] **Step 5: Commit**

```bash
git commit -m "docs: video links decisions and feature list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- CLAUDE.md README.md
```

- [ ] **Step 6: Ask Tom before pushing.** A push to `main` deploys once the tests pass. Shipping before the worker exists is safe: links play via embed and queue as `pending` until the worker's first run.

---

## Self-review notes

- **Spec coverage:** link parsing (T2); data model and constraints (T1); upload with YouTube naming, duplicate warning, one link and mutual exclusion (T4); movement playback and credit (T3); replace in both directions (T5); admin badges, thumbnails, Retry and Keep as link only (T6); docs (T7). The worker is in the dev.tools plan.
- **No `pending` rows from tests:** checked in T4, T5 and T6 (each intercepts the write); fixtures default to `link_only`.
