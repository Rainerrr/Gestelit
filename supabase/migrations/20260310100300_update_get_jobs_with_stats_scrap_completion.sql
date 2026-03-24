-- Migration: Update get_jobs_with_stats() for scrap-toward-completion
-- Part of: Production System Refactor - Chunk 1 (Database Foundation)
-- Changes:
--   1. Completion = completed_good + completed_scrap >= planned_quantity
--   2. total_scrap sourced from job_item_progress.completed_scrap

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
    COALESCE(item_stats.total_planned, 0) as planned_quantity,
    j.created_at,
    j.updated_at,
    COALESCE(item_stats.total_completed_good, 0) as total_good,
    COALESCE(item_stats.total_completed_scrap, 0) as total_scrap,
    COALESCE(session_counts.cnt, 0) as session_count,
    COALESCE(item_stats.item_count, 0) as job_item_count,
    COALESCE(item_stats.completed_count, 0) as completed_item_count
  FROM jobs j
  LEFT JOIN (
    SELECT
      ji.job_id,
      SUM(ji.planned_quantity)::bigint as total_planned,
      COUNT(*)::bigint as item_count,
      -- Completion now includes scrap: good + scrap >= planned
      COUNT(*) FILTER (
        WHERE COALESCE(jip.completed_good, 0) + COALESCE(jip.completed_scrap, 0) >= ji.planned_quantity
      )::bigint as completed_count,
      SUM(COALESCE(jip.completed_good, 0))::bigint as total_completed_good,
      SUM(COALESCE(jip.completed_scrap, 0))::bigint as total_completed_scrap
    FROM job_items ji
    LEFT JOIN job_item_progress jip ON jip.job_item_id = ji.id
    WHERE ji.is_active = true
    GROUP BY ji.job_id
  ) item_stats ON item_stats.job_id = j.id
  LEFT JOIN (
    SELECT job_id, COUNT(*)::bigint as cnt
    FROM sessions
    WHERE job_id IS NOT NULL
    GROUP BY job_id
  ) session_counts ON session_counts.job_id = j.id
  ORDER BY j.created_at DESC;
$$;
