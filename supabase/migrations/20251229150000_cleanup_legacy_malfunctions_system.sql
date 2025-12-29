-- =====================================================================
-- Migration: Cleanup Legacy Malfunctions System
--
-- This migration:
-- 1. Renames status_events.malfunction_id to report_id
-- 2. Updates the atomic function to use report_id
-- 3. Removes legacy columns from status_definitions
-- 4. Drops the legacy malfunctions table and related objects
-- =====================================================================

-- Step 1: Drop the old FK constraint and rename column
ALTER TABLE public.status_events
  DROP CONSTRAINT IF EXISTS status_events_malfunction_id_fkey;

ALTER TABLE public.status_events
  RENAME COLUMN malfunction_id TO report_id;

-- Step 2: Add new FK constraint to reports table
ALTER TABLE public.status_events
  ADD CONSTRAINT status_events_report_id_fkey
  FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE SET NULL;

-- Step 3: Drop and recreate the atomic function with new parameter name
DROP FUNCTION IF EXISTS public.create_status_event_atomic(uuid,uuid,text,text,text,uuid);

CREATE FUNCTION public.create_status_event_atomic(
  p_session_id UUID,
  p_status_definition_id UUID,
  p_station_reason_id TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL,
  p_report_id UUID DEFAULT NULL
) RETURNS public.status_events
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    report_id
  ) VALUES (
    p_session_id,
    p_status_definition_id,
    p_station_reason_id,
    p_note,
    p_image_url,
    v_now,
    p_report_id
  ) RETURNING * INTO v_result;

  -- Mirror to sessions table (atomic within same transaction)
  UPDATE public.sessions
  SET
    current_status_id = p_status_definition_id,
    last_status_change_at = v_now
  WHERE id = p_session_id;

  RETURN v_result;
END;
$$;

-- Step 4: Drop legacy columns from status_definitions
ALTER TABLE public.status_definitions
  DROP COLUMN IF EXISTS requires_malfunction_report;

ALTER TABLE public.status_definitions
  DROP COLUMN IF EXISTS is_stoppage;

-- Step 5: Drop the legacy malfunctions table and related objects

-- First drop the trigger
DROP TRIGGER IF EXISTS malfunction_state_transition_check ON public.malfunctions;

-- Drop the trigger function
DROP FUNCTION IF EXISTS public.validate_malfunction_transition();

-- Drop RLS policies on malfunctions
DROP POLICY IF EXISTS "Allow service role full access to malfunctions" ON public.malfunctions;
DROP POLICY IF EXISTS "Allow authenticated read access to malfunctions" ON public.malfunctions;
DROP POLICY IF EXISTS "malfunctions_read_policy" ON public.malfunctions;
DROP POLICY IF EXISTS "malfunctions_write_policy" ON public.malfunctions;

-- Finally drop the malfunctions table
DROP TABLE IF EXISTS public.malfunctions;

-- Step 6: Ensure report_type column has proper NOT NULL constraint
ALTER TABLE public.status_definitions
  ALTER COLUMN report_type SET NOT NULL;

ALTER TABLE public.status_definitions
  ALTER COLUMN report_type SET DEFAULT 'none';
