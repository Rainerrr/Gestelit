-- Migration: Update end_production_status to use v4 WIP function
-- Part of: Database Cleanup - Remove legacy quantity columns
-- Purpose: Remove dependency on sessions.total_good/scrap columns
--
-- Changes:
-- - Use update_session_quantities_atomic_v4 (delta-based, not total-based)
-- - Remove sessions.total_good/scrap updates
-- - Legacy path still works (just doesn't update totals anymore)

CREATE OR REPLACE FUNCTION end_production_status_atomic(
  p_session_id UUID,
  p_status_event_id UUID,
  p_quantity_good INTEGER,
  p_quantity_scrap INTEGER,
  p_next_status_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session sessions%ROWTYPE;
  v_current_event status_events%ROWTYPE;
  v_new_event status_events%ROWTYPE;
  v_wip_result session_update_result;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- 1. Lock and fetch session
  SELECT * INTO v_session
  FROM sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND';
  END IF;

  -- 2. Lock and fetch current status event
  SELECT * INTO v_current_event
  FROM status_events
  WHERE id = p_status_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STATUS_EVENT_NOT_FOUND';
  END IF;

  -- 3. Verify this is the current active event for the session
  IF v_current_event.session_id != p_session_id THEN
    RAISE EXCEPTION 'STATUS_EVENT_SESSION_MISMATCH';
  END IF;

  IF v_current_event.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'STATUS_EVENT_ALREADY_ENDED';
  END IF;

  -- 4. Update the production status event with quantities AND job item context
  UPDATE status_events
  SET
    quantity_good = p_quantity_good,
    quantity_scrap = p_quantity_scrap,
    ended_at = v_now,
    job_item_id = v_session.job_item_id,
    job_item_step_id = v_session.job_item_step_id
  WHERE id = p_status_event_id;

  -- 5. Create new status event for next status
  INSERT INTO status_events (
    session_id,
    status_definition_id,
    started_at
  ) VALUES (
    p_session_id,
    p_next_status_id,
    v_now
  ) RETURNING * INTO v_new_event;

  -- 6. If session has job_item_id, update WIP balances using v4 function
  --    v4 takes DELTAS (increments), not totals
  IF v_session.job_item_id IS NOT NULL AND v_session.job_item_step_id IS NOT NULL THEN
    v_wip_result := update_session_quantities_atomic_v4(
      p_session_id,
      p_quantity_good,   -- Delta (increment)
      p_quantity_scrap   -- Delta (increment)
    );

    -- Check for WIP errors
    IF NOT v_wip_result.success THEN
      RAISE EXCEPTION 'WIP_UPDATE_FAILED: %', v_wip_result.error_code;
    END IF;
  END IF;

  -- 7. Update session status tracking only (no total_good/scrap anymore)
  UPDATE sessions
  SET
    current_status_id = p_next_status_id,
    last_status_change_at = v_now
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'newStatusEvent', jsonb_build_object(
      'id', v_new_event.id,
      'session_id', v_new_event.session_id,
      'status_definition_id', v_new_event.status_definition_id,
      'started_at', v_new_event.started_at
    )
  );
END;
$$;

COMMENT ON FUNCTION end_production_status_atomic IS
'Atomically ends a production status event with quantities and starts the next status.
v4: Uses delta-based WIP update (v4 function), no longer updates sessions.total_good/scrap.
Session totals are now derived from SUM(status_events.quantity_*).';
