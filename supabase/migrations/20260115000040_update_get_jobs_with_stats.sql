-- Migration: Update get_jobs_with_stats to use derived values
-- Part of: Database Cleanup - Remove legacy quantity columns
-- Purpose:
-- - Derive planned_quantity from SUM(job_items.planned_quantity)
-- - Derive total_good/total_scrap from SUM(status_events.quantity_*)
--
-- This removes dependency on:
-- - jobs.planned_quantity column
-- - sessions.total_good/total_scrap columns

CREATE OR REPLACE FUNCTION get_jobs_with_stats()
RETURNS TABLE (
  id uuid,
  job_number text,
  customer_name text,
  description text,
  planned_quantity bigint,  -- Now derived from job_items
  created_at timestamptz,
  updated_at timestamptz,
  total_good bigint,        -- Now derived from status_events
  total_scrap bigint,       -- Now derived from status_events
  session_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    j.id,
    j.job_number,
    j.customer_name,
    j.description,
    -- Derive planned_quantity from SUM of job_items
    COALESCE(item_qty.total_planned, 0) as planned_quantity,
    j.created_at,
    j.updated_at,
    -- Derive totals from status_events instead of sessions columns
    COALESCE(se_totals.total_good, 0) as total_good,
    COALESCE(se_totals.total_scrap, 0) as total_scrap,
    COALESCE(session_counts.cnt, 0) as session_count
  FROM jobs j
  LEFT JOIN (
    -- Aggregate planned_quantity from active job_items
    SELECT job_id, SUM(planned_quantity)::bigint as total_planned
    FROM job_items
    WHERE is_active = true
    GROUP BY job_id
  ) item_qty ON item_qty.job_id = j.id
  LEFT JOIN (
    -- Aggregate quantities from status_events (via sessions)
    SELECT s.job_id,
           SUM(COALESCE(se.quantity_good, 0))::bigint as total_good,
           SUM(COALESCE(se.quantity_scrap, 0))::bigint as total_scrap
    FROM sessions s
    JOIN status_events se ON se.session_id = s.id
    WHERE s.job_id IS NOT NULL
    GROUP BY s.job_id
  ) se_totals ON se_totals.job_id = j.id
  LEFT JOIN (
    -- Count sessions per job
    SELECT job_id, COUNT(*)::bigint as cnt
    FROM sessions
    WHERE job_id IS NOT NULL
    GROUP BY job_id
  ) session_counts ON session_counts.job_id = j.id
  ORDER BY j.created_at DESC;
$$;

COMMENT ON FUNCTION get_jobs_with_stats IS
'Gets jobs with aggregated statistics. v2: planned_quantity derived from job_items, totals derived from status_events.';
