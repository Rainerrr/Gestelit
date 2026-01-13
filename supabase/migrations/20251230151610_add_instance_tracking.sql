-- Add instance tracking to sessions for concurrent session prevention
-- This enables:
-- 1. Cross-device protection: only one browser instance can be active per session
-- 2. Station locking: efficient queries to check if a station has an active session

-- Add instance tracking column
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS active_instance_id TEXT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.sessions.active_instance_id IS
  'Unique browser tab identifier. Used to prevent same session running in multiple tabs/devices.';

-- Index for efficient station occupancy queries
-- Used when fetching stations to show which are occupied
-- Includes last_seen_at for grace period calculations
CREATE INDEX IF NOT EXISTS sessions_station_occupancy_idx
  ON public.sessions(station_id, status, last_seen_at)
  WHERE status = 'active' AND ended_at IS NULL AND forced_closed_at IS NULL;

-- Index for efficient instance validation during heartbeat
-- Allows fast lookup of session's current instance
CREATE INDEX IF NOT EXISTS sessions_instance_validation_idx
  ON public.sessions(id, active_instance_id)
  WHERE status = 'active';
