DO $migration$
BEGIN
  -- 1. Add current_job_item_started_at to sessions
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_job_item_started_at TIMESTAMPTZ DEFAULT NULL;

  COMMENT ON COLUMN sessions.current_job_item_started_at IS
  'Timestamp when current job item was bound. Used for live job item timer calculation. NULL when no job item active.';

  -- 2. Backfill active sessions with approximate timer start
  UPDATE sessions
  SET current_job_item_started_at = COALESCE(last_status_change_at, started_at)
  WHERE status = 'active'
    AND job_item_id IS NOT NULL
    AND current_job_item_started_at IS NULL;

  -- 3. Atomic job item binding RPC
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.bind_job_item_atomic(
      p_session_id UUID,
      p_job_id UUID,
      p_job_item_id UUID,
      p_job_item_step_id UUID
    ) RETURNS public.sessions
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $BODY$
    DECLARE
      v_session public.sessions;
      v_job_item RECORD;
      v_step RECORD;
    BEGIN
      SELECT * INTO v_session FROM public.sessions
      WHERE id = p_session_id AND status = 'active'
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_INACTIVE';
      END IF;

      SELECT id, job_id, is_active INTO v_job_item
      FROM public.job_items
      WHERE id = p_job_item_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'JOB_ITEM_NOT_FOUND';
      END IF;

      IF v_job_item.job_id != p_job_id THEN
        RAISE EXCEPTION 'JOB_ITEM_JOB_MISMATCH';
      END IF;

      IF NOT v_job_item.is_active THEN
        RAISE EXCEPTION 'JOB_ITEM_INACTIVE';
      END IF;

      SELECT id, job_item_id INTO v_step
      FROM public.job_item_steps
      WHERE id = p_job_item_step_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'JOB_ITEM_STEP_NOT_FOUND';
      END IF;

      IF v_step.job_item_id != p_job_item_id THEN
        RAISE EXCEPTION 'JOB_ITEM_STEP_MISMATCH';
      END IF;

      UPDATE public.sessions
      SET job_id = p_job_id,
          job_item_id = p_job_item_id,
          job_item_step_id = p_job_item_step_id,
          current_job_item_started_at = NOW()
      WHERE id = p_session_id
      RETURNING * INTO v_session;

      RETURN v_session;
    END;
    $BODY$
  $fn$;

  -- 4. Atomic job item unbinding RPC
  EXECUTE $fn2$
    CREATE OR REPLACE FUNCTION public.unbind_job_item_atomic(
      p_session_id UUID
    ) RETURNS public.sessions
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $BODY$
    DECLARE
      v_session public.sessions;
    BEGIN
      SELECT * INTO v_session FROM public.sessions
      WHERE id = p_session_id AND status = 'active'
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_INACTIVE';
      END IF;

      UPDATE public.sessions
      SET job_id = NULL,
          job_item_id = NULL,
          job_item_step_id = NULL,
          current_job_item_started_at = NULL
      WHERE id = p_session_id
      RETURNING * INTO v_session;

      RETURN v_session;
    END;
    $BODY$
  $fn2$;

  -- 5. Grants
  GRANT EXECUTE ON FUNCTION public.bind_job_item_atomic(UUID, UUID, UUID, UUID) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.bind_job_item_atomic(UUID, UUID, UUID, UUID) TO service_role;
  GRANT EXECUTE ON FUNCTION public.unbind_job_item_atomic(UUID) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.unbind_job_item_atomic(UUID) TO service_role;

  COMMENT ON FUNCTION public.bind_job_item_atomic IS
  'Atomically validates and binds a job item to a session. Sets current_job_item_started_at for timer tracking.';

  COMMENT ON FUNCTION public.unbind_job_item_atomic IS
  'Clears job item binding from session. Sets all job columns and timer to NULL.';
END $migration$;
