-- Migration: Extend status_events with job_item references
-- Part of: Job System Overhaul (Phase 1E)
-- Purpose: Track which job item and step a status event is associated with

-- Add job_item_id column (for direct reference to job item)
ALTER TABLE status_events ADD COLUMN IF NOT EXISTS job_item_id UUID
  REFERENCES job_items(id) ON DELETE SET NULL;

-- Add job_item_step_id column (for specific step)
ALTER TABLE status_events ADD COLUMN IF NOT EXISTS job_item_step_id UUID
  REFERENCES job_item_steps(id) ON DELETE SET NULL;

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_status_events_job_item
  ON status_events(job_item_id) WHERE job_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_status_events_job_item_step
  ON status_events(job_item_step_id) WHERE job_item_step_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN status_events.job_item_id IS 'The job item being worked on during this status event';
COMMENT ON COLUMN status_events.job_item_step_id IS 'The specific pipeline step being worked on';
