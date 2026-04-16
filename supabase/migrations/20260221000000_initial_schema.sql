-- Initial schema snapshot — captured 2026-04-15
-- Represents the full database state as of project creation.
-- Safe to replay on a fresh Supabase project.

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text,
  role       text        NOT NULL DEFAULT 'coach',
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tags (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.movements (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  tags        text[]      DEFAULT '{}',
  comments    text,
  video_path  text,
  uploaded_by uuid        REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  alt_names   text[]      NOT NULL DEFAULT '{}',
  archived_at timestamptz,
  PRIMARY KEY (id)
);

-- ── Functions ─────────────────────────────────────────────────────────────────

-- Returns true if the calling user has role = 'admin'.
-- SECURITY DEFINER so it can read profiles without triggering RLS recursion.
CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Auto-creates a profile row when a new auth user is created.
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'coach');
  RETURN new;
END;
$$;

-- Keeps updated_at current on movements rows.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

-- ── Triggers ──────────────────────────────────────────────────────────────────

-- Fire handle_new_user after every new auth.users insert.
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Fire handle_updated_at before every movements update.
CREATE OR REPLACE TRIGGER on_movement_updated
  BEFORE UPDATE ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags      ENABLE ROW LEVEL SECURITY;

-- profiles: any authenticated user can read; owner or admin can update
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "users and admins can update profiles"
  ON public.profiles FOR UPDATE
  USING  ((SELECT auth.uid()) = id OR is_admin())
  WITH CHECK ((SELECT auth.uid()) = id OR is_admin());

-- movements: any authenticated user can read/insert; uploader or admin can update/delete
CREATE POLICY "Authenticated users can view movements"
  ON public.movements FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can upload movements"
  ON public.movements FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Uploader or admin can update movements"
  ON public.movements FOR UPDATE
  USING ((SELECT auth.uid()) = uploaded_by OR is_admin());

CREATE POLICY "Uploader or admin can delete movements"
  ON public.movements FOR DELETE
  USING ((SELECT auth.uid()) = uploaded_by OR is_admin());

-- tags: any authenticated user can read/insert/update; only admin can delete
CREATE POLICY "Authenticated users can view muscle groups"
  ON public.tags FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can insert tags"
  ON public.tags FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can update tags"
  ON public.tags FOR UPDATE
  USING  ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Admins can delete muscle groups"
  ON public.tags FOR DELETE
  USING (is_admin());
