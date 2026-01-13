-- Migration: Create production_lines and production_line_stations tables
-- Part of: Production Lines + Job Items + WIP feature (Phase 1.1)

-- production_lines: Template for ordered station sequences
CREATE TABLE IF NOT EXISTS production_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint on code (when not null)
CREATE UNIQUE INDEX IF NOT EXISTS production_lines_code_unique
  ON production_lines(code) WHERE code IS NOT NULL;

-- Index for active lines
CREATE INDEX IF NOT EXISTS idx_production_lines_active
  ON production_lines(is_active);

-- production_line_stations: Junction table with position ordering
-- Key constraint: Each station can only belong to ONE production line
CREATE TABLE IF NOT EXISTS production_line_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_line_id UUID NOT NULL REFERENCES production_lines(id) ON DELETE CASCADE,
  station_id UUID NOT NULL REFERENCES stations(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Station can only be in ONE line (critical business rule)
  CONSTRAINT uq_station_single_line UNIQUE (station_id),
  -- Each position in a line must be unique
  CONSTRAINT uq_line_position UNIQUE (production_line_id, position),
  -- Station can only appear once per line (redundant with uq_station_single_line but explicit)
  CONSTRAINT uq_line_station UNIQUE (production_line_id, station_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_pls_line
  ON production_line_stations(production_line_id);
CREATE INDEX IF NOT EXISTS idx_pls_station
  ON production_line_stations(station_id);

-- Updated_at trigger for production_lines
CREATE TRIGGER production_lines_set_updated_at
  BEFORE UPDATE ON production_lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Comments for documentation
COMMENT ON TABLE production_lines IS 'Production line templates - ordered sequences of stations';
COMMENT ON TABLE production_line_stations IS 'Junction table linking stations to production lines with position ordering';
COMMENT ON CONSTRAINT uq_station_single_line ON production_line_stations IS 'Each station can only belong to one production line';
