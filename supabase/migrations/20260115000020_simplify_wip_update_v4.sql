-- Migration: Simplified WIP update function v4 (additive-only)
-- Part of: Database Cleanup - Remove legacy quantity columns
-- Purpose: Remove DECREASE/correction path, remove LIFO reversal logic
--
-- Changes from v3:
-- - Signature changed: takes p_delta_good/p_delta_scrap (increments, not totals)
-- - REMOVED: Entire DECREASE path for good products (lines 155-215 in v3)
-- - REMOVED: Entire DECREASE path for scrap (lines 256-299 in v3)
-- - REMOVED: sessions.total_good/scrap update (no longer tracked)
-- - KEPT: Partial pull logic with LEAST() - already handles origination
-- - KEPT: wip_consumptions INSERT for analytics tracking

CREATE OR REPLACE FUNCTION public.update_session_quantities_atomic_v4(
  p_session_id UUID,
  p_delta_good INTEGER,  -- Increment (not total)
  p_delta_scrap INTEGER  -- Increment (not total)
) RETURNS session_update_result AS $$
DECLARE
  v_session RECORD;
  v_step_info RECORD;
  v_upstream_step RECORD;
  v_wip_balance RECORD;
  v_pull_amount INTEGER;
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
    -- Legacy sessions: No WIP tracking, just succeed
    -- (sessions.total_good/scrap columns no longer exist)
    v_result.success := true;
    v_result.total_good := p_delta_good;
    v_result.total_scrap := p_delta_scrap;
    RETURN v_result;
  END IF;

  -- ============================================
  -- STEP 2: Get job_item_step info (no lock, read-only)
  -- ============================================
  SELECT position, is_terminal INTO v_step_info
  FROM public.job_item_steps
  WHERE id = v_session.job_item_step_id;

  IF v_step_info IS NULL THEN
    v_result.error_code := 'JOB_ITEM_STEP_NOT_FOUND';
    RETURN v_result;
  END IF;

  -- ============================================
  -- STEP 3: Advisory lock on job_item to serialize production line updates
  -- ============================================
  v_lock_key := hashtext(v_session.job_item_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- ============================================
  -- WIP PATH: Full balance tracking (additive only)
  -- ============================================

  -- Get current step's WIP balance (with lock)
  SELECT * INTO v_wip_balance
  FROM public.wip_balances
  WHERE job_item_id = v_session.job_item_id
    AND job_item_step_id = v_session.job_item_step_id
  FOR UPDATE;

  IF v_wip_balance IS NULL THEN
    v_result.error_code := 'WIP_BALANCE_NOT_FOUND';
    RETURN v_result;
  END IF;

  -- ============================================
  -- GOOD PRODUCTS: INCREASE PATH ONLY (delta_good > 0)
  -- Partial pull logic with LEAST() - handles origination automatically
  -- ============================================
  IF p_delta_good > 0 THEN
    -- Find upstream step if this isn't the first position
    IF v_step_info.position > 1 THEN
      SELECT jis.*, wb.id as wip_balance_id, wb.good_available
      INTO v_upstream_step
      FROM public.job_item_steps jis
      JOIN public.wip_balances wb ON wb.job_item_step_id = jis.id
      WHERE jis.job_item_id = v_session.job_item_id
        AND jis.position = v_step_info.position - 1
      FOR UPDATE OF wb;

      IF v_upstream_step IS NOT NULL AND v_upstream_step.good_available > 0 THEN
        -- PARTIAL PULL: Take only what's available from upstream
        v_pull_amount := LEAST(p_delta_good, v_upstream_step.good_available);

        UPDATE public.wip_balances
        SET good_available = good_available - v_pull_amount
        WHERE id = v_upstream_step.wip_balance_id;

        -- Record consumption for analytics (no LIFO reversal needed anymore)
        INSERT INTO public.wip_consumptions (
          job_item_id,
          consuming_session_id,
          from_job_item_step_id,
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
      -- If upstream has insufficient WIP, the gap becomes "originated" inventory
      -- No blocking or warning - this is by design
    END IF;

    -- Add full delta to current step's balance
    -- (originated = delta - pulled, calculated residually for analytics)
    UPDATE public.wip_balances
    SET good_available = good_available + p_delta_good
    WHERE id = v_wip_balance.id;

    -- Terminal station: update completed progress
    IF v_step_info.is_terminal THEN
      UPDATE public.job_item_progress
      SET completed_good = completed_good + p_delta_good
      WHERE job_item_id = v_session.job_item_id;
    END IF;
  END IF;

  -- ============================================
  -- SCRAP: INCREASE PATH ONLY (delta_scrap > 0)
  -- Same partial pull logic, but scrap does NOT flow downstream
  -- ============================================
  IF p_delta_scrap > 0 THEN
    IF v_step_info.position > 1 THEN
      SELECT jis.*, wb.id as wip_balance_id, wb.good_available
      INTO v_upstream_step
      FROM public.job_item_steps jis
      JOIN public.wip_balances wb ON wb.job_item_step_id = jis.id
      WHERE jis.job_item_id = v_session.job_item_id
        AND jis.position = v_step_info.position - 1
      FOR UPDATE OF wb;

      IF v_upstream_step IS NOT NULL AND v_upstream_step.good_available > 0 THEN
        v_pull_amount := LEAST(p_delta_scrap, v_upstream_step.good_available);

        UPDATE public.wip_balances
        SET good_available = good_available - v_pull_amount
        WHERE id = v_upstream_step.wip_balance_id;

        INSERT INTO public.wip_consumptions (
          job_item_id,
          consuming_session_id,
          from_job_item_step_id,
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
    -- NOTE: Scrap does NOT increment current step's balance (product destroyed)
  END IF;

  -- ============================================
  -- NO session totals update - they are derived from status_events
  -- ============================================

  v_result.success := true;
  v_result.total_good := p_delta_good;
  v_result.total_scrap := p_delta_scrap;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_session_quantities_atomic_v4(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_session_quantities_atomic_v4(UUID, INTEGER, INTEGER) TO service_role;

-- Documentation
COMMENT ON FUNCTION public.update_session_quantities_atomic_v4 IS
  'Simplified WIP update (v4): additive-only, no decrease/correction path, no LIFO reversal. Takes deltas (increments), not totals.';
