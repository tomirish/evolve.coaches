# Evolve Coaches Video Library

**Status:**
[![Live Site](https://img.shields.io/badge/Site-evolve.coaches-green)](https://tomirish.github.io/evolve.coaches/)
[![GitHub Pages](https://img.shields.io/badge/Host-GitHub_Pages-222)](https://pages.github.com)
[![Tests](https://github.com/tomirish/evolve.coaches/actions/workflows/test.yml/badge.svg)](https://github.com/tomirish/evolve.coaches/actions/workflows/test.yml)

**Tech Stack:**
[![HTML](https://img.shields.io/badge/HTML-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS](https://img.shields.io/badge/CSS-1572B6?logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Cloudflare R2](https://img.shields.io/badge/Cloudflare_R2-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/r2/)
[![Resend](https://img.shields.io/badge/Resend-000000?logo=resend&logoColor=white)](https://resend.com)

A private video library for coaches at [Evolve Strong Fitness](https://evolvestrongfitness.com). Coaches can upload training movement videos, tag them with metadata, and browse the catalog before sessions.

## Features
- Secure login (coaches only)
- Upload videos with movement name, alternative names, tags, and comments
- Browse movements with search, tag filters, and A–Z / Z–A / Recent sort — alternative names appear as their own catalog cards
- Watch videos and edit metadata inline
- Replace a video file without losing metadata
- Admin page to manage tags and users

## Development

### Prerequisites
- [1Password CLI](https://developer.1password.com/docs/cli/) — credentials are stored in a 1Password vault, not `.env` files
- Node.js

### Running tests
```bash
npm test          # headless
npm run test:ui   # headed / interactive
```

Tests run against a local Python HTTP server and use real Supabase credentials injected via 1Password CLI. CI runs the same suite automatically on every push to `develop`.
