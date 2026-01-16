-- Migration: Pipeline lock trigger
-- Part of: Job System Overhaul (Phase 1F)
-- Purpose: Automatically lock job item pipeline when production starts

-- Function to lock pipeline when a production status event is created
CREATE OR REPLACE FUNCTION lock_job_item_pipeline_on_production()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if this status event has a job_item_id
  IF NEW.job_item_id IS NOT NULL THEN
    -- Check if the status definition is a production status
    IF EXISTS (
      SELECT 1 FROM status_definitions
      WHERE id = NEW.status_definition_id
      AND machine_state = 'production'
    ) THEN
      -- Lock the pipeline if not already locked
      UPDATE job_items
      SET is_pipeline_locked = true
      WHERE id = NEW.job_item_id
      AND is_pipeline_locked = false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on status_events insert
DROP TRIGGER IF EXISTS trg_lock_pipeline_on_production ON status_events;
CREATE TRIGGER trg_lock_pipeline_on_production
  AFTER INSERT ON status_events
  FOR EACH ROW EXECUTE FUNCTION lock_job_item_pipeline_on_production();

-- Comments
COMMENT ON FUNCTION lock_job_item_pipeline_on_production() IS
  'Automatically locks job item pipeline when production status is started';
