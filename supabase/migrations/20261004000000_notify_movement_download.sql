-- Tell the NAS link copier when there is work, instead of it polling.
--
-- The NAS holds a LISTEN movement_download connection and starts its copy job
-- when a notification arrives (dev.tools
-- docs/superpowers/specs/2026-10-02-archive-evolve-links-design.md, "listen,
-- don't poll"). Polling every 5 minutes cost ~2,000 1Password reads a day for
-- an event that happens a few times a year.
--
-- Fires when a row:
--   * becomes 'pending': upload (js/upload.js), link edit (js/movement.js),
--     Admin Retry (js/admin.js);
--   * stays 'pending' but its link or part changed (an edit of a queued link);
--   * stops being an open failure: leaves 'failed' (Admin Keep as link only),
--     or a failed row is archived or deleted. The copy job stays failed while
--     any open failure exists, so it must rerun to clear the alert.
-- It must NOT fire on the copier's own bookkeeping (a row that stays 'pending'
-- with only download_attempts / download_error / updated_at changing):
-- that would rerun the job after every attempt and defeat its retry backoff.
--
-- pg_notify is transactional: delivered on commit, never for a rolled-back
-- write. The payload is the movement id only.

CREATE OR REPLACE FUNCTION public.notify_movement_download()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.download_status = 'failed' AND OLD.archived_at IS NULL THEN
      PERFORM pg_notify('movement_download', OLD.id::text);
    END IF;
    RETURN NULL;
  END IF;

  IF (NEW.download_status = 'pending' AND (
        TG_OP = 'INSERT'
        OR OLD.download_status IS DISTINCT FROM 'pending'
        OR OLD.source_url IS DISTINCT FROM NEW.source_url
        OR OLD.clip_start IS DISTINCT FROM NEW.clip_start
        OR OLD.clip_end   IS DISTINCT FROM NEW.clip_end))
     OR (TG_OP = 'UPDATE'
         AND OLD.download_status = 'failed' AND OLD.archived_at IS NULL
         AND (NEW.download_status IS DISTINCT FROM 'failed' OR NEW.archived_at IS NOT NULL))
  THEN
    PERFORM pg_notify('movement_download', NEW.id::text);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_movement_download ON public.movements;
CREATE TRIGGER notify_movement_download
  AFTER INSERT OR UPDATE OR DELETE ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.notify_movement_download();
