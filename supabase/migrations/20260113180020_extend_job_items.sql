-- Migration: Extend job_items with new columns
-- Part of: Job System Overhaul (Phase 1B)
-- Purpose: Add name, pipeline_preset_id, and is_pipeline_locked columns

-- Add name column (will be made NOT NULL after data migration in Phase 5)
ALTER TABLE job_items ADD COLUMN IF NOT EXISTS name TEXT;

-- Add pipeline_preset_id for provenance tracking (which preset was used)
ALTER TABLE job_items ADD COLUMN IF NOT EXISTS pipeline_preset_id UUID
  REFERENCES pipeline_presets(id) ON DELETE SET NULL;

-- Add is_pipeline_locked to prevent pipeline modification after production starts
ALTER TABLE job_items ADD COLUMN IF NOT EXISTS is_pipeline_locked BOOLEAN NOT NULL DEFAULT false;

-- Index for finding job items by preset
CREATE INDEX IF NOT EXISTS idx_job_items_preset
  ON job_items(pipeline_preset_id) WHERE pipeline_preset_id IS NOT NULL;

-- Index for finding unlocked pipelines (for editing)
CREATE INDEX IF NOT EXISTS idx_job_items_unlocked
  ON job_items(is_pipeline_locked) WHERE is_pipeline_locked = false;

-- Comments for documentation
COMMENT ON COLUMN job_items.name IS 'Custom name for the job item (required after Phase 5 migration)';
COMMENT ON COLUMN job_items.pipeline_preset_id IS 'Reference to the preset used to create this job item pipeline (provenance)';
COMMENT ON COLUMN job_items.is_pipeline_locked IS 'True once production has started - prevents pipeline modification';
