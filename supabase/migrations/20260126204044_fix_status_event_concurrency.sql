-- Migration: Fix concurrent status event creation race condition
-- Purpose: Add FOR UPDATE lock on session row to serialize concurrent status updates
--          This prevents multiple open status events from being created simultaneously

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
  -- Lock the session row to serialize concurrent status updates
  -- This ensures only one transaction can modify status events at a time
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

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

