-- Migration: Fix deadlock in update_session_quantities_atomic_v2
--
-- PROBLEM:
-- The previous version used `FOR UPDATE` on a `LEFT JOIN`, which can cause
-- deadlocks when two sessions on the same production line update concurrently.
-- PostgreSQL's row-level locks don't work well with joins.
--
-- FIX:
-- 1. Lock session row first (no join)
-- 2. Fetch job_item_station info separately (read-only, no lock needed)
-- 3. Use advisory lock on job_item_id to serialize WIP updates per production line
-- 4. Lock wip_balances in consistent order (by job_item_station_id)
--
-- This prevents deadlocks while maintaining data integrity.

CREATE OR REPLACE FUNCTION public.update_session_quantities_atomic_v2(
  p_session_id UUID,
  p_total_good INTEGER,
  p_total_scrap INTEGER
) RETURNS session_update_result AS $$
DECLARE
  v_session RECORD;
  v_step_info RECORD;
  v_upstream_step RECORD;
  v_wip_balance RECORD;
  v_delta_good INTEGER;
  v_delta_scrap INTEGER;
  v_pull_amount INTEGER;
  v_reduce_remaining INTEGER;
  v_originated_before INTEGER;
  v_pulled_total INTEGER;
  v_originated_reduce INTEGER;
  v_pulled_reduce INTEGER;
  v_consumption RECORD;
  v_return_amount INTEGER;
  v_result session_update_result;
  v_lock_key BIGINT;
BEGIN
  -- Initialize result
  v_result.success := false;
  v_result.error_code := NULL;
  v_result.session_id := p_session_id;

  -- ============================================
  -- STEP 1: Lock session row ONLY (no join)
  -- ============================================
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL THEN
    v_result.error_code := 'SESSION_NOT_FOUND';
    RETURN v_result;
  END IF;

  -- ============================================
  -- LEGACY PATH: No job_item tracking
  -- ============================================
  IF v_session.job_item_id IS NULL THEN
    UPDATE public.sessions
    SET total_good = p_total_good, total_scrap = p_total_scrap
    WHERE id = p_session_id;

    v_result.success := true;
    v_result.total_good := p_total_good;
    v_result.total_scrap := p_total_scrap;
    RETURN v_result;
  END IF;

  -- ============================================
  -- STEP 2: Get job_item_station info (no lock, read-only)
  -- ============================================
  SELECT position, is_terminal INTO v_step_info
  FROM public.job_item_stations
  WHERE id = v_session.job_item_station_id;

  IF v_step_info IS NULL THEN
    v_result.error_code := 'JOB_ITEM_STATION_NOT_FOUND';
    RETURN v_result;
  END IF;

  -- ============================================
  -- STEP 3: Advisory lock on job_item to serialize production line updates
  -- This prevents deadlocks by ensuring only one session per production line
  -- can modify WIP balances at a time.
  -- ============================================
  -- Convert UUID to bigint for advisory lock (use hashtext for deterministic conversion)
  v_lock_key := hashtext(v_session.job_item_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- ============================================
  -- WIP PATH: Full balance tracking
  -- ============================================

  v_delta_good := p_total_good - COALESCE(v_session.total_good, 0);
  v_delta_scrap := p_total_scrap - COALESCE(v_session.total_scrap, 0);

  -- Get current step's WIP balance (with lock)
  SELECT * INTO v_wip_balance
  FROM public.wip_balances
  WHERE job_item_id = v_session.job_item_id
    AND job_item_station_id = v_session.job_item_station_id
  FOR UPDATE;

  IF v_wip_balance IS NULL THEN
    v_result.error_code := 'WIP_BALANCE_NOT_FOUND';
    RETURN v_result;
  END IF;

  -- ============================================
  -- GOOD PRODUCTS: INCREASE PATH (delta_good > 0)
  -- ============================================
  IF v_delta_good > 0 THEN
    -- Find upstream step if this isn't the first position
    IF v_step_info.position > 1 THEN
      SELECT jis.*, wb.id as wip_balance_id, wb.good_available
      INTO v_upstream_step
      FROM public.job_item_stations jis
      JOIN public.wip_balances wb ON wb.job_item_station_id = jis.id
      WHERE jis.job_item_id = v_session.job_item_id
        AND jis.position = v_step_info.position - 1
      FOR UPDATE OF wb;

      IF v_upstream_step IS NOT NULL AND v_upstream_step.good_available > 0 THEN
        v_pull_amount := LEAST(v_delta_good, v_upstream_step.good_available);

        UPDATE public.wip_balances
        SET good_available = good_available - v_pull_amount
        WHERE id = v_upstream_step.wip_balance_id;

        INSERT INTO public.wip_consumptions (
          job_item_id,
          consuming_session_id,
          from_job_item_station_id,
          good_used,
          is_scrap
        ) VALUES (
          v_session.job_item_id,
          p_session_id,
          v_upstream_step.id,
          v_pull_amount,
          FALSE
        );
      END IF;
    END IF;

    UPDATE public.wip_balances
    SET good_available = good_available + v_delta_good
    WHERE id = v_wip_balance.id;

    IF v_step_info.is_terminal THEN
      UPDATE public.job_item_progress
      SET completed_good = completed_good + v_delta_good
      WHERE job_item_id = v_session.job_item_id;
    END IF;

  -- ============================================
  -- GOOD PRODUCTS: DECREASE PATH (delta_good < 0)
  -- ============================================
  ELSIF v_delta_good < 0 THEN
    v_reduce_remaining := ABS(v_delta_good);

    IF v_wip_balance.good_available < v_reduce_remaining THEN
      v_result.error_code := 'WIP_DOWNSTREAM_CONSUMED';
      v_result.total_good := v_session.total_good;
      v_result.total_scrap := v_session.total_scrap;
      RETURN v_result;
    END IF;

    SELECT COALESCE(SUM(good_used), 0) INTO v_pulled_total
    FROM public.wip_consumptions
    WHERE consuming_session_id = p_session_id
      AND is_scrap = FALSE;

    v_originated_before := COALESCE(v_session.total_good, 0) - v_pulled_total;

    UPDATE public.wip_balances
    SET good_available = good_available - v_reduce_remaining
    WHERE id = v_wip_balance.id;

    IF v_step_info.is_terminal THEN
      UPDATE public.job_item_progress
      SET completed_good = completed_good - v_reduce_remaining
      WHERE job_item_id = v_session.job_item_id;
    END IF;

    v_originated_reduce := LEAST(v_reduce_remaining, v_originated_before);
    v_pulled_reduce := v_reduce_remaining - v_originated_reduce;

    IF v_pulled_reduce > 0 THEN
      FOR v_consumption IN
        SELECT wc.*, jis.id as upstream_jis_id
        FROM public.wip_consumptions wc
        JOIN public.job_item_stations jis ON jis.id = wc.from_job_item_station_id
        WHERE wc.consuming_session_id = p_session_id
          AND wc.is_scrap = FALSE
        ORDER BY wc.created_at DESC
        FOR UPDATE OF wc
      LOOP
        EXIT WHEN v_pulled_reduce <= 0;

        v_return_amount := LEAST(v_consumption.good_used, v_pulled_reduce);

        UPDATE public.wip_balances
        SET good_available = good_available + v_return_amount
        WHERE job_item_station_id = v_consumption.upstream_jis_id
          AND job_item_id = v_session.job_item_id;

        IF v_return_amount = v_consumption.good_used THEN
          DELETE FROM public.wip_consumptions WHERE id = v_consumption.id;
        ELSE
          UPDATE public.wip_consumptions
          SET good_used = good_used - v_return_amount
          WHERE id = v_consumption.id;
        END IF;

        v_pulled_reduce := v_pulled_reduce - v_return_amount;
      END LOOP;
    END IF;
  END IF;

  -- ============================================
  -- SCRAP: INCREASE PATH (delta_scrap > 0)
  -- ============================================
  IF v_delta_scrap > 0 THEN
    IF v_step_info.position > 1 THEN
      SELECT jis.*, wb.id as wip_balance_id, wb.good_available
      INTO v_upstream_step
      FROM public.job_item_stations jis
      JOIN public.wip_balances wb ON wb.job_item_station_id = jis.id
      WHERE jis.job_item_id = v_session.job_item_id
        AND jis.position = v_step_info.position - 1
      FOR UPDATE OF wb;

      IF v_upstream_step IS NOT NULL AND v_upstream_step.good_available > 0 THEN
        v_pull_amount := LEAST(v_delta_scrap, v_upstream_step.good_available);

        UPDATE public.wip_balances
        SET good_available = good_available - v_pull_amount
        WHERE id = v_upstream_step.wip_balance_id;

        INSERT INTO public.wip_consumptions (
          job_item_id,
          consuming_session_id,
          from_job_item_station_id,
          good_used,
          is_scrap
        ) VALUES (
          v_session.job_item_id,
          p_session_id,
          v_upstream_step.id,
          v_pull_amount,
          TRUE
        );
      END IF;
    END IF;

  -- ============================================
  -- SCRAP: DECREASE PATH (delta_scrap < 0)
  -- ============================================
  ELSIF v_delta_scrap < 0 THEN
    v_reduce_remaining := ABS(v_delta_scrap);

    SELECT COALESCE(SUM(good_used), 0) INTO v_pulled_total
    FROM public.wip_consumptions
    WHERE consuming_session_id = p_session_id
      AND is_scrap = TRUE;

    v_originated_before := COALESCE(v_session.total_scrap, 0) - v_pulled_total;

    v_originated_reduce := LEAST(v_reduce_remaining, v_originated_before);
    v_pulled_reduce := v_reduce_remaining - v_originated_reduce;

    IF v_pulled_reduce > 0 THEN
      FOR v_consumption IN
        SELECT wc.*, jis.id as upstream_jis_id
        FROM public.wip_consumptions wc
        JOIN public.job_item_stations jis ON jis.id = wc.from_job_item_station_id
        WHERE wc.consuming_session_id = p_session_id
          AND wc.is_scrap = TRUE
        ORDER BY wc.created_at DESC
        FOR UPDATE OF wc
      LOOP
        EXIT WHEN v_pulled_reduce <= 0;

        v_return_amount := LEAST(v_consumption.good_used, v_pulled_reduce);

        UPDATE public.wip_balances
        SET good_available = good_available + v_return_amount
        WHERE job_item_station_id = v_consumption.upstream_jis_id
          AND job_item_id = v_session.job_item_id;

        IF v_return_amount = v_consumption.good_used THEN
          DELETE FROM public.wip_consumptions WHERE id = v_consumption.id;
        ELSE
          UPDATE public.wip_consumptions
          SET good_used = good_used - v_return_amount
          WHERE id = v_consumption.id;
        END IF;

        v_pulled_reduce := v_pulled_reduce - v_return_amount;
      END LOOP;
    END IF;
  END IF;

  -- ============================================
  -- Update session totals
  -- ============================================
  UPDATE public.sessions
  SET total_good = p_total_good, total_scrap = p_total_scrap
  WHERE id = p_session_id;

  v_result.success := true;
  v_result.total_good := p_total_good;
  v_result.total_scrap := p_total_scrap;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Documentation
COMMENT ON FUNCTION public.update_session_quantities_atomic_v2 IS 'Atomically updates session quantities with WIP balance management. Uses advisory locks to prevent deadlocks between concurrent sessions on the same production line.';
