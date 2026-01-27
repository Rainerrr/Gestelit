-- Migration: Fix per-step progress scoping
-- Problem: v_session_current_job_item_totals sums quantity_good across ALL pipeline steps
-- for a job_item_id, causing multi-step pipelines to show inflated progress.
-- Fix: Filter by job_item_step_id so each step's progress is isolated.

-- 1. Drop and recreate view (can't use CREATE OR REPLACE when changing columns)
DROP VIEW IF EXISTS public.v_session_current_job_item_totals;
CREATE VIEW public.v_session_current_job_item_totals AS
SELECT
  s.id AS session_id,
  s.job_item_id,
  s.job_item_step_id,
  COALESCE(SUM(se.quantity_good), 0)::INTEGER AS total_good,
  COALESCE(SUM(se.quantity_scrap), 0)::INTEGER AS total_scrap
FROM public.sessions s
LEFT JOIN public.status_events se
  ON se.session_id = s.id
  AND se.job_item_id = s.job_item_id
  AND se.job_item_step_id IS NOT DISTINCT FROM s.job_item_step_id
GROUP BY s.id, s.job_item_id, s.job_item_step_id;

-- Grant permissions
GRANT SELECT ON public.v_session_current_job_item_totals TO authenticated;
GRANT SELECT ON public.v_session_current_job_item_totals TO service_role;

COMMENT ON VIEW public.v_session_current_job_item_totals IS
  'Derives session totals from SUM(status_events.quantity_*) scoped to the current
   job_item_step_id. This ensures multi-step pipelines show per-step progress,
   not the sum across all steps.';

-- 2. Backfill legacy status_events that have job_item_id but no job_item_step_id
-- These are from before the pipeline system was introduced.
-- We infer the step from the session's current job_item_step_id.
UPDATE status_events se
SET job_item_step_id = s.job_item_step_id
FROM sessions s
WHERE se.session_id = s.id
  AND se.job_item_step_id IS NULL
  AND s.job_item_step_id IS NOT NULL
  AND se.job_item_id IS NOT NULL;
