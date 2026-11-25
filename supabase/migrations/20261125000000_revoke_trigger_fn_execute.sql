-- Trigger functions must not be callable over the REST API (/rest/v1/rpc/).
-- Supabase's security advisor flagged both as executable by anon and authenticated.
-- Postgres checks EXECUTE on a trigger function only when the trigger is created,
-- never when it fires, so on_auth_user_created and on_movement_updated keep working.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_updated_at() from public, anon, authenticated;
