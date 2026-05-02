# Security Policy

## Scope

evolve.coaches is a private video library for a small team of coaches. The attack surface includes:

- Authentication and session management (Supabase Auth)
- Role-based access control (admin vs. coach) enforced via RLS and Edge Functions
- Video upload and storage (Cloudflare R2, presigned URLs via Supabase Edge Functions)
- Admin functions: user invite, user deletion, tag management
- The CI/CD pipeline (GitHub Actions, 1Password CLI)
- Third-party dependencies (`package.json`)

## Supported versions

Only the current live deployment at [tomirish.github.io/evolve.coaches](https://tomirish.github.io/evolve.coaches) is supported.

## Reporting a vulnerability

Please use GitHub's [private vulnerability reporting](https://github.com/tomirish/evolve.coaches/security/advisories/new) to report security issues. This keeps details confidential until a fix is in place.

Reports will be acknowledged within a few days and confirmed issues resolved promptly.

## Out of scope

- Theoretical vulnerabilities with no practical impact
- Vulnerabilities in GitHub, Supabase, or Cloudflare's own infrastructure
- Issues that require physical access to a logged-in device
- Self-XSS or attacks that require the victim to already have admin access
