-- Migration: Add job_item references to sessions table
-- Part of: Production Lines + Job Items + WIP feature (Phase 1.4)

-- Add job_item_id column
-- NULL for legacy sessions (backwards compatible)
-- Required for new sessions to enable WIP tracking
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS job_item_id UUID NULL REFERENCES job_items(id);

-- Add job_item_station_id column
-- References the specific step (station) within the job item
-- Required for WIP balance tracking
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS job_item_station_id UUID NULL REFERENCES job_item_stations(id);

-- Index for efficient lookups by job_item
CREATE INDEX IF NOT EXISTS idx_sessions_job_item
  ON sessions(job_item_id) WHERE job_item_id IS NOT NULL;

-- Index for efficient lookups by job_item_station
CREATE INDEX IF NOT EXISTS idx_sessions_job_item_station
  ON sessions(job_item_station_id) WHERE job_item_station_id IS NOT NULL;

-- Composite index for WIP queries (active sessions per step)
CREATE INDEX IF NOT EXISTS idx_sessions_active_step
  ON sessions(job_item_station_id, status)
  WHERE job_item_station_id IS NOT NULL AND status = 'active';

-- Comments for documentation
COMMENT ON COLUMN sessions.job_item_id IS 'References the job item being worked on (NULL for legacy sessions)';
COMMENT ON COLUMN sessions.job_item_station_id IS 'References the specific step/station within the job item';
