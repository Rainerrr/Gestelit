-- Migration: Fix job_items XOR constraint for pipeline kind
-- Part of: Job System Overhaul (Phase 1B fix)
-- Purpose: The chk_job_item_xor constraint only handled 'station' and 'line',
--          but not 'pipeline' kind. This prevented creating pipeline job items.

-- Drop the old constraint
ALTER TABLE job_items DROP CONSTRAINT IF EXISTS chk_job_item_xor;

-- Add the updated constraint that includes pipeline kind
ALTER TABLE job_items ADD CONSTRAINT chk_job_item_xor CHECK (
  (
    (kind = 'station') AND
    (station_id IS NOT NULL) AND
    (production_line_id IS NULL) AND
    (pipeline_preset_id IS NULL)
  ) OR (
    (kind = 'line') AND
    (station_id IS NULL) AND
    (production_line_id IS NOT NULL) AND
    (pipeline_preset_id IS NULL)
  ) OR (
    (kind = 'pipeline') AND
    (station_id IS NULL) AND
    (production_line_id IS NULL)
    -- pipeline_preset_id can be NULL for custom pipelines or NOT NULL for preset-based
  )
);

-- Comment explaining the constraint
COMMENT ON CONSTRAINT chk_job_item_xor ON job_items IS
  'Ensures mutually exclusive references: station-based items have only station_id, line-based items have only production_line_id, pipeline items have neither (they use job_item_steps)';
