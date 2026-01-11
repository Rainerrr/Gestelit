-- Migration: Add scrap WIP consumption tracking
--
-- Scrap behavior:
--   - When scrap increases: consume from upstream (like good), but do NOT add to current WIP
--   - When scrap decreases: return to upstream (LIFO reversal, like good)
--   - Scrap products are "destroyed" - they don't flow downstream

-- Add is_scrap column to wip_consumptions to distinguish scrap vs good consumption
ALTER TABLE public.wip_consumptions
ADD COLUMN IF NOT EXISTS is_scrap BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for scrap-specific queries
CREATE INDEX IF NOT EXISTS idx_wip_consumptions_is_scrap
ON public.wip_consumptions(consuming_session_id, is_scrap);

-- Update the RPC function to handle scrap WIP properly
CREATE OR REPLACE FUNCTION public.update_session_quantities_atomic_v2(
  p_session_id UUID,
  p_total_good INTEGER,
  p_total_scrap INTEGER
) RETURNS session_update_result AS $$
DECLARE
  v_session RECORD;
  v_current_step RECORD;
  v_upstream_step RECORD;
  v_wip_balance RECORD;
  v_upstream_balance RECORD;
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
BEGIN
  -- Initialize result
  v_result.success := false;
  v_result.error_code := NULL;
  v_result.session_id := p_session_id;

  -- Get session with row lock to prevent concurrent updates
  SELECT s.*, jis.position, jis.is_terminal
  INTO v_session
  FROM public.sessions s
  LEFT JOIN public.job_item_stations jis ON jis.id = s.job_item_station_id
  WHERE s.id = p_session_id
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
    IF v_session.position > 1 THEN
      SELECT jis.*, wb.id as wip_balance_id, wb.good_available
      INTO v_upstream_step
      FROM public.job_item_stations jis
      JOIN public.wip_balances wb ON wb.job_item_station_id = jis.id
      WHERE jis.job_item_id = v_session.job_item_id
        AND jis.position = v_session.position - 1
      FOR UPDATE OF wb;  -- Lock upstream balance

      IF v_upstream_step IS NOT NULL AND v_upstream_step.good_available > 0 THEN
        -- Pull from upstream (min of delta and available)
        v_pull_amount := LEAST(v_delta_good, v_upstream_step.good_available);

        -- Decrement upstream balance
        UPDATE public.wip_balances
        SET good_available = good_available - v_pull_amount
        WHERE id = v_upstream_step.wip_balance_id;

        -- Record the pull in ledger (is_scrap = false)
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

    -- Increment current step's balance (good products flow to next station)
    UPDATE public.wip_balances
    SET good_available = good_available + v_delta_good
    WHERE id = v_wip_balance.id;

    -- If terminal station, increment completed_good
    IF v_session.is_terminal THEN
      UPDATE public.job_item_progress
      SET completed_good = completed_good + v_delta_good
      WHERE job_item_id = v_session.job_item_id;
    END IF;

  -- ============================================
  -- GOOD PRODUCTS: DECREASE PATH (delta_good < 0)
  -- ============================================
  ELSIF v_delta_good < 0 THEN
    v_reduce_remaining := ABS(v_delta_good);

    -- Check if current step has enough balance
    IF v_wip_balance.good_available < v_reduce_remaining THEN
      v_result.error_code := 'WIP_DOWNSTREAM_CONSUMED';
      v_result.total_good := v_session.total_good;
      v_result.total_scrap := v_session.total_scrap;
      RETURN v_result;
    END IF;

    -- Calculate how much was originated vs pulled by this session (good only)
    SELECT COALESCE(SUM(good_used), 0) INTO v_pulled_total
    FROM public.wip_consumptions
    WHERE consuming_session_id = p_session_id
      AND is_scrap = FALSE;

    v_originated_before := COALESCE(v_session.total_good, 0) - v_pulled_total;

    -- Decrement current step balance
    UPDATE public.wip_balances
    SET good_available = good_available - v_reduce_remaining
    WHERE id = v_wip_balance.id;

    -- If terminal, decrement completed_good
    IF v_session.is_terminal THEN
      UPDATE public.job_item_progress
      SET completed_good = completed_good - v_reduce_remaining
      WHERE job_item_id = v_session.job_item_id;
    END IF;

    -- Determine how much to reduce from originated vs pulled
    v_originated_reduce := LEAST(v_reduce_remaining, v_originated_before);
    v_pulled_reduce := v_reduce_remaining - v_originated_reduce;

    -- If we need to reverse pulls, do LIFO (newest first) for good products only
    IF v_pulled_reduce > 0 THEN
      FOR v_consumption IN
        SELECT wc.*, jis.id as upstream_jis_id
        FROM public.wip_consumptions wc
        JOIN public.job_item_stations jis ON jis.id = wc.from_job_item_station_id
        WHERE wc.consuming_session_id = p_session_id
          AND wc.is_scrap = FALSE
        ORDER BY wc.created_at DESC  -- LIFO
        FOR UPDATE
      LOOP
        EXIT WHEN v_pulled_reduce <= 0;

        v_return_amount := LEAST(v_consumption.good_used, v_pulled_reduce);

        -- Return to upstream balance
        UPDATE public.wip_balances
        SET good_available = good_available + v_return_amount
        WHERE job_item_station_id = v_consumption.upstream_jis_id
          AND job_item_id = v_session.job_item_id;

        IF v_return_amount = v_consumption.good_used THEN
          -- Full reversal: delete the ledger entry
          DELETE FROM public.wip_consumptions WHERE id = v_consumption.id;
        ELSE
          -- Partial reversal: reduce the ledger entry
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
  -- Consumes from upstream but does NOT add to current WIP
  -- ============================================
  IF v_delta_scrap > 0 THEN
    -- Find upstream step if this isn't the first position
    IF v_session.position > 1 THEN
      SELECT jis.*, wb.id as wip_balance_id, wb.good_available
      INTO v_upstream_step
      FROM public.job_item_stations jis
      JOIN public.wip_balances wb ON wb.job_item_station_id = jis.id
      WHERE jis.job_item_id = v_session.job_item_id
        AND jis.position = v_session.position - 1
      FOR UPDATE OF wb;  -- Lock upstream balance

      IF v_upstream_step IS NOT NULL AND v_upstream_step.good_available > 0 THEN
        -- Pull from upstream (min of delta and available)
        v_pull_amount := LEAST(v_delta_scrap, v_upstream_step.good_available);

        -- Decrement upstream balance
        UPDATE public.wip_balances
        SET good_available = good_available - v_pull_amount
        WHERE id = v_upstream_step.wip_balance_id;

        -- Record the pull in ledger (is_scrap = true)
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

    -- NOTE: Scrap does NOT increment current step's balance
    -- The product is destroyed, not passed downstream

  -- ============================================
  -- SCRAP: DECREASE PATH (delta_scrap < 0)
  -- Returns to upstream (LIFO reversal)
  -- ============================================
  ELSIF v_delta_scrap < 0 THEN
    v_reduce_remaining := ABS(v_delta_scrap);

    -- Calculate how much was pulled as scrap by this session
    SELECT COALESCE(SUM(good_used), 0) INTO v_pulled_total
    FROM public.wip_consumptions
    WHERE consuming_session_id = p_session_id
      AND is_scrap = TRUE;

    -- Can only return what was pulled as scrap
    v_pulled_reduce := LEAST(v_reduce_remaining, v_pulled_total);

    -- Reverse scrap pulls LIFO (newest first)
    IF v_pulled_reduce > 0 THEN
      FOR v_consumption IN
        SELECT wc.*, jis.id as upstream_jis_id
        FROM public.wip_consumptions wc
        JOIN public.job_item_stations jis ON jis.id = wc.from_job_item_station_id
        WHERE wc.consuming_session_id = p_session_id
          AND wc.is_scrap = TRUE
        ORDER BY wc.created_at DESC  -- LIFO
        FOR UPDATE
      LOOP
        EXIT WHEN v_pulled_reduce <= 0;

        v_return_amount := LEAST(v_consumption.good_used, v_pulled_reduce);

        -- Return to upstream balance
        UPDATE public.wip_balances
        SET good_available = good_available + v_return_amount
        WHERE job_item_station_id = v_consumption.upstream_jis_id
          AND job_item_id = v_session.job_item_id;

        IF v_return_amount = v_consumption.good_used THEN
          -- Full reversal: delete the ledger entry
          DELETE FROM public.wip_consumptions WHERE id = v_consumption.id;
        ELSE
          -- Partial reversal: reduce the ledger entry
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
COMMENT ON FUNCTION public.update_session_quantities_atomic_v2 IS 'Atomically updates session quantities with WIP balance management. Good products flow downstream. Scrap consumes from upstream but does not pass to downstream. Returns error_code WIP_DOWNSTREAM_CONSUMED if reduction blocked.';
