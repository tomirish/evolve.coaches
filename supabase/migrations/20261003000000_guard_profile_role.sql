-- Only an admin may change a profile's role.
--
-- The profiles UPDATE policy lets a user update their own row, and RLS cannot
-- restrict columns — so a coach could set their own role to 'admin' through
-- the Data API. This trigger closes that. Requests without an API JWT
-- (SQL editor, migrations, service role) are unaffected.

CREATE OR REPLACE FUNCTION public.guard_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.role() IN ('authenticated', 'anon')
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can change a role' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_role ON public.profiles;
CREATE TRIGGER guard_profile_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role();
