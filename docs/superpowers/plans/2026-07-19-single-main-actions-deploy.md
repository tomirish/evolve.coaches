# Single-Main Branch with Actions-Based Pages Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the `develop` branch and work directly on `main`, while guaranteeing the live site never breaks from a bad commit — the pipeline tests every push and only publishes to GitHub Pages on green.

**Architecture:** GitHub Pages currently deploys from the `main` branch ("legacy" mode), so `main` = live site instantly. We flip Pages to "GitHub Actions" mode, where the site only updates when `actions/deploy-pages` runs — and that step is gated behind the test job. A broken commit lands in `main`'s history but the live site keeps serving the last good deployment. This also eliminates the ff-merge deploy job and its `GH_DEPLOY_TOKEN` PAT entirely.

**Tech Stack:** GitHub Actions (`actions/upload-pages-artifact@v5.0.0`, `actions/deploy-pages@v5.0.0`), GitHub Pages workflow deployment, `gh` CLI for API calls, actionlint for workflow validation.

## Global Constraints

- Repo: `tomirish/evolve.coaches`. Live site: `https://tomirish.github.io/evolve.coaches/` (no custom domain — confirmed `cname: null` via Pages API).
- `gh` is not on PATH in the Bash tool — always use `/opt/homebrew/bin/gh`.
- All actions must be pinned to full commit SHAs with a `# @vX` comment, matching existing style in `test.yml`.
- Validate workflow files with `actionlint` before every commit that touches `.github/workflows/`.
- The `main` ruleset (id 15321294, blocks deletion + non-fast-forward) stays untouched — it has no required status checks, so direct pushes to `main` already work. Do NOT add required status checks to `main`; they would reject direct pushes.
- The site must return HTTP 200 at every checkpoint in this plan. If it ever doesn't, stop and investigate before proceeding.
- Until Task 3's promotion step, `develop` is still the working branch — commit there. From Task 3 onward, work is on `main`.

---

### Task 1: Pre-flight checks

**Files:** none modified.

**Interfaces:**
- Consumes: nothing.
- Produces: confirmed-safe starting state for Tasks 2–3 (branches in sync, PAT can push workflow files, actionlint available).

- [ ] **Step 1: Confirm develop and origin/main are identical**

```bash
git fetch origin --quiet
git log --oneline origin/main..develop | head -5
git log --oneline develop..origin/main | head -5
```

Expected: both commands print nothing. If either shows commits, reconcile first (normally: wait for the old pipeline to finish promoting develop) and re-run.

- [ ] **Step 2: Confirm working tree is clean and on develop**

```bash
git status --short --branch
```

Expected: `## develop...origin/develop` and no file lines.

- [ ] **Step 3 (Tom): Add `workflow` permission to the git-push PAT**

Task 3 pushes a modified `.github/workflows/test.yml` to `main` from the local machine. The global git config forces HTTPS + PAT auth, and fine-grained PATs need explicit **Workflows: Read and write** permission to push workflow file changes (see "GitHub PAT gotchas" in global CLAUDE.md).

Tom: at github.com → Settings → Developer settings → Personal access tokens, edit the token used for git pushes and add the **Workflows** read-and-write permission. Confirm in chat when done. (Claude cannot verify this without pushing; take Tom's word and proceed — Task 3 will fail loudly with `refusing to allow a Personal Access Token to create or update workflow` if it's missing, which is recoverable by adding the permission and re-pushing.)

- [ ] **Step 4: Confirm actionlint is installed**

```bash
which actionlint || brew install actionlint
```

Expected: a path like `/opt/homebrew/bin/actionlint`.

- [ ] **Step 5: Confirm the site is up (baseline)**

```bash
curl -sI https://tomirish.github.io/evolve.coaches/ | head -1
```

Expected: `HTTP/2 200`

---

### Task 2: Rewrite the pipeline and docs (one commit on develop)

This is one logical change — the pipeline switch and the docs that describe it — committed together on `develop` (still the working branch at this point).

**Files:**
- Modify: `.github/workflows/test.yml` (full rewrite below)
- Modify: `.github/workflows/codeql.yml:3-7` (drop develop from triggers)
- Modify: `.github/dependabot.yml` (drop both `target-branch: develop` lines)
- Modify: `README.md:5` (remove stale badge) and `README.md:44-48` (Git workflow section)
- Modify: `CLAUDE.md` (six targeted edits, exact text below)

**Interfaces:**
- Consumes: SHAs resolved 2026-07-19: `actions/upload-pages-artifact` v5.0.0 = `fc324d3547104276b827a68afc52ff2a11cc49c9`; `actions/deploy-pages` v5.0.0 = `cd2ce8fcbc39b97be8ca5fce6e763baed58fa128`. (If executing much later, re-resolve: `/opt/homebrew/bin/gh api repos/actions/deploy-pages/releases/latest --jq .tag_name` then `/opt/homebrew/bin/gh api repos/actions/deploy-pages/git/ref/tags/<tag> --jq .object.sha` — and if the ref is an annotated tag, dereference via `/opt/homebrew/bin/gh api repos/actions/deploy-pages/git/tags/<sha> --jq .object.sha`.)
- Produces: a commit on `develop` containing the complete new pipeline, ready for Task 3 to promote. Job key stays `test`; deploy job key stays `deploy`.

- [ ] **Step 1: Replace `.github/workflows/test.yml` in full**

The `test` job is byte-for-byte identical to the current one — only the triggers and the `deploy` job change. Full new file content:

```yaml
name: Test & Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions: {}

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    env:
      FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true

    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # @v7.0.0
        with:
          fetch-depth: 0

      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # @v6
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Audit dependencies
        run: npm audit --audit-level=high

      - name: Cache Playwright browsers
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # @v6.1.0
        id: playwright-cache
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ hashFiles('package-lock.json') }}

      - name: Install Playwright browsers
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: npx playwright install chromium --with-deps

      - name: Install Playwright system deps
        if: steps.playwright-cache.outputs.cache-hit == 'true'
        run: npx playwright install-deps chromium

      - uses: 1password/install-cli-action@a5215d3a7f75c1629216c465ea9ab3ab399c4b71 # @v4.0.0

      - name: Run tests
        env:
          OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
        run: npm test

  deploy:
    needs: test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    concurrency:
      group: github-pages
      cancel-in-progress: false

    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # @v7.0.0

      - name: Upload site artifact
        uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # @v5.0.0
        with:
          path: .

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128 # @v5.0.0
```

Notes locked in here so nobody "improves" them later:
- `contents: read` in the deploy job is required — job-level `permissions` replaces the default entirely, and checkout fails without it.
- `path: .` uploads the whole repo (minus `.git`), which is parity with today: legacy Pages already serves the entire repo. `node_modules` doesn't exist in a fresh checkout. No `actions/configure-pages` step — it's for framework build config we don't have; Pages enablement is done once via API in Task 3 (YAGNI).
- The `if` checks `event_name == 'push'` so Dependabot PRs run tests but never deploy.
- `concurrency` on the deploy job queues rapid pushes instead of cancelling a mid-flight deploy.

- [ ] **Step 2: Edit `.github/workflows/codeql.yml` triggers**

Old (lines 3–7):

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
```

New:

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

- [ ] **Step 3: Edit `.github/dependabot.yml`**

Delete both `    target-branch: develop` lines (lines 10 and 18). With no `target-branch`, Dependabot targets the default branch (`main`), where the `pull_request` trigger tests its PRs.

- [ ] **Step 4: Edit `README.md`**

Delete line 5 (the `pages-build-deployment` badge) — that system workflow only runs in legacy mode and stops firing after the switch, so the badge would freeze stale:

```markdown
[![pages-build-deployment](https://github.com/tomirish/evolve.coaches/actions/workflows/pages/pages-build-deployment/badge.svg)](https://github.com/tomirish/evolve.coaches/actions/workflows/pages/pages-build-deployment)
```

Replace the Git workflow section (lines 44–48 before the badge deletion) — old:

```markdown
### Git workflow
- **All work goes to `develop`** — never commit or push directly to `main`
- CI runs the Playwright test suite on every push to `develop`
- `main` is protected — only the CI pipeline can push to it, and only after all tests pass
- `main` is updated automatically once the test run completes successfully
```

New:

```markdown
### Git workflow
- **All work goes to `main`** — there is no develop branch
- CI runs the Playwright test suite on every push to `main`
- The live site only updates when tests pass — the deploy job publishes to GitHub Pages via Actions, so a broken commit never reaches the site
```

- [ ] **Step 5: Edit `CLAUDE.md` (six edits)**

**5a — Branching section.** Old:

```markdown
**`develop` is the working branch — commit and push there directly.** It promotes to `main` after passing the develop pipeline. Don't open a PR against `main`, and don't create a feature branch for ordinary work.

`.github/workflows/test.yml` runs on pushes and PRs to `develop` — that's the gate. `codeql.yml` runs on both branches.
```

New:

```markdown
**`main` is the only branch — commit and push there directly.** Don't open PRs and don't create feature branches for ordinary work. There is no develop branch.

`.github/workflows/test.yml` runs on every push to `main`: the `test` job runs the full Playwright suite, and the `deploy` job publishes to GitHub Pages (Actions deployment, not branch-based) only when tests pass. A broken commit lands in git history but never reaches the live site — it keeps serving the last green deploy. Fix forward.
```

**5b — Decisions bullet.** Old:

```markdown
- **Dev branch workflow** — `main` is always the live site (GitHub Pages). All feature work happens on `develop` and is merged to `main` only when stable and tested locally. Claude must always verify we are on `develop` before making any code changes, and must never commit or push to `main` directly.
```

New:

```markdown
- **Single-branch workflow (replaced dev-branch workflow 2026-07)** — all work happens directly on `main`. GitHub Pages deploys via Actions (`actions/deploy-pages`), gated on the test job, so the live site only ever updates from a green pipeline. The old develop → ff-merge → main flow and its `GH_DEPLOY_TOKEN` PAT are gone.
```

**5c — Working principle 4, last sentence.** Old:

```markdown
If I think we should push but Tom hasn't said so, ask first — CI auto-merges to main and pushes directly affect production.
```

New:

```markdown
If I think we should push but Tom hasn't said so, ask first — a push to main deploys to production as soon as tests pass.
```

**5d — Working principle 7.** Old:

```markdown
7. **Main branch is always clean** — only stable, working code on `main`. Feature branches for anything in progress.
```

New:

```markdown
7. **The live site is always clean** — deploys only happen from green pipelines. A broken commit on `main` is tolerable (the site keeps serving the last good deploy); fix forward promptly rather than rewriting history.
```

**5e — CI/CD section.** Old first bullet:

```markdown
- **Single workflow** — `test.yml` handles both testing and deploy. No separate deploy.yml. Deploy job uses `needs: test` + `if: github.ref == 'refs/heads/develop'` so it skips on PRs automatically and merges develop → main via ff-only on success.
```

New:

```markdown
- **Single workflow** — `test.yml` handles both testing and deploy. No separate deploy.yml. Deploy job uses `needs: test` + `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`, uploads the repo as a Pages artifact, and publishes via `actions/deploy-pages`. Pages source is "GitHub Actions" (workflow mode), not branch-based — do not flip it back.
```

Also in the CI/CD section, delete this entire bullet (CI no longer pushes anything, so the PAT is gone):

```markdown
- **Pushing workflow files from CI requires a PAT** — GITHUB_TOKEN can never push changes to `.github/workflows/`. The deploy job uses a `GH_DEPLOY_TOKEN` secret (fine-grained PAT with `contents: write` + `workflows` on this repo) and pushes via `https://x-access-token:${GH_DEPLOY_TOKEN}@github.com/...` instead of `git push origin main`.
```

**5f — GitHub / CI gotchas.** Replace these two stale bullets — old:

```markdown
- Branch protection references the **job name** (`test`), not the workflow `name:` field — renaming the workflow title is safe; renaming the job key requires updating branch protection on both `main` and `develop`
- `pages-build-deployment` is a GitHub system workflow — cannot be renamed, badge label is hardcoded
```

New:

```markdown
- `main` is protected by a repo **ruleset** (deletion + force-push blocked), not classic branch protection, and has **no required status checks** — required checks would reject direct pushes, which is our whole workflow. Don't add them.
- `pages-build-deployment` is a GitHub system workflow that only runs for branch-based Pages deploys — it stopped firing when we switched to workflow mode; ignore it in the Actions list
```

- [ ] **Step 6: Validate workflows**

```bash
actionlint .github/workflows/test.yml .github/workflows/codeql.yml
```

Expected: no output (exit 0). Fix any reported errors before continuing.

- [ ] **Step 7: Run the test suite locally**

```bash
source ~/.zshrc && npm test
```

Expected: full Playwright suite passes. (Nothing in this commit touches app code, but this is the promotion gate baseline — if it's red here, CI will be red on main and Task 3 stalls.)

- [ ] **Step 8: Commit on develop**

```bash
git add .github/workflows/test.yml .github/workflows/codeql.yml .github/dependabot.yml README.md CLAUDE.md docs/superpowers/plans/2026-07-19-single-main-actions-deploy.md
git commit -m "Switch to single-main workflow with Actions-based Pages deploy

Pages now deploys via actions/deploy-pages gated on the test job, so a
broken commit can never take down the live site. Removes the develop
promotion pipeline and its GH_DEPLOY_TOKEN PAT.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Do NOT push develop — pushing this file to develop triggers nothing (the new workflow has no develop trigger), and Task 3 promotes it to main manually.

---

### Task 3: Flip Pages to Actions mode and promote to main

Order matters: flip Pages **before** pushing, so the first workflow run's `deploy-pages` step finds Pages already in workflow mode. Between the flip and the first green deploy, the site keeps serving the existing deployment — switching the source does not take the site down.

**Files:** none modified (API calls + git promotion).

**Interfaces:**
- Consumes: the Task 2 commit on `develop`.
- Produces: `main` carrying the new pipeline, Pages in workflow mode, one green `Test & Deploy` run with a successful `deploy` job.

- [ ] **Step 1: Flip the Pages source to GitHub Actions**

```bash
/opt/homebrew/bin/gh api -X PUT repos/tomirish/evolve.coaches/pages -f build_type=workflow
```

Expected: JSON response containing `"build_type":"workflow"`. Verify:

```bash
/opt/homebrew/bin/gh api repos/tomirish/evolve.coaches/pages --jq .build_type
```

Expected: `workflow`

- [ ] **Step 2: Confirm the site still serves (the flip must not drop it)**

```bash
curl -sI https://tomirish.github.io/evolve.coaches/ | head -1
```

Expected: `HTTP/2 200`

- [ ] **Step 3: Fast-forward main to develop and push**

```bash
git checkout main
git merge --ff-only develop
git push origin main
```

Expected: push accepted. If rejected with `refusing to allow a Personal Access Token to create or update workflow`, the PAT is missing the Workflows permission (Task 1 Step 3) — add it and re-push; nothing is in a broken state.

- [ ] **Step 4: Watch the pipeline**

```bash
/opt/homebrew/bin/gh run watch $(/opt/homebrew/bin/gh run list --repo tomirish/evolve.coaches --branch main --workflow test.yml --limit 1 --json databaseId --jq '.[0].databaseId') --repo tomirish/evolve.coaches --exit-status
```

Expected: exit 0, with both `test` and `deploy` jobs green. The deploy job's summary shows the page URL.

- [ ] **Step 5: Verify the Actions deployment is live**

```bash
curl -sI https://tomirish.github.io/evolve.coaches/ | head -1
curl -s https://tomirish.github.io/evolve.coaches/ | grep -o '<title>[^<]*</title>'
```

Expected: `HTTP/2 200` and the login page title. Also load the site in the browser and confirm the login page renders (hookify verification rule: visually confirm).

- [ ] **Step 6: Return the local checkout to main as the working branch**

```bash
git branch --show-current
```

Expected: `main`. Stay here — from now on all work is on main. Do not delete develop yet (that's Task 5, after the failure drill proves the gate works).

---

### Task 4: Failure drill — prove a bad commit cannot take the site down

This is the acceptance test for the whole project. We push a deliberately failing commit to `main` and confirm the deploy is skipped and the site stays up.

**Files:**
- Create (then remove): `tests/deploy-drill.spec.js`

**Interfaces:**
- Consumes: the green pipeline from Task 3.
- Produces: recorded evidence (one red run with skipped deploy + one green run) that the gate holds. Repo ends with no trace of the drill file.

- [ ] **Step 1: Write the deliberately failing test**

Create `tests/deploy-drill.spec.js`:

```js
const { test, expect } = require('@playwright/test');

// Deliberate failure: proves the deploy job is skipped when tests fail.
// This file is removed in the next commit.
test('deploy gate drill — this failure must block the deploy', () => {
  expect(1).toBe(2);
});
```

- [ ] **Step 2: Commit and push to main**

```bash
git add tests/deploy-drill.spec.js
git commit -m "Add deliberate test failure to drill the deploy gate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin main
```

(Skipping the local `npm test` gate is intentional and correct here — the commit exists to fail in CI.)

- [ ] **Step 3: Watch the run fail with deploy skipped**

```bash
/opt/homebrew/bin/gh run watch $(/opt/homebrew/bin/gh run list --repo tomirish/evolve.coaches --branch main --workflow test.yml --limit 1 --json databaseId --jq '.[0].databaseId') --repo tomirish/evolve.coaches --exit-status; echo "run exit: $?"
```

Expected: non-zero exit; `test` job FAILS at "Run tests", `deploy` job shows **skipped** (not failed, not run). Confirm with:

```bash
/opt/homebrew/bin/gh run view $(/opt/homebrew/bin/gh run list --repo tomirish/evolve.coaches --branch main --workflow test.yml --limit 1 --json databaseId --jq '.[0].databaseId') --repo tomirish/evolve.coaches --json jobs --jq '.jobs[] | {name, conclusion}'
```

Expected: `{"name":"test","conclusion":"failure"}` and `{"name":"deploy","conclusion":"skipped"}`.

- [ ] **Step 4: Confirm the site is still up and unchanged**

```bash
curl -sI https://tomirish.github.io/evolve.coaches/ | head -1
```

Expected: `HTTP/2 200`. This is the goal of the entire plan, verified.

- [ ] **Step 5: Remove the drill and push**

```bash
git rm tests/deploy-drill.spec.js
git commit -m "Remove deploy gate drill after verifying the gate holds

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 6: Watch the recovery run go green and deploy**

Same watch command as Task 3 Step 4. Expected: exit 0, `test` and `deploy` both green, site still `HTTP/2 200`.

---

### Task 5: Teardown — remove develop and the deploy PAT

Only after Task 4 proves the gate. Deleting a branch and a secret are the irreversible steps of this plan, which is why they come last.

**Files:** none modified.

**Interfaces:**
- Consumes: verified pipeline from Task 4; `main` and `develop` pointing at Task 2's commit or later.
- Produces: repo end-state — single branch, no CI secrets beyond `OP_SERVICE_ACCOUNT_TOKEN`.

- [ ] **Step 1: Confirm develop is fully contained in main**

```bash
git fetch origin --quiet
git log --oneline main..origin/develop | head -5
```

Expected: no output (develop has nothing main lacks — Task 3 fast-forwarded, Task 4 added commits on top). If anything prints, STOP — something was committed to develop after the promotion; merge it before deleting.

- [ ] **Step 2: Delete the develop branch, remote and local**

```bash
git push origin --delete develop
git branch -d develop
```

Expected: `- [deleted]  develop` from the remote, `Deleted branch develop` locally. (`-d` not `-D` — it refuses if develop somehow isn't merged, a second safety net.)

- [ ] **Step 3: Delete the GH_DEPLOY_TOKEN secret**

```bash
/opt/homebrew/bin/gh secret delete GH_DEPLOY_TOKEN --repo tomirish/evolve.coaches
```

Expected: `✓ Deleted secret GH_DEPLOY_TOKEN`.

- [ ] **Step 4 (Tom): Revoke the deploy PAT**

The fine-grained PAT that backed `GH_DEPLOY_TOKEN` (contents: write + workflows on this repo) is now unused. Tom: delete it at github.com → Settings → Developer settings → Personal access tokens. Separately, decide whether to keep the **Workflows** permission added in Task 1 on the day-to-day push PAT — keeping it is convenient since workflow edits now push straight to main; removing it re-tightens the token (global CLAUDE.md currently says add it temporarily).

- [ ] **Step 5: Prune the plan file**

Per the specs/plans convention, plans are pruned once implemented — the code plus commit messages are the durable record:

```bash
git rm docs/superpowers/plans/2026-07-19-single-main-actions-deploy.md
git commit -m "Prune implemented single-main deploy plan

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin main
```

Expected: the push triggers one more pipeline run; tests pass, deploy goes green.

- [ ] **Step 6: Final state check**

```bash
git branch -a
/opt/homebrew/bin/gh api repos/tomirish/evolve.coaches/pages --jq .build_type
curl -sI https://tomirish.github.io/evolve.coaches/ | head -1
```

Expected: only `main` (plus `remotes/origin/main`); `workflow`; `HTTP/2 200`.
