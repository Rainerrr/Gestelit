-- =====================================================
-- Performance at Scale: Dashboard Enrichment RPC
-- Phase P1.1 - Replace 5 queries with single optimized RPC
-- =====================================================

-- Drop if exists for idempotent re-runs
DROP FUNCTION IF EXISTS get_active_sessions_enriched();

-- Create the enrichment function that returns all dashboard data in one query
CREATE OR REPLACE FUNCTION get_active_sessions_enriched()
RETURNS TABLE (
  -- Session core fields
  session_id UUID,
  worker_id UUID,
  worker_full_name TEXT,
  worker_code TEXT,
  station_id UUID,
  station_name TEXT,
  station_code TEXT,
  station_type TEXT,
  job_id UUID,
  job_number TEXT,
  job_item_id UUID,
  job_item_name TEXT,
  job_item_step_id UUID,
  current_status_id UUID,
  status_name TEXT,
  status_color TEXT,
  machine_state TEXT,
  started_at TIMESTAMPTZ,
  last_status_change_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  -- Enrichment fields (previously 5 separate queries)
  malfunction_count INT,
  stoppage_seconds INT,
  setup_seconds INT,
  production_seconds INT,
  total_good INT,
  total_scrap INT,
  current_job_item_good INT,
  current_job_item_scrap INT
) AS $$
BEGIN
  RETURN QUERY
  WITH active_sessions AS (
    -- Get all active sessions (this is the base set)
    SELECT s.*
    FROM sessions s
    WHERE s.status = 'active'
      AND s.ended_at IS NULL
  ),

  -- Count malfunctions per session
  malfunction_counts AS (
    SELECT
      r.session_id,
      COUNT(*)::INT as cnt
    FROM reports r
    WHERE r.session_id IN (SELECT id FROM active_sessions)
      AND r.type = 'malfunction'
    GROUP BY r.session_id
  ),

  -- Calculate time by machine state (stoppage, setup, production)
  time_by_state AS (
    SELECT
      se.session_id,
      SUM(
        CASE WHEN sd.machine_state = 'stoppage'
          THEN EXTRACT(EPOCH FROM COALESCE(se.ended_at, NOW()) - se.started_at)
          ELSE 0
        END
      )::INT as stoppage_secs,
      SUM(
        CASE WHEN sd.machine_state = 'setup'
          THEN EXTRACT(EPOCH FROM COALESCE(se.ended_at, NOW()) - se.started_at)
          ELSE 0
        END
      )::INT as setup_secs,
      SUM(
        CASE WHEN sd.machine_state = 'production'
          THEN EXTRACT(EPOCH FROM COALESCE(se.ended_at, NOW()) - se.started_at)
          ELSE 0
        END
      )::INT as production_secs
    FROM status_events se
    JOIN status_definitions sd ON sd.id = se.status_definition_id
    WHERE se.session_id IN (SELECT id FROM active_sessions)
    GROUP BY se.session_id
  ),

  -- Sum total quantities across all status events in session
  session_totals AS (
    SELECT
      se.session_id,
      SUM(COALESCE(se.quantity_good, 0))::INT as total_good,
      SUM(COALESCE(se.quantity_scrap, 0))::INT as total_scrap
    FROM status_events se
    WHERE se.session_id IN (SELECT id FROM active_sessions)
    GROUP BY se.session_id
  ),

  -- Sum quantities for current job item only
  current_job_totals AS (
    SELECT
      s.id as session_id,
      SUM(COALESCE(se.quantity_good, 0))::INT as job_good,
      SUM(COALESCE(se.quantity_scrap, 0))::INT as job_scrap
    FROM active_sessions s
    JOIN status_events se ON se.session_id = s.id
      AND se.job_item_id = s.job_item_id
    GROUP BY s.id
  )

  -- Main query: join all CTEs with base session data
  SELECT
    s.id,
    s.worker_id,
    w.full_name,
    w.code,
    s.station_id,
    st.name,
    st.code,
    st.station_type::TEXT,
    s.job_id,
    j.job_number,
    s.job_item_id,
    ji.name,
    s.job_item_step_id,
    s.current_status_id,
    sd.label_he,
    sd.color_hex,
    sd.machine_state::TEXT,
    s.started_at,
    s.last_status_change_at,
    s.last_seen_at,
    COALESCE(mc.cnt, 0),
    COALESCE(ts.stoppage_secs, 0),
    COALESCE(ts.setup_secs, 0),
    COALESCE(ts.production_secs, 0),
    COALESCE(st_totals.total_good, 0),
    COALESCE(st_totals.total_scrap, 0),
    COALESCE(cjt.job_good, 0),
    COALESCE(cjt.job_scrap, 0)
  FROM active_sessions s
  LEFT JOIN workers w ON w.id = s.worker_id
  LEFT JOIN stations st ON st.id = s.station_id
  LEFT JOIN jobs j ON j.id = s.job_id
  LEFT JOIN job_items ji ON ji.id = s.job_item_id
  LEFT JOIN status_definitions sd ON sd.id = s.current_status_id
  LEFT JOIN malfunction_counts mc ON mc.session_id = s.id
  LEFT JOIN time_by_state ts ON ts.session_id = s.id
  LEFT JOIN session_totals st_totals ON st_totals.session_id = s.id
  LEFT JOIN current_job_totals cjt ON cjt.session_id = s.id
  ORDER BY s.started_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION get_active_sessions_enriched() TO service_role;

-- Add helpful comment
COMMENT ON FUNCTION get_active_sessions_enriched() IS
  'Returns all active sessions with enrichment data (malfunction count, time by state, quantities) in a single query. Replaces 5 separate dashboard queries for better performance at scale.';
