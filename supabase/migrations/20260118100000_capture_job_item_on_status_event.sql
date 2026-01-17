-- Migration: Capture job_item_id when creating status events
-- Purpose: Status events should capture job item context immediately when created,
--          not just when ended (with quantity reporting). This allows the timeline
--          to show what job item a worker was working on even before quantity is reported.

CREATE OR REPLACE FUNCTION public.create_status_event_atomic(
  p_session_id UUID,
  p_status_definition_id UUID,
  p_station_reason_id TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL,
  p_report_id UUID DEFAULT NULL
) RETURNS public.status_events AS $$
DECLARE
  v_result public.status_events;
  v_session public.sessions%ROWTYPE;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Fetch session to get job_item_id and job_item_step_id
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND';
  END IF;

  -- Close any open status events for this session
  UPDATE public.status_events
  SET ended_at = v_now
  WHERE session_id = p_session_id AND ended_at IS NULL;

  -- Insert new status event WITH job item context from session
  INSERT INTO public.status_events (
    session_id,
    status_definition_id,
    station_reason_id,
    note,
    image_url,
    started_at,
    report_id,
    job_item_id,
    job_item_step_id
  ) VALUES (
    p_session_id,
    p_status_definition_id,
    p_station_reason_id,
    p_note,
    p_image_url,
    v_now,
    p_report_id,
    v_session.job_item_id,
    v_session.job_item_step_id
  ) RETURNING * INTO v_result;

  -- Mirror to sessions table (atomic within same transaction)
  UPDATE public.sessions
  SET
    current_status_id = p_status_definition_id,
    last_status_change_at = v_now
  WHERE id = p_session_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_status_event_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_status_event_atomic TO service_role;

COMMENT ON FUNCTION public.create_status_event_atomic IS
'Atomically creates a status event, closing any open events and mirroring to sessions.
Now also captures job_item_id and job_item_step_id from the session so timeline shows job context immediately.';

-- Also update end_production_status_atomic to capture job_item_id when creating the NEXT status event
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

  -- 5. Create new status event for next status WITH job item context
  --    This ensures the timeline shows which job item the worker was working on
  --    even before any quantity is reported for this new status
  INSERT INTO status_events (
    session_id,
    status_definition_id,
    started_at,
    job_item_id,
    job_item_step_id
  ) VALUES (
    p_session_id,
    p_next_status_id,
    v_now,
    v_session.job_item_id,
    v_session.job_item_step_id
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
v5: Now captures job_item_id on the NEW status event too, so timeline shows job context immediately.
Uses delta-based WIP update (v4 function), no longer updates sessions.total_good/scrap.';
