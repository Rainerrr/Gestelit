-- Cleanup legacy malfunctions table and columns
-- This migration removes all legacy elements after successful migration to unified reports table

-- 1. Drop the malfunction state machine trigger (on malfunctions table)
DROP TRIGGER IF EXISTS malfunction_state_transition_check ON public.malfunctions;
DROP FUNCTION IF EXISTS validate_malfunction_transition();

-- 2. Drop RLS policies on malfunctions table
DROP POLICY IF EXISTS "Anyone can create malfunctions" ON public.malfunctions;
DROP POLICY IF EXISTS "Anyone can read malfunctions" ON public.malfunctions;
DROP POLICY IF EXISTS "Service role can manage malfunctions" ON public.malfunctions;

-- 3. Drop the malfunctions table (data already migrated to reports)
DROP TABLE IF EXISTS public.malfunctions CASCADE;

-- 4. Remove requires_malfunction_report column from status_definitions
-- (replaced by report_type column)
ALTER TABLE public.status_definitions
  DROP COLUMN IF EXISTS requires_malfunction_report;

-- 5. Remove is_stoppage column from status_definitions if it still exists
-- (replaced by machine_state column)
ALTER TABLE public.status_definitions
  DROP COLUMN IF EXISTS is_stoppage;

-- 6. Clean up the legacy status_event_state enum if it exists
-- First remove the old 'status' column from status_events if it exists
ALTER TABLE public.status_events
  DROP COLUMN IF EXISTS status;

-- Drop the old enum type if no columns reference it
DO $$
BEGIN
  -- Check if the enum exists and is not referenced
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_event_state') THEN
    -- Only drop if no columns reference it
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE udt_name = 'status_event_state'
    ) THEN
      DROP TYPE IF EXISTS public.status_event_state;
    END IF;
  END IF;
END $$;

-- 7. Rename malfunction_id to report_id in status_events for clarity
-- First check if the column exists and hasn't been renamed yet
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'status_events'
    AND column_name = 'malfunction_id'
  ) THEN
    ALTER TABLE public.status_events
      RENAME COLUMN malfunction_id TO report_id;

    -- Update the comment
    COMMENT ON COLUMN public.status_events.report_id IS 'References reports.id for linked malfunction/general reports';
  END IF;
END $$;

-- 8. Add foreign key constraint if not exists (report_id -> reports.id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'status_events_report_id_fkey'
    AND table_name = 'status_events'
  ) THEN
    -- First try to add the constraint
    BEGIN
      ALTER TABLE public.status_events
        ADD CONSTRAINT status_events_report_id_fkey
        FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE SET NULL;
    EXCEPTION
      WHEN undefined_column THEN
        NULL; -- Column doesn't exist yet, skip
    END;
  END IF;
END $$;
