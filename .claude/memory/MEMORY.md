# evolve.coaches — Persistent Memory

## Project
- Vanilla HTML/CSS/JS frontend hosted on GitHub Pages
- Supabase for auth, DB, and storage
- Branch strategy: feature work on `develop` — pushing to `develop` auto-merges to `main` via CI (deploy.yml triggers on test success). Never offer to manually merge; a push to `develop` IS the deploy.

## Key accounts
- accounts located in password vault.

## Testing
- Playwright E2E suite (`npm test`) — 65 tests, 65 passing
- Test files: auth, admin, catalog, nav, movement, upload, mobile (390px), desktop (1280px), security
- performance.spec.js deleted — was measuring CI runner latency, not real coach experience
- `mobile.spec.js` — 9 tests: element widths, no horizontal scroll, mobile CSS at 390px
- `desktop.spec.js` — 9 tests: brand name visible, row layout via `isInRowWith()`, no horizontal scroll at 1280px
- `workers: 2` in playwright.config.js — parallel runs, low risk of Supabase auth rate limits at 39 tests
- Credentials injected via 1Password CLI (`op run --env-file=.env.op`)
- Credentials are in the password vault
- Web server: `python3 -m http.server 8080` (auto-started by Playwright)
- `npm run test:ui` for headed/interactive mode
- Run tests without `run_in_background` so output streams live to the terminal
- `OP_SERVICE_ACCOUNT_TOKEN` is in `~/.zshrc` but Claude Code bash sessions don't source it automatically — always run `source ~/.zshrc && npm test`

## CI/CD
- GitHub Actions: `.github/workflows/test.yml` — triggers on push to `develop`
- Uses `1password/install-cli-action@v1` + `OP_SERVICE_ACCOUNT_TOKEN` GitHub secret
- Same `npm test` command as local — identical `.env.op` vault references
- Local `npm test` is now optional — use for big/risky changes only; CI is the safety net

### CI improvements (completed 2026-04-21)
- `deploy.yml` deleted — deploy is now a job in `test.yml` with `needs: test` + `if: github.ref == 'refs/heads/develop'`
- Playwright browser cache keyed on package-lock.json (~30–60s saved after first run)
- npm dep cache via `cache: 'npm'` on setup-node
- `npm audit --audit-level=high` runs after `npm ci`
- workers: 2 in playwright.config.js
- Branch protection on `main` — force pushes blocked
- Local `npm test` optional — run locally only for big/risky changes

## Bulk upload / Vision OCR
- Full spec in `docs/bulk-upload.md`

## Important selectors (verified against live code)
- Login: `#email`, `#password`, `#login-btn`, `#error-msg`
- Catalog: `.movement-card`, `#search`, `#sort-btn`, `.filter-pill[data-group="All"]`
- Nav: `.nav-avatar`, `.nav-user-menu` (toggle `hidden` class), `.nav-user-signout`

## Supabase Edge Functions — CORS gotcha
- Always include `"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"`
- Omitting `apikey` and `x-client-info` causes the browser to block the POST silently after a successful OPTIONS preflight — no requests reach the function, just OPTIONS in the logs
- This broke all three R2 functions on first deploy; fixed by redeploying with the full header list


## UX principles
- See `ux-principles.md` — non-technical coaches, zero onboarding, self-explanatory UI, no help pages

## User preferences
- Never ask Tom to edit files manually — always make all edits directly
- Never ask for approval before making edits — just do them
- Always start the local dev server at the beginning of a session when making changes: `python3 -m http.server 8080` (run in background). Test at http://localhost:8080/catalog.html
- CLAUDE.md is gitignored in all repos — never try to commit it
- "sync up" means: run `/sync` then read memory before answering

## Architecture notes
- `requireAuth()` redirects unauthenticated users → `index.html`
- `requireAdmin()` redirects non-admins → `catalog.html`
- `initNav()` must be called on every page JS file or nav breaks
- `.env` and `node_modules/` and `playwright-report/` are gitignored
