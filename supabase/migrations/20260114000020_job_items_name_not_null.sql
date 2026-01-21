-- Migration: Make job_items.name NOT NULL
-- Part of: Job System Overhaul (Phase 5A)
-- Purpose: After data migration, enforce that all job items have a name
--
-- ⚠️ This migration MUST run AFTER 20260114000010_migrate_production_lines_to_presets.sql

-- Make name column NOT NULL (all rows should have names after data migration)
ALTER TABLE job_items ALTER COLUMN name SET NOT NULL;

-- Add index for name search
CREATE INDEX IF NOT EXISTS idx_job_items_name ON job_items(name);

-- Comment for documentation
COMMENT ON COLUMN job_items.name IS 'Required custom name for the job item/product';
