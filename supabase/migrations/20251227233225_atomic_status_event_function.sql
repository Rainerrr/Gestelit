-- Create atomic function for status event creation
-- This eliminates race conditions by performing all operations in a single transaction:
-- 1. Close any open status events for the session
-- 2. Insert the new status event
-- 3. Mirror the status to the sessions table

DO $$
BEGIN
  -- Create the atomic function
  CREATE OR REPLACE FUNCTION public.create_status_event_atomic(
    p_session_id UUID,
    p_status_definition_id UUID,
    p_station_reason_id TEXT DEFAULT NULL,
    p_note TEXT DEFAULT NULL,
    p_image_url TEXT DEFAULT NULL,
    p_malfunction_id UUID DEFAULT NULL
  ) RETURNS public.status_events AS $func$
  DECLARE
    v_result public.status_events;
    v_now TIMESTAMPTZ := now();
  BEGIN
    -- Close any open status events for this session
    UPDATE public.status_events
    SET ended_at = v_now
    WHERE session_id = p_session_id AND ended_at IS NULL;

    -- Insert new status event
    INSERT INTO public.status_events (
      session_id,
      status_definition_id,
      station_reason_id,
      note,
      image_url,
      started_at,
      malfunction_id
    ) VALUES (
      p_session_id,
      p_status_definition_id,
      p_station_reason_id,
      p_note,
      p_image_url,
      v_now,
      p_malfunction_id
    ) RETURNING * INTO v_result;

    -- Mirror to sessions table (atomic within same transaction)
    UPDATE public.sessions
    SET
      current_status_id = p_status_definition_id,
      last_status_change_at = v_now
    WHERE id = p_session_id;

    RETURN v_result;
  END;
  $func$ LANGUAGE plpgsql SECURITY DEFINER;

  -- Grant execute permission to authenticated users (service role will bypass RLS anyway)
  GRANT EXECUTE ON FUNCTION public.create_status_event_atomic TO authenticated;
  GRANT EXECUTE ON FUNCTION public.create_status_event_atomic TO service_role;
END $$;
