# Evolve Coaches Video Library

**Status:**
[![Live Site](https://img.shields.io/badge/Site-evolve.coaches-green)](https://tomirish.github.io/evolve.coaches/)
[![GitHub Pages](https://img.shields.io/badge/Host-GitHub_Pages-222)](https://pages.github.com)
[![Tests](https://github.com/tomirish/evolve.coaches/actions/workflows/test.yml/badge.svg)](https://github.com/tomirish/evolve.coaches/actions/workflows/test.yml)

**Code:**
[![HTML](https://img.shields.io/badge/HTML-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS](https://img.shields.io/badge/CSS-1572B6?logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev)

**Services:**
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Cloudflare R2](https://img.shields.io/badge/Cloudflare_R2-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/r2/)
[![Resend](https://img.shields.io/badge/Resend-000000?logo=resend&logoColor=white)](https://resend.com)
[![1Password](https://img.shields.io/badge/1Password-0094F5?logo=1password&logoColor=white)](https://developer.1password.com/docs/cli/)

A private video library for coaches at [Evolve Strong Fitness](https://evolvestrongfitness.com). Coaches can upload training movement videos, tag them with metadata, and browse the catalog before sessions.

## Features
- Secure login with password reset (coaches only)
- Upload videos with movement name, alternative names, tags, and comments
- Browse movements with search, tag filters, and A–Z / Z–A / Recent sort — alternative names appear as their own catalog cards
- Watch videos and edit metadata inline; replace a video file without losing metadata
- Signed video URLs via Cloudflare R2 with session caching for fast repeat loads
- Tags page (all coaches) — add and rename tags used across the catalog
- Admin page — invite and manage users, delete tags with usage counts
- Mobile-responsive design

## Development

### Prerequisites
- [1Password CLI](https://developer.1password.com/docs/cli/) — credentials are stored in a 1Password vault, not `.env` files
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

Tests run against a local Python HTTP server with real Supabase credentials injected via 1Password CLI. CI runs the same suite on every push to `develop` and auto-merges to `main` on pass.
