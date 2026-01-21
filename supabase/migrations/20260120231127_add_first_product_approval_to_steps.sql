-- Add requires_first_product_approval flag to job_item_steps table
-- This enables per-step, per-session first product approval requirements
-- Replaces the station-level requires_first_product_qa system

-- Add flag to job_item_steps table
ALTER TABLE job_item_steps
ADD COLUMN requires_first_product_approval BOOLEAN DEFAULT false;

-- Add flag to pipeline_preset_steps table (for presets to carry the setting)
ALTER TABLE pipeline_preset_steps
ADD COLUMN requires_first_product_approval BOOLEAN DEFAULT false;

-- Create index for efficient lookups of first product reports per session
CREATE INDEX IF NOT EXISTS idx_reports_first_product_session
  ON reports(session_id)
  WHERE is_first_product_qa = true;

-- Deprecate station-level flag (don't remove yet, just mark as deprecated)
COMMENT ON COLUMN stations.requires_first_product_qa IS
  'DEPRECATED: Use job_item_steps.requires_first_product_approval instead';

-- Add comments for new columns
COMMENT ON COLUMN job_item_steps.requires_first_product_approval IS
  'When true, workers must submit and get approval for first product report before entering production status';

COMMENT ON COLUMN pipeline_preset_steps.requires_first_product_approval IS
  'Default value for requires_first_product_approval when creating job items from this preset';
