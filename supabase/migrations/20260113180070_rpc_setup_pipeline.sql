-- Migration: Create setup_job_item_pipeline() RPC function
-- Part of: Job System Overhaul (Phase 1G)
-- Purpose: Set up job item pipeline from an array of station IDs
--
-- This replaces the old rebuild_job_item_stations() approach that depended on
-- production_lines. Now pipelines are defined directly by station arrays.

CREATE OR REPLACE FUNCTION public.setup_job_item_pipeline(
  p_job_item_id UUID,
  p_station_ids UUID[],
  p_preset_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_job_item RECORD;
  v_station_count INTEGER;
  v_position INTEGER;
  v_station_id UUID;
  v_jis_id UUID;
BEGIN
  -- Validate inputs
  IF p_station_ids IS NULL OR array_length(p_station_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Station IDs array cannot be empty';
  END IF;

  v_station_count := array_length(p_station_ids, 1);

  -- Get job item and verify it exists
  SELECT * INTO v_job_item FROM public.job_items WHERE id = p_job_item_id;

  IF v_job_item IS NULL THEN
    RAISE EXCEPTION 'Job item not found: %', p_job_item_id;
  END IF;

  -- Check if pipeline is locked (production already started)
  IF v_job_item.is_pipeline_locked THEN
    RAISE EXCEPTION 'Cannot modify pipeline for job item % - production has already started', p_job_item_id;
  END IF;

  -- Verify all station IDs exist and are active
  IF EXISTS (
    SELECT 1 FROM unnest(p_station_ids) AS sid
    WHERE NOT EXISTS (
      SELECT 1 FROM public.stations WHERE id = sid AND is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'One or more station IDs are invalid or inactive';
  END IF;

  -- Delete existing job_item_steps (CASCADE will handle wip_balances via FK)
  DELETE FROM public.job_item_steps WHERE job_item_id = p_job_item_id;

  -- Insert job_item_steps from station array
  -- Last station in array is marked as terminal
  v_position := 0;
  FOREACH v_station_id IN ARRAY p_station_ids
  LOOP
    v_position := v_position + 1;

    INSERT INTO public.job_item_steps (
      job_item_id,
      station_id,
      position,
      is_terminal
    )
    VALUES (
      p_job_item_id,
      v_station_id,
      v_position,
      (v_position = v_station_count)  -- is_terminal = true for last station
    )
    RETURNING id INTO v_jis_id;

    -- Create wip_balance for this step
    INSERT INTO public.wip_balances (job_item_id, job_item_step_id)
    VALUES (p_job_item_id, v_jis_id);
  END LOOP;

  -- Update job_item with preset reference if provided
  IF p_preset_id IS NOT NULL THEN
    UPDATE public.job_items
    SET pipeline_preset_id = p_preset_id
    WHERE id = p_job_item_id;
  END IF;

  -- Upsert job_item_progress (ensure row exists)
  INSERT INTO public.job_item_progress (job_item_id, completed_good)
  VALUES (p_job_item_id, 0)
  ON CONFLICT (job_item_id) DO NOTHING;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.setup_job_item_pipeline(UUID, UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.setup_job_item_pipeline(UUID, UUID[], UUID) TO service_role;

-- Documentation
COMMENT ON FUNCTION public.setup_job_item_pipeline IS
  'Sets up job_item_steps, wip_balances, and job_item_progress from a station ID array. Fails if pipeline is locked.';
