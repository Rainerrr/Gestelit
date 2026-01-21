-- Migration: Drop deprecated quantity columns
-- Part of: Database Cleanup - Remove legacy quantity columns
-- Purpose: Final cleanup after all code has been updated
--
-- IMPORTANT: Run this migration ONLY after all TypeScript code has been
-- updated and deployed. The derived totals come from:
-- - sessions totals: SUM(status_events.quantity_good/scrap)
-- - job planned_quantity: SUM(job_items.planned_quantity)
--
-- Columns being dropped:
-- - sessions.total_good (derived from status_events)
-- - sessions.total_scrap (derived from status_events)
-- - jobs.planned_quantity (derived from job_items)
--
-- Functions being dropped (replaced by v4):
-- - update_session_quantities_atomic_v2
-- - update_session_quantities_atomic_v3

-- ============================================
-- Step 1: Archive existing data for audit trail
-- ============================================
CREATE TABLE IF NOT EXISTS public._archive_dropped_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archived_at TIMESTAMPTZ DEFAULT now(),
  table_name TEXT NOT NULL,
  migration_name TEXT NOT NULL,
  column_data JSONB NOT NULL
);

-- Archive sessions.total_good/total_scrap data
INSERT INTO public._archive_dropped_columns (table_name, migration_name, column_data)
SELECT
  'sessions',
  '20260115000060_drop_deprecated_columns',
  jsonb_agg(jsonb_build_object(
    'id', id,
    'total_good', total_good,
    'total_scrap', total_scrap,
    'archived_at', now()
  ))
FROM public.sessions
WHERE total_good > 0 OR total_scrap > 0;

-- Archive jobs.planned_quantity data
INSERT INTO public._archive_dropped_columns (table_name, migration_name, column_data)
SELECT
  'jobs',
  '20260115000060_drop_deprecated_columns',
  jsonb_agg(jsonb_build_object(
    'id', id,
    'job_number', job_number,
    'planned_quantity', planned_quantity,
    'archived_at', now()
  ))
FROM public.jobs
WHERE planned_quantity IS NOT NULL;

-- ============================================
-- Step 2: Drop columns
-- ============================================
ALTER TABLE public.sessions DROP COLUMN IF EXISTS total_good;
ALTER TABLE public.sessions DROP COLUMN IF EXISTS total_scrap;
ALTER TABLE public.jobs DROP COLUMN IF EXISTS planned_quantity;

-- ============================================
-- Step 3: Drop deprecated RPC functions
-- ============================================
DROP FUNCTION IF EXISTS public.update_session_quantities_atomic_v2(UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.update_session_quantities_atomic_v3(UUID, INTEGER, INTEGER);

-- ============================================
-- Step 4: Grant access to archive table
-- ============================================
GRANT SELECT ON public._archive_dropped_columns TO service_role;

COMMENT ON TABLE public._archive_dropped_columns IS
  'Archive of data from dropped columns during schema cleanup migrations. For audit purposes only.';
