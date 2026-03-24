-- Migration: Add independent reporting columns to wip_balances and job_item_progress
-- Part of: Production System Refactor - Chunk 1 (Database Foundation)
-- Purpose: Support independent station reporting model where each station
--          tracks its own good_reported and scrap_reported independently.

-- =============================================
-- 1. Add good_reported and scrap_reported to wip_balances
-- =============================================

ALTER TABLE wip_balances
ADD COLUMN IF NOT EXISTS good_reported INTEGER NOT NULL DEFAULT 0;

ALTER TABLE wip_balances
ADD COLUMN IF NOT EXISTS scrap_reported INTEGER NOT NULL DEFAULT 0;

ALTER TABLE wip_balances
ADD CONSTRAINT chk_good_reported_non_negative CHECK (good_reported >= 0);

ALTER TABLE wip_balances
ADD CONSTRAINT chk_scrap_reported_non_negative CHECK (scrap_reported >= 0);

-- =============================================
-- 2. Add completed_scrap to job_item_progress
-- =============================================

ALTER TABLE job_item_progress
ADD COLUMN IF NOT EXISTS completed_scrap INTEGER NOT NULL DEFAULT 0;

ALTER TABLE job_item_progress
ADD CONSTRAINT chk_completed_scrap_non_negative CHECK (completed_scrap >= 0);

-- =============================================
-- 3. Backfill good_reported from good_available
-- =============================================
-- Note: good_available is net inventory after consumption (approximation).
-- New reporting going forward will be accurate.

UPDATE wip_balances
SET good_reported = good_available
WHERE good_available > 0;

-- =============================================
-- 4. Backfill completed_scrap from terminal station status events
-- =============================================
-- Preserve historical scrap visibility

UPDATE job_item_progress jip
SET completed_scrap = COALESCE(sub.total_scrap, 0)
FROM (
  SELECT se.job_item_id, SUM(COALESCE(se.quantity_scrap, 0)) as total_scrap
  FROM status_events se
  JOIN job_item_steps jis ON jis.id = se.job_item_step_id AND jis.is_terminal = true
  WHERE se.job_item_id IS NOT NULL AND se.quantity_scrap > 0
  GROUP BY se.job_item_id
) sub
WHERE jip.job_item_id = sub.job_item_id;

-- =============================================
-- 5. Comments
-- =============================================

COMMENT ON COLUMN wip_balances.good_reported IS 'Total GOOD units reported at this step (independent, no consumption)';
COMMENT ON COLUMN wip_balances.scrap_reported IS 'Total SCRAP units reported at this step (independent, no consumption)';
COMMENT ON COLUMN job_item_progress.completed_scrap IS 'Total SCRAP reported at terminal station';
