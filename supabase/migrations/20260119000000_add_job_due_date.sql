-- Add due_date column to jobs table
-- This allows tracking target completion dates for jobs

ALTER TABLE jobs ADD COLUMN due_date DATE;

-- Index for efficient sorting by due date
CREATE INDEX idx_jobs_due_date ON jobs(due_date);

-- Comment for documentation
COMMENT ON COLUMN jobs.due_date IS 'Target completion date for the job (optional)';
