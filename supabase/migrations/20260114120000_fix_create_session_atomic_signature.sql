-- Migration: Fix create_session_atomic function signature
-- Purpose: Add missing p_initial_status_id parameter and fix p_instance_id type
-- Applied: 2026-01-14

-- Drop existing function first to change signature
DROP FUNCTION IF EXISTS create_session_atomic(UUID, UUID, UUID, UUID, UUID, UUID);

-- Create the corrected version
CREATE OR REPLACE FUNCTION create_session_atomic(
  p_worker_id UUID,
  p_station_id UUID,
  p_job_id UUID,
  p_instance_id TEXT,                    -- Fixed: TEXT type to match sessions.active_instance_id
  p_job_item_id UUID DEFAULT NULL,
  p_job_item_step_id UUID DEFAULT NULL,
  p_initial_status_id UUID DEFAULT NULL  -- Added: optional initial status parameter
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stop_status_id UUID;
  v_session_id UUID;
  v_session JSONB;
  v_timestamp TIMESTAMPTZ := NOW();
  v_old_session_id UUID;
BEGIN
  -- Lock worker's active sessions to prevent race conditions
  FOR v_old_session_id IN
    SELECT id FROM sessions
    WHERE worker_id = p_worker_id
      AND status = 'active'
      AND ended_at IS NULL
    FOR UPDATE
  LOOP
    -- We have the lock, now close these sessions
  END LOOP;

  -- Use provided status ID or fall back to looking up by label
  v_stop_status_id := p_initial_status_id;

  IF v_stop_status_id IS NULL THEN
    -- Fallback: look up stop status by label_he
    SELECT id INTO v_stop_status_id
    FROM status_definitions
    WHERE is_protected = TRUE
      AND label_he = 'עצירה'
      AND scope = 'global'
    LIMIT 1;
  END IF;

  IF v_stop_status_id IS NULL THEN
    RAISE EXCEPTION 'STOP_STATUS_NOT_FOUND';
  END IF;

  -- Close all active sessions for this worker and create final status events
  WITH closed_sessions AS (
    UPDATE sessions
    SET status = 'completed',
        ended_at = v_timestamp,
        forced_closed_at = v_timestamp
    WHERE worker_id = p_worker_id
      AND status = 'active'
      AND ended_at IS NULL
    RETURNING id
  )
  INSERT INTO status_events (session_id, status_definition_id, started_at, ended_at, note)
  SELECT id, v_stop_status_id, v_timestamp, v_timestamp, 'replaced-by-new-session'
  FROM closed_sessions;

  -- Create new session
  INSERT INTO sessions (
    worker_id,
    station_id,
    job_id,
    started_at,
    active_instance_id,
    status,
    current_status_id,
    job_item_id,
    job_item_step_id
  )
  VALUES (
    p_worker_id,
    p_station_id,
    p_job_id,
    v_timestamp,
    p_instance_id,
    'active',
    v_stop_status_id,
    p_job_item_id,
    p_job_item_step_id
  )
  RETURNING id INTO v_session_id;

  -- Create initial status event for new session
  INSERT INTO status_events (session_id, status_definition_id, started_at)
  VALUES (v_session_id, v_stop_status_id, v_timestamp);

  -- Return the created session as JSONB
  SELECT jsonb_build_object(
    'id', s.id,
    'worker_id', s.worker_id,
    'station_id', s.station_id,
    'job_id', s.job_id,
    'started_at', s.started_at,
    'active_instance_id', s.active_instance_id,
    'status', s.status,
    'current_status_id', s.current_status_id,
    'job_item_id', s.job_item_id,
    'job_item_step_id', s.job_item_step_id,
    'total_good', s.total_good,
    'total_scrap', s.total_scrap
  ) INTO v_session
  FROM sessions s
  WHERE s.id = v_session_id;

  RETURN v_session;
END;
$$;

COMMENT ON FUNCTION create_session_atomic IS 'Atomically creates a session, closing any existing active sessions for the worker. Accepts optional initial status ID.';
