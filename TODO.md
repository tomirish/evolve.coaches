# evolve.coaches — Todo

## Open

- **[Low pri] Rename 1Password vault `GitHub.evolve.coaches` → `github.evolve.coaches`** — vault name uses uppercase; rename to lowercase to match the repo naming convention.

## Done

- Centralize Supabase URL — created `tests/helpers/config.js`; `global-setup.js`, `fixtures.js`, and `security.spec.js` now import from it.
- Add explicit GRANT statements for Supabase Data API change — `supabase/migrations/20260515000000_grant_data_api.sql` created and applied.
