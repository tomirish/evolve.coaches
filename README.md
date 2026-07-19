# Evolve Coaches Video Library

[![Live Site](https://img.shields.io/website?url=https%3A%2F%2Ftomirish.github.io%2Fevolve.coaches&label=evolve.coaches&logo=github&labelColor=343B42&logoColor=959DA5&up_color=2EBC4F)](https://tomirish.github.io/evolve.coaches/)
[![Test & Deploy](https://github.com/tomirish/evolve.coaches/actions/workflows/test.yml/badge.svg)](https://github.com/tomirish/evolve.coaches/actions/workflows/test.yml)

A private video library for coaches at [Evolve Strong Fitness](https://evolvestrongfitness.com). Coaches can upload training movement videos, tag them with metadata, and browse the catalog before sessions.

## Features
- Secure login with password reset (coaches only)
- **Single upload** — video + metadata with AI-suggested movement name (Claude Haiku Vision OCR from video frame)
- **Bulk upload** — drop up to 48+ videos at once; AI names each automatically with 4-concurrent OCR jobs, video thumbnails with click-to-play preview
- Browse movements with search, tag filters, and A–Z / Z–A / Recent sort — alternative names appear as their own catalog cards
- Watch videos and edit metadata inline; replace a video file without losing metadata
- Signed video URLs via Cloudflare R2 with session caching for fast repeat loads
- Tags page (all coaches) — add and rename tags used across the catalog
- Admin page — invite and manage users, manage tags, browse all videos with thumbnails
  - **Duplicate detection** — toggle to group movements sharing a name for easy review
  - **Soft delete / archive** — movements are hidden not destroyed; restore any time via SQL
  - **Bulk archive** — checkbox rows and archive in one action
- Mobile-responsive design

## Development

### Prerequisites
- 1Password CLI — credentials are stored in a 1Password vault, not `.env` files
- Node.js
- Python 3 — used as the local HTTP server during tests

### Setup
```bash
npm install
npx playwright install chromium
```

### Running tests
```bash
npm test          # headless
npm run test:ui   # headed / interactive
```

Tests run against a local Python HTTP server with real Supabase credentials injected via 1Password CLI. Local runs are optional — CI is the safety net. Run locally before pushing only for significant changes (auth, nav, anything that affects every page).

### Git workflow
- **All work goes to `main`** — there is no develop branch
- CI runs the Playwright test suite on every push to `main`
- The live site only updates when tests pass — the deploy job publishes to GitHub Pages via Actions, so a broken commit never reaches the site
