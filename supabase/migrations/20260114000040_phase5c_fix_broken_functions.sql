-- Migration: Phase 5C - Fix Broken Functions After Schema Cleanup
-- Purpose: Update/drop functions that reference dropped columns/tables

BEGIN;

-- ============================================
-- Step 1: Drop legacy function rebuild_job_item_stations
-- (references dropped job_item_stations table and kind column)
-- ============================================
DROP FUNCTION IF EXISTS rebuild_job_item_stations(UUID);

-- ============================================
-- Step 2: Drop legacy function replace_production_line_stations
-- (references dropped production_line_stations table)
-- ============================================
DROP FUNCTION IF EXISTS replace_production_line_stations(UUID, UUID[]);

-- ============================================
-- Step 3: Drop job_item_stations table if it still exists as alias
-- ============================================
DROP TABLE IF EXISTS job_item_stations CASCADE;

-- ============================================
-- Step 4: Replace rebuild_job_item_steps with pipeline-only version
-- (removes references to kind, station_id, production_line_id, production_line_stations)
-- ============================================
CREATE OR REPLACE FUNCTION rebuild_job_item_steps(p_job_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_item RECORD;
  v_max_position INTEGER;
  v_jis_id UUID;
BEGIN
  -- Get job item details
  SELECT * INTO v_job_item FROM public.job_items WHERE id = p_job_item_id;

  IF v_job_item IS NULL THEN
    RAISE EXCEPTION 'Job item not found: %', p_job_item_id;
  END IF;

  -- Delete existing job_item_steps (CASCADE will handle wip_balances)
  -- This makes the function idempotent
  DELETE FROM public.job_item_steps WHERE job_item_id = p_job_item_id;

  -- All job items are now pipeline-based
  -- If pipeline_preset_id is set, expand from pipeline_preset_steps
  IF v_job_item.pipeline_preset_id IS NOT NULL THEN
    -- Get max position for determining terminal station
    SELECT MAX(position) INTO v_max_position
    FROM public.pipeline_preset_steps
    WHERE pipeline_preset_id = v_job_item.pipeline_preset_id;

    IF v_max_position IS NULL THEN
      RAISE EXCEPTION 'Pipeline preset % has no steps', v_job_item.pipeline_preset_id;
    END IF;

    -- Insert job_item_steps from pipeline_preset_steps
    -- Mark the last position as terminal
    INSERT INTO public.job_item_steps (job_item_id, station_id, position, is_terminal)
    SELECT
      p_job_item_id,
      pps.station_id,
      pps.position,
      (pps.position = v_max_position)
    FROM public.pipeline_preset_steps pps
    WHERE pps.pipeline_preset_id = v_job_item.pipeline_preset_id
    ORDER BY pps.position;

    -- Create wip_balances for each step
    INSERT INTO public.wip_balances (job_item_id, job_item_step_id)
    SELECT p_job_item_id, jis.id
    FROM public.job_item_steps jis
    WHERE jis.job_item_id = p_job_item_id;
  ELSE
    -- No preset - job_item_steps should already exist from setup_job_item_pipeline
    -- or be manually created. This is a no-op for items with custom pipelines.
    NULL;
  END IF;

  -- Upsert job_item_progress (ensure row exists)
  INSERT INTO public.job_item_progress (job_item_id, completed_good)
  VALUES (p_job_item_id, 0)
  ON CONFLICT (job_item_id) DO NOTHING;

END;
$$;

-- ============================================
-- Step 5: Update create_session_atomic to use job_item_step_id only
-- (drop the overloaded version with job_item_station_id parameter)
-- ============================================

-- First drop all existing versions
DROP FUNCTION IF EXISTS create_session_atomic(UUID, UUID, UUID, UUID, UUID, UUID);
DROP FUNCTION IF EXISTS create_session_atomic(UUID, UUID, UUID, UUID, UUID, UUID, UUID);

-- Create the updated version with job_item_step_id
CREATE OR REPLACE FUNCTION create_session_atomic(
  p_worker_id UUID,
  p_station_id UUID,
  p_job_id UUID,
  p_instance_id UUID,
  p_job_item_id UUID DEFAULT NULL,
  p_job_item_step_id UUID DEFAULT NULL
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

  -- Get stop status for closing sessions and initial status
  SELECT id INTO v_stop_status_id
  FROM status_definitions
  WHERE is_protected = TRUE
    AND label_he = 'עצירה'
    AND scope = 'global'
  LIMIT 1;

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

  -- Create new session (using job_item_step_id only)
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

COMMIT;
