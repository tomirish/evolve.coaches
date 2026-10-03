# evolve.coaches — Project Notes

## Session start
When working in this repo, the global MEMORY.md is not auto-loaded. Read it manually at the start of each session:
`~/.claude/projects/-Users-tom-github/memory/MEMORY.md`
Then read any topic files referenced in it — they contain important context.

---

## Specs and plans

Design specs go in `docs/superpowers/specs/`, implementation plans in `docs/superpowers/plans/`. Committed to the repo, not gitignored. Same convention in every repo.

Specs are the *why* and are kept. Plans are the *how, once* — prune them once implemented; the code plus the commit message is the durable record.

---

## Branching

**`main` is the only branch — commit and push there directly.** Don't open PRs and don't create feature branches for ordinary work. There is no develop branch.

`.github/workflows/test.yml` runs on every push to `main`: the `test` job runs the full Playwright suite, and the `deploy` job publishes to GitHub Pages (Actions deployment, not branch-based) only when tests pass. A broken commit lands in git history but never reaches the live site — it keeps serving the last green deploy. Fix forward.

---

## Project Overview
A private internal video index for coaches at Evolve Strong Fitness. Coaches log in, browse training movements, watch video demos, and view/edit metadata. Built for ~8 coaches + 1 admin. Non-technical users — must be user-friendly and clean.

**Primary user: Julie** (Tom's wife, one of the coaches). She originated the bulk upload feature request and is the primary feedback source. Her requirements and feedback take priority.

**Owner: Jaclyn** — owner of Evolve Strong Fitness. Likely has most of the videos for the initial migration.

## Goals
- Give coaches a simple way to review movements before sessions
- Allow uploading videos with metadata (movement name, muscle groups, comments)
- No tech support burden — build it right once and let it run
- Clean, simple UI that non-technical coaches can use confidently
- **Zero onboarding** — a coach should be able to receive a URL + email + password and figure out the app entirely on their own, with no training or documentation needed

## Tech Stack
| Layer | Tool | Notes |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS | No framework overhead, nothing to break or update |
| Auth + Database | Supabase | Free tier, email/password auth, admin/coach roles, metadata storage |
| Video storage | Cloudflare R2 | 10GB free tier, no egress fees. Supabase stays for auth/DB only. |
| Hosting | GitHub Pages | Static frontend, MVP phase |
| Transactional email | Resend | Invite and password reset emails via tom@tom.irish. Domain verified on Cloudflare. |

## MVP Scope
1. **Login page** — email/password auth with "Forgot password?" reset flow (reset.html)
2. **Movement catalog** — search by name, filter by tag, and three-way sort (A–Z / Z–A / Recent), remembered per browser. Alt names appear as their own cards so sort and search work naturally.
3. **Upload page** — video file + metadata, or a pasted YouTube/Instagram link, optionally just part of it (Start/End) (movement name, alternative names, tags, comments). Warns if a movement with the same name already exists.
4. **Movement detail page** — watch video, view and edit metadata including alternative names. Replace with a file or a link without losing metadata; changing a link's part is a Replace. Admin-only delete.
5. **Account page** — coaches can update their name, email, and password while logged in.
6. **Admin page** — tabbed interface (Videos / Tags / Users). Videos tab: searchable list with edit and delete. Tags tab: delete tags with usage counts (add/rename is on tags.html). Users tab: invite coaches, edit name/role, reset password, delete.
7. **Tags page** — accessible to all coaches. Add new tags and rename existing ones. Renaming a tag updates all movements that use it.
8. **Nav** — persistent header on all pages. Logo + brand name (logo only on mobile). Avatar dropdown gives access to Tags, Admin (admin only), a Dark mode switch, Account, and Sign Out.

## Supabase Setup (Complete)
- `profiles` table — stores full_name, role (admin/coach) and theme (light/dark), auto-created on signup via trigger. Only an admin can change `role` (`guard_profile_role` trigger)
- `movements` table — name, alt_names (text[]), tags (text[]), comments, video_path, uploaded_by, timestamps, plus the link columns `source_url, source_author, clip_start, clip_end, download_status, download_attempts, download_error`
- `tags` table — tag names, managed via tags.html (all coaches) and Admin Tags tab (admin delete)
- RLS enabled on all tables with policies for read/write/delete by role
- Video storage: Cloudflare R2 (not Supabase Storage) — see R2 note below
- Admin account: tom@tom.irish
- Note: Supabase SQL editor shows "Success. No rows returned" for INSERT/UPDATE — this is normal, not an error


## Decisions & Reasoning
- **Supabase over self-managed auth** — small team, no one to manage users, free tier covers the scale easily
- **Vanilla JS over a framework** — "set it and forget it" goal means fewer dependencies, less to break over time
- **GitHub Pages for MVP** — validate with coaches before committing to paid hosting
- **Video storage: R2 over Supabase Storage** — Supabase Storage has a 1GB free cap. Coaches expect to upload GBs of video, so migrated to Cloudflare R2 (10GB free, no egress fees) before launch. Supabase stays for auth, DB, and Edge Functions — only the video bucket moved. Zero impact on coach experience. R2 credentials never touch the browser: all operations go through Edge Functions that return presigned URLs.
- **RLS can't restrict columns — guard sensitive ones with a trigger.** Coaches may update their own `profiles` row (name, and later preferences), so `guard_profile_role` (BEFORE UPDATE) rejects a `role` change unless `is_admin()`. Until 2026-10-03 a coach could make themselves admin through the Data API. Any new self-editable table with a privileged column needs the same treatment.
- **Supabase RLS: never reference a table in its own policy** — causes infinite recursion (error 42P17). Use a `security definer` function (e.g. `is_admin()`) to check roles from other tables instead of inline subqueries that reference the same table being protected.
- **No help page** — the app must be self-explanatory. Instead of documenting confusion, fix the UI that caused it. Use contextual hints (placeholder text, field hints, empty states) directly on the page where they're needed.
- **Alternative names as separate catalog cards** — movements can have multiple names (e.g. Romanian Deadlift / RDL). Alt names are stored as `text[]` on the movement and expanded client-side into individual catalog cards so A–Z sort and search work naturally. Alias cards show a subtle "→ Primary Name" subtitle. Comma-separated input in forms.
- **No comments on catalog cards** — the catalog is a scanning experience. Comments belong on the detail page. Showing them on cards adds noise and inconsistent card heights without meaningful benefit.
- **Nav user dropdown instead of separate Account link** — combining Account and Sign Out into a "Hi, NAME ▾" dropdown reduces nav items from 6 to 4 and adds a personal touch. The caret signals it's interactive. Sign Out is styled red inside the menu.
- **Video replacement order: upload → update DB → delete old** — if storage delete fails, the orphaned file is invisible to coaches. Reversing the order (delete old first) risks losing the video entirely if the upload fails.
- **Every page JS must call `initNav()`** — the nav user dropdown is injected dynamically by `initNav()` in auth.js. Every page's JS file must call it at init time or the nav will be broken on that page. Current pages: catalog.js, movement.js, upload.js, account.js, admin.js, tags.js. It also applies the coach's saved theme.
- **Shared utilities live in auth.js** — `escape()` (HTML escaping), `callEdgeFunction()`, `uploadToR2()`, `getProfile()`, `requireAuth()`, `requireAdmin()`, and `initNav()` are all defined in auth.js and available on every page since it's loaded first. Do not add local copies to individual page scripts.
- **Single-branch workflow (replaced dev-branch workflow 2026-07)** — all work happens directly on `main`. GitHub Pages deploys via Actions (`actions/deploy-pages`), gated on the test job, so the live site only ever updates from a green pipeline. The old develop → ff-merge → main flow and its `GH_DEPLOY_TOKEN` PAT are gone.
- **Resend for transactional email** — Supabase free tier is limited to 2 auth emails/hour. Resend handles invites and password resets via SMTP (smtp.resend.com:465). Domain `tom.irish` verified on Cloudflare with DKIM + SPF. App password stored in Supabase SMTP settings.
- **Profiles SELECT policy allows all authenticated users** — updated from "own row only" to allow any logged-in coach to read any profile. Required for "Uploaded by" feature on movement detail page. No sensitive data in profiles (name + role only).
- **Media type detection via `isImagePath(path)`** — shared browser global defined in auth.js. Returns true for jpg/jpeg/png/gif/webp/avif. Any code that branches on video vs image must use this — movement.js, upload.js, and admin.js all have branches. Do not add local copies.
- **`video_path` stores both video and image paths** — extension determines media type; no DB column change needed. `isImagePath()` is the single source of truth.
- **`verify_jwt: false` on all Edge Functions** — Supabase now issues ES256 (asymmetric) JWTs; the gateway's built-in `verify_jwt: true` only supports HS256 and rejects ES256 tokens with a 401 before the function body runs. All functions (`list-users`, `invite-user`, `delete-user`, `vision-name`, `r2-signed-url`, `r2-upload-url`, `r2-delete`) must be deployed with `--no-verify-jwt` and validate the caller themselves via `auth.getUser()`. Do not re-enable `verify_jwt: true`.
- **`.mov` files work in browsers — do not hardcode MIME types on `<source>` tags** — removing `type="video/mp4"` lets the browser sniff the container. Hardcoding causes Chrome to reject non-mp4 containers silently.
- **R2 presigned URLs succeed even for missing files** — `r2-signed-url` edge function signs any key path without checking existence. A 200 from the function does not mean the file is in R2.
- **Playwright auth caching** — `tests/helpers/global-setup.js` logs in once per user type and saves storageState to `tests/helpers/.auth/`. `loginAs()` restores saved state instead of hitting Supabase. `page.evaluate()` patches only the current page context — always call after `page.goto()`, never before.
- **`validateFile()` in upload.js is patchable** — top-level function, so tests can override via `window.validateFile = () => Promise.resolve({ ok: true })`. Always mock it (via `mockValidation()` or `mockFrameExtraction()`) in tests that use fake file buffers, or validation will reject them.
- **Pasted links: embed first, copy to R2 by the NAS.** `video_path` set → R2. Otherwise `source_url` → embed. The NAS worker (`dev.tools/automation/archive_evolve_links/`) copies pending links. The NAS is used, not a server, because YouTube and Instagram block datacenter IPs. See `docs/superpowers/specs/2026-10-02-video-links-design.md`.
- **`parseVideoLink()` in auth.js is the single source of truth** for accepted links. It must match the `movements_source_url_format` CHECK and the worker's `parse_link()`. Embed URLs are built only from the parsed ID.
- **`download_*`, never `archive_*`.** `archived_at` already means soft-deleted, and the UI says "Saving copy…" / "Copy failed".
- **Parts of links are trimmed by the NAS, not the browser.** The YouTube embed honours `start`/`end` until the copy lands (no loop, because YouTube's loop restarts at 0:00); Instagram shows the whole post until then. A part is at most 180 s (CHECK constraint plus `MAX_CLIP_SECONDS`). Start + End with a live length note was chosen over an End/Length switch: one way to say it, zero onboarding.
- **Tests never write a `pending` link row.** The worker polls the live DB. Fixtures use `link_only` / `done` / `failed`, and pending writes are intercepted with `page.route`.
- **Replace on the edit page is also how a coach changes a link's part** — the link field is pre-filled with the current link, so editing Start/End and saving is a Replace.
- **Admin "Keep as link only" sets `download_status='link_only'`** and is the way to clear a "Copy failed" alert for content that can't be copied.
- **Catalog sort is remembered in `localStorage` (`catalogSort`), not on the profile, and there is no preferences page** — a remembered choice beats a setting coaches have to find. Per-device only; if coaches ask for it to follow them across devices, move it to a `profiles` column. Don't add preferences coaches haven't asked for.
- **Dark mode is a per-coach switch in the avatar menu, light by default (2026-10-03)** — saved on `profiles.theme` so it follows the coach to every device; the device's own dark setting is deliberately ignored (most coaches use light). `localStorage['theme']` is only a local copy: `js/theme.js` (in `<head>` on every page — the one exception to "shared code lives in auth.js", because auth.js loads too late to avoid a white flash) applies it before first paint, and `applyTheme()` in `initNav()` corrects it from the profile. Sign-out clears the copy.
- **Never hard-code a colour in style.css** — use the `:root` variables, and add a dark value to the `:root[data-theme="dark"]` block for any new one. `--surface` is the card/input/menu background; `--white` is text on the accent or the dark header, the same in both themes. Check new UI in both themes.
- **Stubbing Edge Functions in tests** — use `page.route('**/functions/v1/<name>', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({...}) }))` to decouple tests from external service latency. See movement.spec.js for the r2-signed-url pattern. Call before `page.goto()`.

## Working Principles
1. **Documentation stays current** — update READMEs and CLAUDE.md every time something significant changes. Claude should flag CLAUDE.md updates proactively during the session, not wait to be asked. Every session ends with a quick CLAUDE.md review before stopping.
2. **Test before pushing** — fully test all changes locally before pushing to the repo.
3. **One change at a time** — keep commits focused and scoped. Bundling unrelated changes makes rollbacks harder and history murkier.
4. **Commit freely, speak up before pushing** — Commit locally as work completes. If Tom says to push and everything looks good, just push. If Tom says to push but I have concerns, say so before pushing. If I think we should push but Tom hasn't said so, ask first — a push to main deploys to production as soon as tests pass.
5. **Agree on "done" before starting** — make sure we both know what the finished state looks like before writing any code.
6. **Track decisions, not just code** — when we choose an approach (or rule one out), log the reasoning in CLAUDE.md so future-us understands why.
7. **The live site is always clean** — deploys only happen from green pipelines. A broken commit on `main` is tolerable (the site keeps serving the last good deploy); fix forward promptly rather than rewriting history.
8. **Verify before writing** — when working with schemas, APIs, or anything structural, query the actual state first using the Supabase MCP connector. Never guess at types, column names, or structure. Stop, inspect, then write the correct thing once. Use `mcp__supabase__list_tables` and `mcp__supabase__execute_sql` proactively — not just when something breaks.
9. **UI should teach itself** — if a feature needs explanation, the UI isn't clear enough yet. Fix the label, placeholder, or layout before reaching for a tooltip or help page. A help page is an admission of a UX failure.
10. **Simplicity is the goal, not a constraint** — always ask whether a feature can be simpler. The right amount of UI is the minimum a coach needs to succeed on their own.
11. **Hookify verification rule active** — `.claude/hookify.require-verification.local.md` fires on every stop event. It requires running `source ~/.zshrc && npm test` and visually confirming UI changes before claiming work is done. Do not dismiss it.

## Security

### CI/CD
- **Single workflow** — `test.yml` handles both testing and deploy. No separate deploy.yml. Deploy job uses `needs: test` + `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`, uploads the repo as a Pages artifact, and publishes via `actions/deploy-pages`. Pages source is "GitHub Actions" (workflow mode), not branch-based — do not flip it back.
- **`workflow_run` triggers only fire from the default branch (main)** — on any other branch they're dead code and cause spurious "workflow file issue" failures on every push.
- **Validate workflow files locally with `actionlint`** (`brew install actionlint`) before pushing — catches schema errors GitHub won't explain. `workflows` is NOT a valid GITHUB_TOKEN permission scope; valid scopes include `contents`, `actions`, `checks`, `id-token`, `pages`, `pull-requests`, `security-events`. (`workflow` scope only exists for classic PATs, not for the `permissions:` block in workflow YAML.)
- **Rapid successive pushes**: an older run may end "cancelled" — its queued deploy was superseded by the newer commit's (deploy concurrency group). Expected, not a failure; the newest green deploy contains everything.
- **Editing `.github/dependabot.yml` triggers an immediate Dependabot run** — regenerated/grouped PRs appear within minutes, not at the Monday schedule.
- **Dependabot PRs are squash-merged** (`gh pr merge --squash`), matching history style.

### Automated scanning
- **CodeQL** (`.github/workflows/codeql.yml`) — static analysis of JavaScript; runs on every push to main and weekly on Saturdays. Results in GitHub Security → Code scanning alerts. Does not block pushes.
- **Dependabot** (`.github/dependabot.yml`) — opens PRs weekly (Mondays) for outdated GitHub Actions and npm dependencies. No `target-branch` — PRs target `main`, where the `pull_request` trigger tests them without deploying.

### Auth/ownership checklist
When touching any code that handles auth, sessions, RLS policies, or Edge Functions, verify:
- Does this endpoint validate the JWT before acting?
- Does it check that the requesting user owns the resource (coach vs. admin)?
- Is user input validated and sanitized before use?
- Is the corresponding RLS policy consistent with what the Edge Function enforces?
- Could an unauthenticated user reach this path?

### New Edge Function checklist
Run through the auth/ownership checklist above for every new or modified Edge Function. After the checklist, red team if anything looks off. Add a negative test to `tests/security.spec.js` that confirms a coach JWT is rejected at the new boundary.

### Re-run red team when
- New auth flow or user role added
- New external integration (OAuth, webhook, payment, API key)
- Significant changes to Edge Functions or RLS policies

---

## GitHub / CI gotchas
- `_headers` was deleted — Cloudflare/Netlify convention, does nothing on GitHub Pages
- `favicon.ico` deleted — safe when all HTML pages have explicit `<link rel="icon">` tags
- `main` is protected twice over: a repo **ruleset** and **classic branch protection**, each blocking deletion + force-push. The classic protection had a required status check (`test`) that was removed 2026-07 — required checks reject direct pushes, which is our whole workflow. Don't re-add them. (Classic protection is invisible to the API without an admin-scoped token — reads return 404, not 403.)
- `pages-build-deployment` is a GitHub system workflow that only runs for branch-based Pages deploys — it stopped firing when we switched to workflow mode; ignore it in the Actions list
- `gh api --field` doesn't work for nested JSON (branch protection, security_and_analysis) — use `--input -` with a heredoc instead
- Secret scanning extras (non-provider patterns, validity checks) cannot be set via API on public repos — Settings → Advanced Security in the web UI
- Live site health check: `curl -sI https://tomirish.github.io/evolve.coaches/` → expect `HTTP/2 200`
- `gh run watch --exit-status` can return nonzero spuriously — confirm with `gh run view --json conclusion` before treating a run as failed
- A repo-scoped GitHub PAT exists for pushes and API calls on this repo (plain `gh` uses the broader dev.tools token, which lacks admin scopes) — location and usage pattern are in Claude's project memory, not here (public repo)

## Local development setup

### Mac
- `npm install` to get dependencies
- `npm test` to run the full Playwright suite (uses `op run` to inject secrets from 1Password)
- `python3 -m http.server 8080` to preview the site — **kill it when done** (`kill $(lsof -ti :8080)`); leaving it running exposes the repo to the LAN
- `/commit` to create a commit — uses commit-commands plugin to auto-generate a message matching repo style

