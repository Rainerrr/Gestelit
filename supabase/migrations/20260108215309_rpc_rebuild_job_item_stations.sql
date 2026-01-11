-- Migration: Create rebuild_job_item_stations() RPC function
-- Part of: Production Lines + Job Items + WIP feature (Phase 2.1)
--
-- This function is called when a job_item is created or needs reconfiguration.
-- It idempotently sets up:
--   1. job_item_stations (frozen snapshot of production steps)
--   2. wip_balances (one per step)
--   3. job_item_progress (completed count tracking)

CREATE OR REPLACE FUNCTION public.rebuild_job_item_stations(p_job_item_id UUID)
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

  -- Delete existing job_item_stations (CASCADE will handle wip_balances)
  -- This makes the function idempotent
  DELETE FROM public.job_item_stations WHERE job_item_id = p_job_item_id;

  IF v_job_item.kind = 'station' THEN
    -- Single-station job item: Create one step
    INSERT INTO public.job_item_stations (job_item_id, station_id, position, is_terminal)
    VALUES (p_job_item_id, v_job_item.station_id, 1, true)
    RETURNING id INTO v_jis_id;

    -- Create wip_balance for this step
    INSERT INTO public.wip_balances (job_item_id, job_item_station_id)
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

    -- Insert job_item_stations from production_line_stations
    -- Mark the last position as terminal
    INSERT INTO public.job_item_stations (job_item_id, station_id, position, is_terminal)
    SELECT
      p_job_item_id,
      pls.station_id,
      pls.position,
      (pls.position = v_max_position)  -- is_terminal = true for last station
    FROM public.production_line_stations pls
    WHERE pls.production_line_id = v_job_item.production_line_id
    ORDER BY pls.position;

    -- Create wip_balances for each step
    INSERT INTO public.wip_balances (job_item_id, job_item_station_id)
    SELECT p_job_item_id, jis.id
    FROM public.job_item_stations jis
    WHERE jis.job_item_id = p_job_item_id;
  END IF;

  -- Upsert job_item_progress (ensure row exists)
  INSERT INTO public.job_item_progress (job_item_id, completed_good)
  VALUES (p_job_item_id, 0)
  ON CONFLICT (job_item_id) DO NOTHING;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.rebuild_job_item_stations(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_job_item_stations(UUID) TO service_role;

-- Documentation
COMMENT ON FUNCTION public.rebuild_job_item_stations IS 'Idempotently sets up job_item_stations, wip_balances, and job_item_progress for a job item';
