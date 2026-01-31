CREATE OR REPLACE FUNCTION end_production_status_atomic(
  p_session_id UUID,
  p_status_event_id UUID,
  p_quantity_good INTEGER,
  p_quantity_scrap INTEGER,
  p_next_status_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $BODY$
DECLARE
  v_session sessions%ROWTYPE;
  v_current_event status_events%ROWTYPE;
  v_new_event status_events%ROWTYPE;
  v_wip_result session_update_result;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;

  SELECT * INTO v_current_event FROM status_events WHERE id = p_status_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STATUS_EVENT_NOT_FOUND'; END IF;

  IF v_current_event.session_id != p_session_id THEN RAISE EXCEPTION 'STATUS_EVENT_SESSION_MISMATCH'; END IF;
  IF v_current_event.ended_at IS NOT NULL THEN RAISE EXCEPTION 'STATUS_EVENT_ALREADY_ENDED'; END IF;

  UPDATE status_events SET quantity_good = p_quantity_good, quantity_scrap = p_quantity_scrap, ended_at = v_now,
    job_item_id = v_session.job_item_id, job_item_step_id = v_session.job_item_step_id WHERE id = p_status_event_id;

  INSERT INTO status_events (session_id, status_definition_id, started_at)
  VALUES (p_session_id, p_next_status_id, v_now) RETURNING * INTO v_new_event;

  IF v_session.job_item_id IS NOT NULL AND v_session.job_item_step_id IS NOT NULL THEN
    v_wip_result := update_session_quantities_atomic_v5(p_session_id, p_quantity_good, p_quantity_scrap);
    IF NOT v_wip_result.success THEN RAISE EXCEPTION 'WIP_UPDATE_FAILED: %', v_wip_result.error_code; END IF;
  END IF;

  UPDATE sessions SET current_status_id = p_next_status_id, last_status_change_at = v_now WHERE id = p_session_id;

  RETURN jsonb_build_object('newStatusEvent', jsonb_build_object('id', v_new_event.id, 'session_id', v_new_event.session_id, 'status_definition_id', v_new_event.status_definition_id, 'started_at', v_new_event.started_at));
END;
$BODY$;
