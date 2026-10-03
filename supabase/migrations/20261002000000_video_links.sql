-- Pasted YouTube/Instagram links as a second kind of movement media.
-- Design: docs/superpowers/specs/2026-10-02-video-links-design.md
--
-- What plays: video_path set -> R2 file (unchanged); else source_url -> embed.
-- The NAS worker (dev.tools/automation/archive_evolve_links) copies pending
-- links into R2 and fills video_path.
--
-- Named download_*, NOT archive_*: archived_at already means soft-deleted.

ALTER TABLE public.movements
  ADD COLUMN IF NOT EXISTS source_url        text,
  ADD COLUMN IF NOT EXISTS source_author     text,
  ADD COLUMN IF NOT EXISTS download_status   text,
  ADD COLUMN IF NOT EXISTS download_attempts int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS download_error    text,
  -- The chosen part of a linked video, in whole seconds. NULL/NULL = whole video.
  ADD COLUMN IF NOT EXISTS clip_start        int,
  ADD COLUMN IF NOT EXISTS clip_end          int;

-- Canonical forms only. Must match parseVideoLink() in js/auth.js and the
-- worker's parse_link(); a coach can write their own rows under RLS, so the
-- browser's validation alone is not a boundary.
ALTER TABLE public.movements
  ADD CONSTRAINT movements_source_url_format CHECK (
    source_url IS NULL
    OR source_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
    OR source_url ~ '^https://www\.instagram\.com/(p|reel)/[A-Za-z0-9_-]{5,40}/$'
  );

ALTER TABLE public.movements
  ADD CONSTRAINT movements_download_status_values CHECK (
    download_status IS NULL
    OR download_status IN ('pending', 'done', 'failed', 'link_only')
  );

-- A link always has a status; a file upload never has one.
ALTER TABLE public.movements
  ADD CONSTRAINT movements_link_has_status CHECK (
    (source_url IS NULL) = (download_status IS NULL)
  );

-- A part has both ends or neither, exists only on links, and is at most 3 minutes
-- (MAX_CLIP_SECONDS in js/auth.js; the worker re-checks it).
ALTER TABLE public.movements
  ADD CONSTRAINT movements_clip_pair CHECK ((clip_start IS NULL) = (clip_end IS NULL));

ALTER TABLE public.movements
  ADD CONSTRAINT movements_clip_link_only CHECK (clip_start IS NULL OR source_url IS NOT NULL);

ALTER TABLE public.movements
  ADD CONSTRAINT movements_clip_range CHECK (
    clip_start IS NULL
    OR (clip_start >= 0 AND clip_end > clip_start AND clip_end - clip_start <= 180)
  );

-- The worker's queue query.
CREATE INDEX IF NOT EXISTS movements_download_pending_idx
  ON public.movements (created_at)
  WHERE download_status = 'pending' AND archived_at IS NULL;
