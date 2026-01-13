-- Close orphaned status events that belong to completed/aborted sessions
-- This fixes reports that are stuck as "ongoing" because the status event's ended_at was never set

-- Update status_events where:
-- 1. ended_at is NULL (still "open")
-- 2. The session is completed (ended_at IS NOT NULL OR status != 'active')
-- Set ended_at to the session's ended_at, or now() if session has no ended_at

UPDATE status_events se
SET ended_at = COALESCE(s.ended_at, s.forced_closed_at, now())
FROM sessions s
WHERE se.session_id = s.id
  AND se.ended_at IS NULL
  AND (s.ended_at IS NOT NULL OR s.status != 'active' OR s.forced_closed_at IS NOT NULL);

-- Also close any status events for sessions that have been idle for more than 5 minutes
-- This catches sessions that might have been abandoned without proper cleanup

UPDATE status_events se
SET ended_at = COALESCE(s.last_seen_at, s.started_at) + interval '5 minutes'
FROM sessions s
WHERE se.session_id = s.id
  AND se.ended_at IS NULL
  AND s.status = 'active'
  AND s.ended_at IS NULL
  AND s.forced_closed_at IS NULL
  AND (
    s.last_seen_at < now() - interval '5 minutes'
    OR (s.last_seen_at IS NULL AND s.started_at < now() - interval '5 minutes')
  );

-- For the above idle sessions, also mark them as completed
UPDATE sessions s
SET
  status = 'completed',
  ended_at = COALESCE(s.last_seen_at, s.started_at) + interval '5 minutes',
  forced_closed_at = now()
WHERE s.status = 'active'
  AND s.ended_at IS NULL
  AND s.forced_closed_at IS NULL
  AND (
    s.last_seen_at < now() - interval '5 minutes'
    OR (s.last_seen_at IS NULL AND s.started_at < now() - interval '5 minutes')
  );
