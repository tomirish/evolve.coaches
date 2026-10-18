-- A post with several photos/videos: ?img_index=N (2–20) names the item the
-- coach was looking at. Item 1 is the bare URL, so each item has one form.
-- Must match parseVideoLink() in js/auth.js and the worker's parse_link().
ALTER TABLE public.movements DROP CONSTRAINT movements_source_url_format;
ALTER TABLE public.movements
  ADD CONSTRAINT movements_source_url_format CHECK (
    source_url IS NULL
    OR source_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
    OR source_url ~ '^https://www\.instagram\.com/(p|reel)/[A-Za-z0-9_-]{5,40}/$'
    OR source_url ~ '^https://www\.instagram\.com/p/[A-Za-z0-9_-]{5,40}/\?img_index=([2-9]|1[0-9]|20)$'
  );
