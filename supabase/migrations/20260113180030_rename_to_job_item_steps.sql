-- Migration: Rename job_item_stations to job_item_steps
-- Part of: Job System Overhaul (Phase 1C)
-- Purpose: Align naming with new pipeline terminology

-- Rename the table
ALTER TABLE job_item_stations RENAME TO job_item_steps;

-- Rename constraints
ALTER TABLE job_item_steps RENAME CONSTRAINT uq_jis_position TO uq_job_item_step_position;
ALTER TABLE job_item_steps RENAME CONSTRAINT uq_jis_station TO uq_job_item_step_station;

-- Rename indexes
ALTER INDEX idx_jis_job_item RENAME TO idx_job_item_steps_job_item;
ALTER INDEX idx_jis_station RENAME TO idx_job_item_steps_station;
ALTER INDEX idx_jis_terminal RENAME TO idx_job_item_steps_terminal;

-- Update comments to reflect new naming
COMMENT ON TABLE job_item_steps IS 'Pipeline steps for each job item - frozen snapshot of stations';
COMMENT ON COLUMN job_item_steps.position IS 'Order of step in pipeline (1-indexed)';
COMMENT ON COLUMN job_item_steps.is_terminal IS 'True for the last step - only terminal GOOD counts as completed';
