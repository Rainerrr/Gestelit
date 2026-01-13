-- Allow sessions to be created without a job initially
-- The job will be bound later when entering production status

-- Make job_id nullable
ALTER TABLE sessions ALTER COLUMN job_id DROP NOT NULL;

COMMENT ON COLUMN sessions.job_id IS 'Optional - job bound when entering production status. Null for new sessions awaiting job selection.';
