-- Migration: Phase 5B Schema Cleanup
-- Part of: Job System Overhaul (Phase 5B)
-- Purpose: Remove legacy columns and tables after data migration
--
-- ⚠️ WARNING: This migration is IRREVERSIBLE. Run ONLY after verifying:
--   1. All production lines have been migrated to pipeline presets
--   2. All job items have names and job_item_steps
--   3. All old 'station' and 'line' kinds have been converted to 'pipeline'
--
-- Verification queries:
--   SELECT COUNT(*) FROM job_items WHERE name IS NULL;
--   SELECT COUNT(*) FROM job_items WHERE NOT EXISTS (SELECT 1 FROM job_item_steps WHERE job_item_id = job_items.id);
--   SELECT COUNT(*) FROM production_lines;
--   SELECT COUNT(*) FROM production_line_stations;

BEGIN;

-- ============================================
-- Step 1: Drop the XOR constraint on job_items
-- (It was temporarily allowing pipeline_preset_id)
-- ============================================

-- First drop the existing constraint
ALTER TABLE job_items DROP CONSTRAINT IF EXISTS job_items_xor_station_or_line_or_pipeline;

-- ============================================
-- Step 2: Set kind to 'pipeline' for all job_items
-- ============================================

-- Ensure all items are pipelines (should already be done by data migration)
UPDATE job_items SET kind = 'pipeline' WHERE kind IN ('station', 'line');

-- ============================================
-- Step 3: Drop legacy FK columns on job_items
-- ============================================

-- Drop the station_id column
ALTER TABLE job_items DROP CONSTRAINT IF EXISTS job_items_station_id_fkey;
ALTER TABLE job_items DROP COLUMN IF EXISTS station_id;

-- Drop the production_line_id column
ALTER TABLE job_items DROP CONSTRAINT IF EXISTS job_items_production_line_id_fkey;
ALTER TABLE job_items DROP COLUMN IF EXISTS production_line_id;

-- ============================================
-- Step 4: Drop production_line_stations table
-- ============================================

DROP TABLE IF EXISTS production_line_stations CASCADE;

-- ============================================
-- Step 5: Drop production_lines table
-- ============================================

DROP TABLE IF EXISTS production_lines CASCADE;

-- ============================================
-- Step 6: Drop the kind column (now redundant)
-- ============================================

-- All items are pipelines; kind column is no longer needed
ALTER TABLE job_items DROP COLUMN IF EXISTS kind;

-- ============================================
-- Step 7: Clean up deprecated column aliases
-- ============================================

-- Drop old job_item_station_id columns if they still exist
ALTER TABLE sessions DROP COLUMN IF EXISTS job_item_station_id;
ALTER TABLE status_events DROP COLUMN IF EXISTS job_item_station_id;
ALTER TABLE wip_balances DROP COLUMN IF EXISTS job_item_station_id;
ALTER TABLE wip_consumptions DROP COLUMN IF EXISTS from_job_item_station_id;

-- ============================================
-- Step 8: Add comments for documentation
-- ============================================

COMMENT ON TABLE job_items IS 'Job items represent products with pipeline workflows. Each has job_item_steps defining the station sequence.';
COMMENT ON COLUMN job_items.name IS 'Required name for the job item/product';
COMMENT ON COLUMN job_items.pipeline_preset_id IS 'Optional reference to the preset used to create this pipeline (provenance tracking)';
COMMENT ON COLUMN job_items.is_pipeline_locked IS 'True once production has started on this item, preventing pipeline modification';

COMMIT;

-- ============================================
-- Post-cleanup verification
-- ============================================
-- Run these manually to verify:
--
-- Check no production_lines or production_line_stations tables:
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('production_lines', 'production_line_stations');
--
-- Check job_items has no station_id, production_line_id, or kind columns:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'job_items' AND column_name IN ('station_id', 'production_line_id', 'kind');
--
-- Verify all job_items have steps:
-- SELECT ji.id, ji.name FROM job_items ji WHERE NOT EXISTS (SELECT 1 FROM job_item_steps jis WHERE jis.job_item_id = ji.id);
