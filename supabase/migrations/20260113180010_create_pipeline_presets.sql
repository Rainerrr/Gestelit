-- Migration: Create pipeline_presets and pipeline_preset_steps tables
-- Part of: Job System Overhaul (Phase 1A)
-- Purpose: Reusable pipeline templates to replace production_lines

-- pipeline_presets: Template definitions for multi-station pipelines
-- These are used as provenance/templates when creating job items
CREATE TABLE IF NOT EXISTS pipeline_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- pipeline_preset_steps: Stations in a preset with their order
-- Key difference from production_line_stations: NO station exclusivity
-- A station can appear in MULTIPLE presets (no global unique on station_id)
CREATE TABLE IF NOT EXISTS pipeline_preset_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_preset_id UUID NOT NULL REFERENCES pipeline_presets(id) ON DELETE CASCADE,
  station_id UUID NOT NULL REFERENCES stations(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each position in a preset must be unique
  CONSTRAINT uq_preset_position UNIQUE (pipeline_preset_id, position),
  -- Each station can only appear once per preset (but CAN appear in other presets)
  CONSTRAINT uq_preset_station UNIQUE (pipeline_preset_id, station_id)
);

-- Indexes for pipeline_presets
CREATE INDEX IF NOT EXISTS idx_pipeline_presets_active
  ON pipeline_presets(is_active);
CREATE INDEX IF NOT EXISTS idx_pipeline_presets_name
  ON pipeline_presets(name);

-- Indexes for pipeline_preset_steps
CREATE INDEX IF NOT EXISTS idx_pipeline_preset_steps_preset
  ON pipeline_preset_steps(pipeline_preset_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_preset_steps_station
  ON pipeline_preset_steps(station_id);

-- Updated_at trigger for pipeline_presets
CREATE TRIGGER pipeline_presets_set_updated_at
  BEFORE UPDATE ON pipeline_presets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enable RLS
ALTER TABLE pipeline_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_preset_steps ENABLE ROW LEVEL SECURITY;

-- RLS policies - allow service role full access
CREATE POLICY "Service role has full access to pipeline_presets"
  ON pipeline_presets FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to pipeline_preset_steps"
  ON pipeline_preset_steps FOR ALL
  USING (true) WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE pipeline_presets IS 'Reusable pipeline templates for multi-station job items';
COMMENT ON COLUMN pipeline_presets.name IS 'Display name of the pipeline preset';
COMMENT ON COLUMN pipeline_presets.description IS 'Optional description of the pipeline purpose';
COMMENT ON TABLE pipeline_preset_steps IS 'Ordered stations within a pipeline preset';
COMMENT ON COLUMN pipeline_preset_steps.position IS 'Order of station in pipeline (1-indexed)';
