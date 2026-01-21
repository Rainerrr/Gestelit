-- Migration: Rename FK columns from job_item_station_id to job_item_step_id
-- Part of: Job System Overhaul (Phase 1D)
-- Purpose: Align column naming with new terminology

-- =============================================
-- 1. Rename columns in tables
-- =============================================

-- wip_balances: rename column and constraint
ALTER TABLE wip_balances RENAME COLUMN job_item_station_id TO job_item_step_id;
ALTER TABLE wip_balances DROP CONSTRAINT IF EXISTS uq_wip_step;
ALTER TABLE wip_balances ADD CONSTRAINT uq_wip_step UNIQUE (job_item_id, job_item_step_id);

-- wip_consumptions: rename column
ALTER TABLE wip_consumptions RENAME COLUMN from_job_item_station_id TO from_job_item_step_id;

-- sessions: rename column
ALTER TABLE sessions RENAME COLUMN job_item_station_id TO job_item_step_id;

-- =============================================
-- 2. Rename indexes
-- =============================================

-- wip_balances indexes
ALTER INDEX IF EXISTS idx_wip_balances_step RENAME TO idx_wip_balances_job_item_step;

-- wip_consumptions indexes
ALTER INDEX IF EXISTS idx_wip_consumptions_step RENAME TO idx_wip_consumptions_from_step;

-- sessions indexes
ALTER INDEX IF EXISTS idx_sessions_job_item_station RENAME TO idx_sessions_job_item_step;
ALTER INDEX IF EXISTS idx_sessions_active_step RENAME TO idx_sessions_active_job_item_step;

-- =============================================
-- 3. Update comments
-- =============================================

COMMENT ON COLUMN wip_balances.job_item_step_id IS 'References the job item step (was job_item_station_id)';
COMMENT ON COLUMN wip_consumptions.from_job_item_step_id IS 'The upstream step that provided the GOOD (was from_job_item_station_id)';
COMMENT ON COLUMN sessions.job_item_step_id IS 'References the specific step within the job item (was job_item_station_id)';

-- =============================================
-- 4. Drop and recreate the view with new column names
-- =============================================

DROP VIEW IF EXISTS session_wip_accounting;

CREATE OR REPLACE VIEW session_wip_accounting AS
SELECT
  s.id AS session_id,
  s.job_item_id,
  s.job_item_step_id,
  s.total_good,
  s.total_scrap,
  COALESCE(SUM(CASE WHEN wc.is_scrap = FALSE THEN wc.good_used ELSE 0 END), 0)::INTEGER AS pulled_good,
  (s.total_good - COALESCE(SUM(CASE WHEN wc.is_scrap = FALSE THEN wc.good_used ELSE 0 END), 0))::INTEGER AS originated_good,
  COALESCE(SUM(CASE WHEN wc.is_scrap = TRUE THEN wc.good_used ELSE 0 END), 0)::INTEGER AS pulled_scrap,
  (s.total_scrap - COALESCE(SUM(CASE WHEN wc.is_scrap = TRUE THEN wc.good_used ELSE 0 END), 0))::INTEGER AS originated_scrap
FROM sessions s
LEFT JOIN wip_consumptions wc ON wc.consuming_session_id = s.id
WHERE s.job_item_id IS NOT NULL
GROUP BY s.id, s.job_item_id, s.job_item_step_id, s.total_good, s.total_scrap;

COMMENT ON VIEW session_wip_accounting IS 'Shows WIP accounting breakdown for each session';
