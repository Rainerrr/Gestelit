-- Migration: Add job_item_count and completed_item_count to get_jobs_with_stats
-- Purpose: Include job item counts in the stats returned by the RPC function
-- - job_item_count: total number of active job items for the job
-- - completed_item_count: number of job items where progress >= planned_quantity
-- - total_good: sum of completed_good from job_item_progress (terminal station completions only)

-- Add due_date to the return type as well (was missing)
-- Must DROP first because we're changing the return type
DROP FUNCTION IF EXISTS get_jobs_with_stats();

CREATE OR REPLACE FUNCTION get_jobs_with_stats()
RETURNS TABLE (
  id uuid,
  job_number text,
  customer_name text,
  description text,
  due_date date,
  planned_quantity bigint,
  created_at timestamptz,
  updated_at timestamptz,
  total_good bigint,
  total_scrap bigint,
  session_count bigint,
  job_item_count bigint,
  completed_item_count bigint
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
    j.due_date,
    -- Derive planned_quantity from SUM of job_items
    COALESCE(item_stats.total_planned, 0) as planned_quantity,
    j.created_at,
    j.updated_at,
    -- Use completed_good from job_item_progress (terminal station completions only)
    COALESCE(item_stats.total_completed_good, 0) as total_good,
    -- Keep scrap from status_events as it's reported at any stage
    COALESCE(se_totals.total_scrap, 0) as total_scrap,
    COALESCE(session_counts.cnt, 0) as session_count,
    -- Job item counts
    COALESCE(item_stats.item_count, 0) as job_item_count,
    COALESCE(item_stats.completed_count, 0) as completed_item_count
  FROM jobs j
  LEFT JOIN (
    -- Aggregate job_items stats including completion status
    SELECT
      ji.job_id,
      SUM(ji.planned_quantity)::bigint as total_planned,
      COUNT(*)::bigint as item_count,
      COUNT(*) FILTER (
        WHERE COALESCE(jip.completed_good, 0) >= ji.planned_quantity
      )::bigint as completed_count,
      -- Sum of completed_good from all job items (terminal station completions)
      SUM(COALESCE(jip.completed_good, 0))::bigint as total_completed_good
    FROM job_items ji
    LEFT JOIN job_item_progress jip ON jip.job_item_id = ji.id
    WHERE ji.is_active = true
    GROUP BY ji.job_id
  ) item_stats ON item_stats.job_id = j.id
  LEFT JOIN (
    -- Aggregate scrap quantities from status_events (via sessions)
    SELECT s.job_id,
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
'Gets jobs with aggregated statistics. v4: total_good now uses job_item_progress.completed_good (terminal station completions only).';
