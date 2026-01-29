-- Performance at Scale: WIP Optimistic Locking - v5 Function
CREATE OR REPLACE FUNCTION public.update_session_quantities_atomic_v5(
  p_session_id UUID,
  p_delta_good INTEGER,
  p_delta_scrap INTEGER
) RETURNS session_update_result AS $BODY$
DECLARE
  v_session RECORD;
  v_step_info RECORD;
  v_upstream_step RECORD;
  v_wip_balance RECORD;
  v_pull_amount INTEGER;
  v_result session_update_result;
  v_retry_count INTEGER := 0;
  v_max_retries INTEGER := 3;
  v_updated_rows INTEGER;
  v_upstream_version INTEGER;
  v_current_version INTEGER;
BEGIN
  v_result.success := false;
  v_result.error_code := NULL;
  v_result.session_id := p_session_id;

  SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id;
  IF v_session IS NULL THEN
    v_result.error_code := 'SESSION_NOT_FOUND';
    RETURN v_result;
  END IF;

  IF v_session.job_item_id IS NULL THEN
    v_result.success := true;
    v_result.total_good := p_delta_good;
    v_result.total_scrap := p_delta_scrap;
    RETURN v_result;
  END IF;

  SELECT position, is_terminal INTO v_step_info FROM public.job_item_steps WHERE id = v_session.job_item_step_id;
  IF v_step_info IS NULL THEN
    v_result.error_code := 'JOB_ITEM_STEP_NOT_FOUND';
    RETURN v_result;
  END IF;

  LOOP
    v_retry_count := v_retry_count + 1;

    SELECT * INTO v_wip_balance FROM public.wip_balances WHERE job_item_id = v_session.job_item_id AND job_item_step_id = v_session.job_item_step_id;
    IF v_wip_balance IS NULL THEN
      v_result.error_code := 'WIP_BALANCE_NOT_FOUND';
      RETURN v_result;
    END IF;

    v_current_version := v_wip_balance.version;

    IF p_delta_good > 0 THEN
      IF v_step_info.position > 1 THEN
        SELECT jis.*, wb.id as wip_balance_id, wb.good_available, wb.version as wb_version INTO v_upstream_step
        FROM public.job_item_steps jis JOIN public.wip_balances wb ON wb.job_item_step_id = jis.id
        WHERE jis.job_item_id = v_session.job_item_id AND jis.position = v_step_info.position - 1;

        IF v_upstream_step IS NOT NULL AND v_upstream_step.good_available > 0 THEN
          v_pull_amount := LEAST(p_delta_good, v_upstream_step.good_available);
          v_upstream_version := v_upstream_step.wb_version;

          UPDATE public.wip_balances SET good_available = good_available - v_pull_amount, version = version + 1
          WHERE id = v_upstream_step.wip_balance_id AND version = v_upstream_version;

          GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
          IF v_updated_rows = 0 THEN
            IF v_retry_count >= v_max_retries THEN v_result.error_code := 'CONCURRENT_MODIFICATION'; RETURN v_result; END IF;
            PERFORM pg_sleep(0.01 * v_retry_count);
            CONTINUE;
          END IF;

          INSERT INTO public.wip_consumptions (job_item_id, consuming_session_id, from_job_item_step_id, good_used, is_scrap)
          VALUES (v_session.job_item_id, p_session_id, v_upstream_step.id, v_pull_amount, FALSE);
        END IF;
      END IF;

      UPDATE public.wip_balances SET good_available = good_available + p_delta_good, version = version + 1
      WHERE id = v_wip_balance.id AND version = v_current_version;

      GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
      IF v_updated_rows = 0 THEN
        IF v_retry_count >= v_max_retries THEN v_result.error_code := 'CONCURRENT_MODIFICATION'; RETURN v_result; END IF;
        PERFORM pg_sleep(0.01 * v_retry_count);
        CONTINUE;
      END IF;

      IF v_step_info.is_terminal THEN
        UPDATE public.job_item_progress SET completed_good = completed_good + p_delta_good WHERE job_item_id = v_session.job_item_id;
      END IF;
    END IF;

    IF p_delta_scrap > 0 THEN
      IF v_step_info.position > 1 THEN
        SELECT jis.*, wb.id as wip_balance_id, wb.good_available, wb.version as wb_version INTO v_upstream_step
        FROM public.job_item_steps jis JOIN public.wip_balances wb ON wb.job_item_step_id = jis.id
        WHERE jis.job_item_id = v_session.job_item_id AND jis.position = v_step_info.position - 1;

        IF v_upstream_step IS NOT NULL AND v_upstream_step.good_available > 0 THEN
          v_pull_amount := LEAST(p_delta_scrap, v_upstream_step.good_available);
          v_upstream_version := v_upstream_step.wb_version;

          UPDATE public.wip_balances SET good_available = good_available - v_pull_amount, version = version + 1
          WHERE id = v_upstream_step.wip_balance_id AND version = v_upstream_version;

          GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
          IF v_updated_rows = 0 THEN
            IF v_retry_count >= v_max_retries THEN v_result.error_code := 'CONCURRENT_MODIFICATION'; RETURN v_result; END IF;
            PERFORM pg_sleep(0.01 * v_retry_count);
            CONTINUE;
          END IF;

          INSERT INTO public.wip_consumptions (job_item_id, consuming_session_id, from_job_item_step_id, good_used, is_scrap)
          VALUES (v_session.job_item_id, p_session_id, v_upstream_step.id, v_pull_amount, TRUE);
        END IF;
      END IF;
    END IF;

    EXIT;
  END LOOP;

  v_result.success := true;
  v_result.total_good := p_delta_good;
  v_result.total_scrap := p_delta_scrap;
  RETURN v_result;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;
