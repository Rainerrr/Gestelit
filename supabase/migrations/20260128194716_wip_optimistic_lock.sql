-- =====================================================
-- Performance at Scale: WIP Optimistic Locking - Part 1
-- Phase P1.3 - Add version column for optimistic locking
-- =====================================================

-- Add version column for optimistic locking
ALTER TABLE wip_balances
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;

-- Comment on the new column
COMMENT ON COLUMN wip_balances.version IS 'Optimistic locking version counter for concurrent update detection';
