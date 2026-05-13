# evolve.coaches — Todo

## Open

## Done

- **[F3] Security headers not served** — accepted risk 2026-04-21. GitHub Pages can't serve HTTP headers; meta CSP requires significant HTML/JS refactoring for minimal gain on an internal 8-person app. If the app ever goes public, the whole architecture gets revisited anyway.
- **[F6] Non-atomic tag rename** — fixed 2026-04-21. Replaced client-side UPDATE loop with `rename_tag()` Postgres RPC (SECURITY DEFINER) that updates tags + all movements atomically in one transaction. Migration: `20260421000000_rename_tag_rpc.sql`.
- **[F2] r2-delete has no ownership check** — fixed 2026-04-21. Added movementId param; server verifies uploaded_by = user.id or role = admin before deleting. Removed orphan-cleanup r2-delete calls from upload.js failed-insert paths (orphaned files are invisible, UUID-named, accepted behaviour).
- **[F1] r2-signed-url never validates JWT** — fixed 2026-04-21. Added `createClient` + `auth.getUser()` pattern matching all other edge functions. Any request without a valid Supabase JWT now gets a 401.
- **[F5] XSS via full_name in nav avatar title attribute** — fixed 2026-04-21. `initNav()` now sets `avatarBtn.title` and `avatarBtn.textContent` via DOM property assignment instead of innerHTML. CodeQL alert dismissed.
- **[F4] Any coach can rename any tag** — accepted risk 2026-04-21. Intentional design; 8 trusted users; restricting to admin adds friction without meaningful security benefit.
- **[F7] No login rate limiting client-side** — closed 2026-04-21. Supabase Auth has server-side rate limiting by default. Internal 8-person app; not worth hardening further.
- **[F8] Anon key in public repo** — accepted risk 2026-04-21. Supabase anon keys are designed to be public; RLS is the guard. If ever rotated, invalidate in Supabase dashboard.
- **Add `npm audit` to CI** — done 2026-04-21. `npm audit --audit-level=high` added to `test.yml` after `npm ci`.
- **CORS headers inconsistent across Edge Functions** — done. Added `localhost:8080` to `ALLOWED_ORIGINS` in `list-users`, `invite-user`, and `delete-user`. Also set `verify_jwt=false` on all three — Supabase now issues ES256 JWTs but the gateway's `verify_jwt=true` only supports HS256, causing 401s before the function body runs. All functions do their own auth check via `auth.getUser()` internally. 62/62 tests passing.
- **RLS policies not in version control** — done. Full schema snapshot written to `supabase/migrations/20260221000000_initial_schema.sql` — tables, functions, triggers, and all RLS policies.
- **Admin page is client-side only gated** — accepted risk. Edge Functions enforce admin checks server-side on every privileged operation; static hosting makes HTML-level gating impossible without a hosting change that's disproportionate to the risk. All 8 users are known/trusted; a malicious coach couldn't bypass the Edge Function 403s anyway.
- **Weak file extension validation** — closed. R2 is object storage; uploaded files can't be executed. Drag-and-drop filters by MIME type and validateFile() decodes the file browser-side. No real risk.
- **sessionStorage cache key uses user-controlled path** — closed. video_path is a UUID.ext set server-side; sessionStorage is same-origin only; no meaningful attack surface.
