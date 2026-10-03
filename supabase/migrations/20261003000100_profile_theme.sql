-- Per-coach light/dark preference, toggled from the avatar menu.
-- Light by default. The browser keeps a copy in localStorage ('theme') so the
-- page paints in the right theme before the profile loads.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'light'
  CONSTRAINT profiles_theme_check CHECK (theme IN ('light', 'dark'));
