-- Explicit GRANT statements required by Supabase Data API change (enforced 2026-10-30).
-- Without these, PostgREST returns 42501 permission errors.
-- See: https://supabase.com/docs/guides/database/postgres/data-api-changes

GRANT SELECT, UPDATE                        ON public.profiles  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE        ON public.movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE        ON public.tags      TO authenticated;
