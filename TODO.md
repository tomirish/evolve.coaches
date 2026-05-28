# evolve.coaches — Todo

## Open

## Done

- Rename 1Password vault `GitHub.evolve.coaches` → `github.evolve.coaches` — updated vault in 1Password app and all `op://` URIs in `.env.op`.
- Centralize Supabase URL — created `tests/helpers/config.js`; `global-setup.js`, `fixtures.js`, and `security.spec.js` now import from it.
- Add explicit GRANT statements for Supabase Data API change — `supabase/migrations/20260515000000_grant_data_api.sql` created and applied.
