# evolve.coaches — Todo

## Open

- Centralize Supabase URL — `js/config.js`, `tests/helpers/global-setup.js`, `tests/helpers/fixtures.js`, and `tests/security.spec.js` all hardcode it independently. Pull from env var so there's one place to update.
- Add explicit GRANT statements for Supabase Data API change (enforced Oct 30, 2026) — new migration needed with `grant select, update on public.profiles to authenticated`, `grant select, insert, update, delete on public.movements to authenticated`, and `grant select, insert, update, delete on public.tags to authenticated`. Without this, PostgREST returns 42501 errors. See `supabase/migrations/20260221000000_initial_schema.sql`.

## Done
