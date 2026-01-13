-- End Production Status Atomic RPC Function
-- Applied to branch: yzpwxlgvfkkidjsphfzv
--
-- Atomically ends a production status event with quantities and starts the next status.
-- Updates session totals and WIP balances in a single transaction.

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

  -- 4. Update the production status event with quantities
  UPDATE status_events
  SET
    quantity_good = p_quantity_good,
    quantity_scrap = p_quantity_scrap,
    ended_at = v_now
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

  -- 6. Update session totals and current status
  UPDATE sessions
  SET
    total_good = total_good + p_quantity_good,
    total_scrap = total_scrap + p_quantity_scrap,
    current_status_id = p_next_status_id,
    last_status_change_at = v_now
  WHERE id = p_session_id;

  -- 7. If session has job_item_id, update WIP balances
  IF v_session.job_item_id IS NOT NULL AND v_session.job_item_station_id IS NOT NULL THEN
    PERFORM update_session_quantities_atomic_v2(
      p_session_id,
      v_session.total_good + p_quantity_good,
      v_session.total_scrap + p_quantity_scrap
    );
  END IF;

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
Updates session totals and WIP balances in a single transaction.';
