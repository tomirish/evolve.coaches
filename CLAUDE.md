# evolve.coaches — Project Notes

## Session start
When working in this repo, the global MEMORY.md is not auto-loaded. Read it manually at the start of each session:
`~/.claude/projects/-Users-tom-github/memory/MEMORY.md`
Then read any topic files referenced in it — they contain important context.

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
2. **Movement catalog** — search by name, filter by tag, and three-way sort (A–Z / Z–A / Recent). Alt names appear as their own cards so sort and search work naturally.
3. **Upload page** — video file + metadata (movement name, alternative names, tags, comments). Warns if a movement with the same name already exists.
4. **Movement detail page** — watch video, view and edit metadata including alternative names. Replace video file without losing metadata. Admin-only delete.
5. **Account page** — coaches can update their name, email, and password while logged in.
6. **Admin page** — tabbed interface (Videos / Tags / Users). Videos tab: searchable list with edit and delete. Tags tab: delete tags with usage counts (add/rename is on tags.html). Users tab: invite coaches, edit name/role, reset password, delete.
7. **Tags page** — accessible to all coaches. Add new tags and rename existing ones. Renaming a tag updates all movements that use it.
8. **Nav** — persistent header on all pages. Logo + brand name (logo only on mobile). Avatar dropdown gives access to Tags, Admin (admin only), Account, and Sign Out.

## Supabase Setup (Complete)
- `profiles` table — stores full_name and role (admin/coach), auto-created on signup via trigger
- `movements` table — name, alt_names (text[]), tags (text[]), comments, video_path, uploaded_by, timestamps
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
- **Supabase RLS: never reference a table in its own policy** — causes infinite recursion (error 42P17). Use a `security definer` function (e.g. `is_admin()`) to check roles from other tables instead of inline subqueries that reference the same table being protected.
- **No help page** — the app must be self-explanatory. Instead of documenting confusion, fix the UI that caused it. Use contextual hints (placeholder text, field hints, empty states) directly on the page where they're needed.
- **Alternative names as separate catalog cards** — movements can have multiple names (e.g. Romanian Deadlift / RDL). Alt names are stored as `text[]` on the movement and expanded client-side into individual catalog cards so A–Z sort and search work naturally. Alias cards show a subtle "→ Primary Name" subtitle. Comma-separated input in forms.
- **No comments on catalog cards** — the catalog is a scanning experience. Comments belong on the detail page. Showing them on cards adds noise and inconsistent card heights without meaningful benefit.
- **Nav user dropdown instead of separate Account link** — combining Account and Sign Out into a "Hi, NAME ▾" dropdown reduces nav items from 6 to 4 and adds a personal touch. The caret signals it's interactive. Sign Out is styled red inside the menu.
- **Video replacement order: upload → update DB → delete old** — if storage delete fails, the orphaned file is invisible to coaches. Reversing the order (delete old first) risks losing the video entirely if the upload fails.
- **Every page JS must call `initNav()`** — the nav user dropdown is injected dynamically by `initNav()` in auth.js. Every page's JS file must call it at init time or the nav will be broken on that page. Current pages: catalog.js, movement.js, upload.js, account.js, admin.js, tags.js.
- **Shared utilities live in auth.js** — `escape()` (HTML escaping), `callEdgeFunction()`, `uploadToR2()`, `getProfile()`, `requireAuth()`, `requireAdmin()`, and `initNav()` are all defined in auth.js and available on every page since it's loaded first. Do not add local copies to individual page scripts.
- **Dev branch workflow** — `main` is always the live site (GitHub Pages). All feature work happens on `develop` and is merged to `main` only when stable and tested locally. Claude must always verify we are on `develop` before making any code changes, and must never commit or push to `main` directly.
- **Resend for transactional email** — Supabase free tier is limited to 2 auth emails/hour. Resend handles invites and password resets via SMTP (smtp.resend.com:465). Domain `tom.irish` verified on Cloudflare with DKIM + SPF. App password stored in Supabase SMTP settings.
- **Profiles SELECT policy allows all authenticated users** — updated from "own row only" to allow any logged-in coach to read any profile. Required for "Uploaded by" feature on movement detail page. No sensitive data in profiles (name + role only).
- **Media type detection via `isImagePath(path)`** — shared browser global defined in auth.js. Returns true for jpg/jpeg/png/gif/webp/avif. Any code that branches on video vs image must use this — movement.js, upload.js, and admin.js all have branches. Do not add local copies.
- **`video_path` stores both video and image paths** — extension determines media type; no DB column change needed. `isImagePath()` is the single source of truth.
- **`verify_jwt: false` on all Edge Functions** — Supabase now issues ES256 (asymmetric) JWTs; the gateway's built-in `verify_jwt: true` only supports HS256 and rejects ES256 tokens with a 401 before the function body runs. All functions (`list-users`, `invite-user`, `delete-user`, `vision-name`, `r2-signed-url`, `r2-upload-url`, `r2-delete`) must be deployed with `--no-verify-jwt` and validate the caller themselves via `auth.getUser()`. Do not re-enable `verify_jwt: true`.
- **`.mov` files work in browsers — do not hardcode MIME types on `<source>` tags** — removing `type="video/mp4"` lets the browser sniff the container. Hardcoding causes Chrome to reject non-mp4 containers silently.
- **R2 presigned URLs succeed even for missing files** — `r2-signed-url` edge function signs any key path without checking existence. A 200 from the function does not mean the file is in R2.
- **Playwright auth caching** — `tests/helpers/global-setup.js` logs in once per user type and saves storageState to `tests/helpers/.auth/`. `loginAs()` restores saved state instead of hitting Supabase. `page.evaluate()` patches only the current page context — always call after `page.goto()`, never before.
- **`validateFile()` in upload.js is patchable** — top-level function, so tests can override via `window.validateFile = () => Promise.resolve({ ok: true })`. Always mock it (via `mockValidation()` or `mockFrameExtraction()`) in tests that use fake file buffers, or validation will reject them.
- **Stubbing Edge Functions in tests** — use `page.route('**/functions/v1/<name>', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({...}) }))` to decouple tests from external service latency. See movement.spec.js for the r2-signed-url pattern. Call before `page.goto()`.

## Working Principles
1. **Documentation stays current** — update READMEs and CLAUDE.md every time something significant changes. Claude should flag CLAUDE.md updates proactively during the session, not wait to be asked. Every session ends with a quick CLAUDE.md review before stopping.
2. **Test before pushing** — fully test all changes locally before pushing to the repo.
3. **One change at a time** — keep commits focused and scoped. Bundling unrelated changes makes rollbacks harder and history murkier.
4. **Commit freely, speak up before pushing** — Commit locally as work completes. If Tom says to push and everything looks good, just push. If Tom says to push but I have concerns, say so before pushing. If I think we should push but Tom hasn't said so, ask first — CI auto-merges to main and pushes directly affect production.
5. **Agree on "done" before starting** — make sure we both know what the finished state looks like before writing any code.
6. **Track decisions, not just code** — when we choose an approach (or rule one out), log the reasoning in CLAUDE.md so future-us understands why.
7. **Main branch is always clean** — only stable, working code on `main`. Feature branches for anything in progress.
8. **Verify before writing** — when working with schemas, APIs, or anything structural, query the actual state first using the Supabase MCP connector. Never guess at types, column names, or structure. Stop, inspect, then write the correct thing once. Use `mcp__supabase__list_tables` and `mcp__supabase__execute_sql` proactively — not just when something breaks.
9. **UI should teach itself** — if a feature needs explanation, the UI isn't clear enough yet. Fix the label, placeholder, or layout before reaching for a tooltip or help page. A help page is an admission of a UX failure.
10. **Simplicity is the goal, not a constraint** — always ask whether a feature can be simpler. The right amount of UI is the minimum a coach needs to succeed on their own.
11. **Hookify verification rule active** — `.claude/hookify.require-verification.local.md` fires on every stop event. It requires running `source ~/.zshrc && npm test` and visually confirming UI changes before claiming work is done. Do not dismiss it.

## Security

### CI/CD
- **Single workflow** — `test.yml` handles both testing and deploy. No separate deploy.yml. Deploy job uses `needs: test` + `if: github.ref == 'refs/heads/develop'` so it skips on PRs automatically and merges develop → main via ff-only on success.
- **`workflow_run` triggers only fire from the default branch (main)** — don't put `workflow_run` workflows on develop; they're dead code there and cause spurious "workflow file issue" failures on every push.
- **Validate workflow files locally with `actionlint`** (`brew install actionlint`) before pushing — catches schema errors GitHub won't explain. `workflows` is NOT a valid GITHUB_TOKEN permission scope; valid scopes include `contents`, `actions`, `checks`, `id-token`, `pages`, `pull-requests`, `security-events`. (`workflow` scope only exists for classic PATs, not for the `permissions:` block in workflow YAML.)
- **Pushing workflow files from CI requires a PAT** — GITHUB_TOKEN can never push changes to `.github/workflows/`. The deploy job uses a `GH_DEPLOY_TOKEN` secret (fine-grained PAT with `contents: write` + `workflows` on this repo) and pushes via `https://x-access-token:${GH_DEPLOY_TOKEN}@github.com/...` instead of `git push origin main`.

### Automated scanning
- **CodeQL** (`.github/workflows/codeql.yml`) — static analysis of JavaScript; runs on every push to main/develop and weekly on Saturdays. Results in GitHub Security → Code scanning alerts. Does not block pushes.
- **Dependabot** (`.github/dependabot.yml`) — opens PRs weekly (Mondays) for outdated GitHub Actions and npm dependencies. `target-branch: develop` set on both ecosystems.

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
- Branch protection references the **job name** (`test`), not the workflow `name:` field — renaming the workflow title is safe; renaming the job key requires updating branch protection on both `main` and `develop`
- `pages-build-deployment` is a GitHub system workflow — cannot be renamed, badge label is hardcoded
- `gh api --field` doesn't work for nested JSON (branch protection, security_and_analysis) — use `--input -` with a heredoc instead
- Secret scanning extras (non-provider patterns, validity checks) cannot be set via API on public repos — Settings → Advanced Security in the web UI

## Local development setup

### Mac
- `npm install` to get dependencies
- `npm test` to run the full Playwright suite (uses `op run` to inject secrets from 1Password)
- `python3 -m http.server 8080` to preview the site — **kill it when done** (`kill $(lsof -ti :8080)`); leaving it running exposes the repo to the LAN
- `/commit` to create a commit — uses commit-commands plugin to auto-generate a message matching repo style

