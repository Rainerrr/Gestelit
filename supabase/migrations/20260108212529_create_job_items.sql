-- Migration: Create job_items, job_item_stations, and job_item_progress tables
-- Part of: Production Lines + Job Items + WIP feature (Phase 1.2)

-- job_items: Individual production requirements within a job
-- Each job_item represents a distinct "product" that can be:
--   kind='station': produced at a single station
--   kind='line': produced across a production line (terminal station GOOD = completed)
CREATE TABLE IF NOT EXISTS job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('station', 'line')),
  station_id UUID NULL REFERENCES stations(id),
  production_line_id UUID NULL REFERENCES production_lines(id),
  planned_quantity INTEGER NOT NULL CHECK (planned_quantity > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- XOR constraint: must have exactly one of station_id or production_line_id
  CONSTRAINT chk_job_item_xor CHECK (
    (kind = 'station' AND station_id IS NOT NULL AND production_line_id IS NULL)
    OR
    (kind = 'line' AND station_id IS NULL AND production_line_id IS NOT NULL)
  )
);

-- Indexes for job_items
CREATE INDEX IF NOT EXISTS idx_job_items_job
  ON job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_job_items_station
  ON job_items(station_id) WHERE station_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_items_line
  ON job_items(production_line_id) WHERE production_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_items_active
  ON job_items(is_active);

-- job_item_stations: Frozen snapshot of steps for each job item
-- This captures the production line configuration at the time the job item was created
-- preventing changes to production lines from affecting in-progress work
CREATE TABLE IF NOT EXISTS job_item_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_item_id UUID NOT NULL REFERENCES job_items(id) ON DELETE CASCADE,
  station_id UUID NOT NULL REFERENCES stations(id),
  position INTEGER NOT NULL CHECK (position > 0),
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each position in a job item must be unique
  CONSTRAINT uq_jis_position UNIQUE (job_item_id, position),
  -- Each station can only appear once per job item
  CONSTRAINT uq_jis_station UNIQUE (job_item_id, station_id)
);

-- Indexes for job_item_stations
CREATE INDEX IF NOT EXISTS idx_jis_job_item
  ON job_item_stations(job_item_id);
CREATE INDEX IF NOT EXISTS idx_jis_station
  ON job_item_stations(station_id);
CREATE INDEX IF NOT EXISTS idx_jis_terminal
  ON job_item_stations(job_item_id) WHERE is_terminal = true;

-- job_item_progress: Tracks completed GOOD count for each job item
-- Only terminal station GOOD increments this counter
CREATE TABLE IF NOT EXISTS job_item_progress (
  job_item_id UUID PRIMARY KEY REFERENCES job_items(id) ON DELETE CASCADE,
  completed_good INTEGER NOT NULL DEFAULT 0 CHECK (completed_good >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Updated_at trigger for job_items
CREATE TRIGGER job_items_set_updated_at
  BEFORE UPDATE ON job_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Updated_at trigger for job_item_progress
CREATE TRIGGER job_item_progress_set_updated_at
  BEFORE UPDATE ON job_item_progress
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Comments for documentation
COMMENT ON TABLE job_items IS 'Production requirements within a job - each represents a distinct product';
COMMENT ON COLUMN job_items.kind IS 'station = single station, line = production line';
COMMENT ON COLUMN job_items.planned_quantity IS 'Target quantity to produce';
COMMENT ON TABLE job_item_stations IS 'Frozen snapshot of production steps for each job item';
COMMENT ON COLUMN job_item_stations.is_terminal IS 'True for the last station - only terminal GOOD counts as completed';
COMMENT ON TABLE job_item_progress IS 'Tracks completed GOOD count (terminal station output only)';
