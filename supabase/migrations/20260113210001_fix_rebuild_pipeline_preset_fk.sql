-- Migration: Fix rebuild_job_item_steps() to use correct FK column name
-- Issue: RPC was using 'preset_id' but the column is 'pipeline_preset_id'
--
-- This fixes the pipeline job item creation which was failing because
-- the query used the wrong column name to look up pipeline_preset_steps.

CREATE OR REPLACE FUNCTION public.rebuild_job_item_steps(p_job_item_id UUID)
RETURNS VOID AS $$
DECLARE
  v_job_item RECORD;
  v_max_position INTEGER;
  v_jis_id UUID;
BEGIN
  -- Get job item details
  SELECT * INTO v_job_item FROM public.job_items WHERE id = p_job_item_id;

  IF v_job_item IS NULL THEN
    RAISE EXCEPTION 'Job item not found: %', p_job_item_id;
  END IF;

  -- Delete existing job_item_steps (CASCADE will handle wip_balances)
  -- This makes the function idempotent
  DELETE FROM public.job_item_steps WHERE job_item_id = p_job_item_id;

  IF v_job_item.kind = 'station' THEN
    -- Single-station job item: Create one step
    INSERT INTO public.job_item_steps (job_item_id, station_id, position, is_terminal)
    VALUES (p_job_item_id, v_job_item.station_id, 1, true)
    RETURNING id INTO v_jis_id;

    -- Create wip_balance for this step
    INSERT INTO public.wip_balances (job_item_id, job_item_step_id)
    VALUES (p_job_item_id, v_jis_id);

  ELSIF v_job_item.kind = 'line' THEN
    -- Production line job item: Expand from production_line_stations
    -- Get max position for determining terminal station
    SELECT MAX(position) INTO v_max_position
    FROM public.production_line_stations
    WHERE production_line_id = v_job_item.production_line_id;

    IF v_max_position IS NULL THEN
      RAISE EXCEPTION 'Production line % has no stations', v_job_item.production_line_id;
    END IF;

    -- Insert job_item_steps from production_line_stations
    -- Mark the last position as terminal
    INSERT INTO public.job_item_steps (job_item_id, station_id, position, is_terminal)
    SELECT
      p_job_item_id,
      pls.station_id,
      pls.position,
      (pls.position = v_max_position)  -- is_terminal = true for last station
    FROM public.production_line_stations pls
    WHERE pls.production_line_id = v_job_item.production_line_id
    ORDER BY pls.position;

    -- Create wip_balances for each step
    INSERT INTO public.wip_balances (job_item_id, job_item_step_id)
    SELECT p_job_item_id, jis.id
    FROM public.job_item_steps jis
    WHERE jis.job_item_id = p_job_item_id;

  ELSIF v_job_item.kind = 'pipeline' THEN
    -- Pipeline preset job item: Expand from pipeline_preset_steps
    -- Get max position for determining terminal station
    -- FIX: Use correct column name 'pipeline_preset_id' (not 'preset_id')
    SELECT MAX(position) INTO v_max_position
    FROM public.pipeline_preset_steps
    WHERE pipeline_preset_id = v_job_item.pipeline_preset_id;

    IF v_max_position IS NULL THEN
      RAISE EXCEPTION 'Pipeline preset % has no steps', v_job_item.pipeline_preset_id;
    END IF;

    -- Insert job_item_steps from pipeline_preset_steps
    -- Mark the last position as terminal
    -- FIX: Use correct column name 'pipeline_preset_id' (not 'preset_id')
    INSERT INTO public.job_item_steps (job_item_id, station_id, position, is_terminal)
    SELECT
      p_job_item_id,
      pps.station_id,
      pps.position,
      (pps.position = v_max_position)  -- is_terminal = true for last station
    FROM public.pipeline_preset_steps pps
    WHERE pps.pipeline_preset_id = v_job_item.pipeline_preset_id
    ORDER BY pps.position;

    -- Create wip_balances for each step
    INSERT INTO public.wip_balances (job_item_id, job_item_step_id)
    SELECT p_job_item_id, jis.id
    FROM public.job_item_steps jis
    WHERE jis.job_item_id = p_job_item_id;

  ELSE
    RAISE EXCEPTION 'Unknown job item kind: %', v_job_item.kind;
  END IF;

  -- Upsert job_item_progress (ensure row exists)
  INSERT INTO public.job_item_progress (job_item_id, completed_good)
  VALUES (p_job_item_id, 0)
  ON CONFLICT (job_item_id) DO NOTHING;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Documentation
COMMENT ON FUNCTION public.rebuild_job_item_steps IS 'Idempotently sets up job_item_steps, wip_balances, and job_item_progress for a job item. Supports station, line, and pipeline kinds.';
