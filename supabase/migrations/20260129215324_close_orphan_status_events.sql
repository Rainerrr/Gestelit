-- Fix orphaned status events: Close any status events that are still "open" (ended_at IS NULL)
-- but belong to sessions that are already completed/aborted.
-- This is a one-time data fix for historical inconsistencies.

-- Close all orphaned status events by setting ended_at to the session's ended_at timestamp
UPDATE public.status_events se
SET ended_at = s.ended_at
FROM public.sessions s
WHERE se.session_id = s.id
  AND se.ended_at IS NULL              -- Status event is still "open"
  AND s.status IN ('completed', 'aborted')  -- Session is already closed
  AND s.ended_at IS NOT NULL;          -- Session has an ended_at timestamp

-- Create a trigger to automatically close all status events when a session is completed
-- This ensures future session completions don't leave orphaned status events
CREATE OR REPLACE FUNCTION public.close_session_status_events()
RETURNS TRIGGER AS $$
BEGIN
  -- When session status changes to completed or aborted, close all open status events
  IF (OLD.status = 'active' AND NEW.status IN ('completed', 'aborted')) THEN
    UPDATE public.status_events
    SET ended_at = COALESCE(NEW.ended_at, NOW())
    WHERE session_id = NEW.id
      AND ended_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger if it exists, then create it
DROP TRIGGER IF EXISTS tr_close_session_status_events ON public.sessions;

CREATE TRIGGER tr_close_session_status_events
  AFTER UPDATE OF status ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.close_session_status_events();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.close_session_status_events TO service_role;
