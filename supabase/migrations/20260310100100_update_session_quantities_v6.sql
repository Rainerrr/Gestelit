-- Migration: Create update_session_quantities_v6 (independent reporting, no consumption)
-- Part of: Production System Refactor - Chunk 1 (Database Foundation)

CREATE OR REPLACE FUNCTION public.update_session_quantities_v6(
  p_session_id UUID,
  p_delta_good INTEGER,
  p_delta_scrap INTEGER
) RETURNS session_update_result AS $BODY$
DECLARE
  v_session RECORD;
  v_step_info RECORD;
  v_wip_balance RECORD;
  v_result session_update_result;
  v_retry_count INTEGER := 0;
  v_max_retries INTEGER := 3;
  v_updated_rows INTEGER;
  v_current_version INTEGER;
BEGIN
  v_result.success := false;
  v_result.error_code := NULL;
  v_result.session_id := p_session_id;

  -- Reject negative deltas (additive only)
  IF p_delta_good < 0 OR p_delta_scrap < 0 THEN
    v_result.error_code := 'NEGATIVE_DELTA_NOT_ALLOWED';
    RETURN v_result;
  END IF;

  -- Nothing to do
  IF p_delta_good = 0 AND p_delta_scrap = 0 THEN
    v_result.success := true;
    v_result.total_good := 0;
    v_result.total_scrap := 0;
    RETURN v_result;
  END IF;

  -- Validate session exists
  SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id;
  IF v_session IS NULL THEN
    v_result.error_code := 'SESSION_NOT_FOUND';
    RETURN v_result;
  END IF;

  -- Legacy sessions without job_item_id: no WIP tracking needed
  IF v_session.job_item_id IS NULL THEN
    v_result.success := true;
    v_result.total_good := p_delta_good;
    v_result.total_scrap := p_delta_scrap;
    RETURN v_result;
  END IF;

  -- Get step info (need is_terminal flag)
  SELECT position, is_terminal INTO v_step_info
  FROM public.job_item_steps WHERE id = v_session.job_item_step_id;
  IF v_step_info IS NULL THEN
    v_result.error_code := 'JOB_ITEM_STEP_NOT_FOUND';
    RETURN v_result;
  END IF;

  -- Retry loop for optimistic locking
  LOOP
    v_retry_count := v_retry_count + 1;

    -- Read current WIP balance
    SELECT * INTO v_wip_balance
    FROM public.wip_balances
    WHERE job_item_id = v_session.job_item_id
      AND job_item_step_id = v_session.job_item_step_id;
    IF v_wip_balance IS NULL THEN
      v_result.error_code := 'WIP_BALANCE_NOT_FOUND';
      RETURN v_result;
    END IF;

    v_current_version := v_wip_balance.version;

    -- Atomically increment good_reported and scrap_reported with optimistic lock
    UPDATE public.wip_balances
    SET good_reported = good_reported + p_delta_good,
        scrap_reported = scrap_reported + p_delta_scrap,
        version = version + 1
    WHERE id = v_wip_balance.id
      AND version = v_current_version;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows = 0 THEN
      IF v_retry_count >= v_max_retries THEN
        v_result.error_code := 'CONCURRENT_MODIFICATION';
        RETURN v_result;
      END IF;
      PERFORM pg_sleep(0.01 * v_retry_count);
      CONTINUE;
    END IF;

    -- If terminal station, update job_item_progress
    IF v_step_info.is_terminal THEN
      UPDATE public.job_item_progress
      SET completed_good = completed_good + GREATEST(p_delta_good, 0),
          completed_scrap = completed_scrap + GREATEST(p_delta_scrap, 0)
      WHERE job_item_id = v_session.job_item_id;
    END IF;

    EXIT; -- Success, exit retry loop
  END LOOP;

  v_result.success := true;
  v_result.total_good := p_delta_good;
  v_result.total_scrap := p_delta_scrap;
  RETURN v_result;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT EXECUTE ON FUNCTION public.update_session_quantities_v6(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_session_quantities_v6(UUID, INTEGER, INTEGER) TO service_role;

COMMENT ON FUNCTION public.update_session_quantities_v6 IS
'Independent reporting model v6: increments good_reported/scrap_reported at current step. No upstream consumption. Terminal steps update job_item_progress.';
