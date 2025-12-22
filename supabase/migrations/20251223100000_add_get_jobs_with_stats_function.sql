-- Function to get jobs with aggregated session stats
CREATE OR REPLACE FUNCTION get_jobs_with_stats()
RETURNS TABLE (
  id uuid,
  job_number text,
  customer_name text,
  description text,
  planned_quantity integer,
  created_at timestamptz,
  updated_at timestamptz,
  total_good bigint,
  total_scrap bigint,
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
    j.planned_quantity,
    j.created_at,
    j.updated_at,
    COALESCE(SUM(s.total_good), 0) as total_good,
    COALESCE(SUM(s.total_scrap), 0) as total_scrap,
    COUNT(s.id) as session_count
  FROM jobs j
  LEFT JOIN sessions s ON s.job_id = j.id
  GROUP BY j.id
  ORDER BY j.created_at DESC;
$$;
