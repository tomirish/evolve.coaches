-- Signed-out visitors (the anon role, i.e. anyone holding the public site key) need nothing
-- from the database: every page, edge function and the NAS synthetic probe signs in first.
-- Supabase's default grants gave anon full privileges on every public table, leaving RLS
-- as the only lock; one mistaken policy would have opened coach data to the internet.

-- 1. Tables: anon gets nothing, now or on tables created later.
revoke all on public.profiles, public.movements, public.tags from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;

-- 2. rename_tag: take the old name from the database, not the browser. It runs as
--    SECURITY DEFINER (past the movements RLS), so a caller-supplied old name let any
--    signed-in coach rewrite arbitrary tag text on every movement. p_old_name stays in
--    the signature so js/tags.js keeps working, but it is ignored.
create or replace function public.rename_tag(p_tag_id uuid, p_old_name text, p_new_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
  v_new text := btrim(p_new_name);
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  if v_new is null or v_new = '' then
    raise exception 'Tag name cannot be blank';
  end if;

  select name into v_old from tags where id = p_tag_id;
  if not found then
    raise exception 'Tag not found';
  end if;
  if v_old = v_new then
    return;
  end if;
  if exists (select 1 from tags where id <> p_tag_id and lower(name) = lower(v_new)) then
    raise exception 'Tag already exists';
  end if;

  update tags set name = v_new where id = p_tag_id;
  update movements set tags = array_replace(tags, v_old, v_new) where v_old = any(tags);
end;
$$;

-- 3. SECURITY DEFINER functions: signed-in coaches only. is_admin() is used by RLS
--    policies and the guard_profile_role trigger, so authenticated must keep it.
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.rename_tag(uuid, text, text) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.rename_tag(uuid, text, text) to authenticated;
