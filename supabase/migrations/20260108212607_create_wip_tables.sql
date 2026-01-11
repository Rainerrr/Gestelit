-- Migration: Create wip_balances and wip_consumptions tables
-- Part of: Production Lines + Job Items + WIP feature (Phase 1.3)

-- wip_balances: GOOD-only inventory balance per step
-- Replaces lot-based tracking with a simple balance per job_item + step
-- Value represents "how many GOOD units are waiting after this step"
CREATE TABLE IF NOT EXISTS wip_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_item_id UUID NOT NULL REFERENCES job_items(id) ON DELETE CASCADE,
  job_item_station_id UUID NOT NULL REFERENCES job_item_stations(id) ON DELETE CASCADE,
  good_available INTEGER NOT NULL DEFAULT 0 CHECK (good_available >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One balance row per job_item + step combination
  CONSTRAINT uq_wip_step UNIQUE (job_item_id, job_item_station_id)
);

-- Indexes for wip_balances
CREATE INDEX IF NOT EXISTS idx_wip_balances_job_item
  ON wip_balances(job_item_id);
CREATE INDEX IF NOT EXISTS idx_wip_balances_step
  ON wip_balances(job_item_station_id);
-- Index for bottleneck detection (finding steps with high WIP)
CREATE INDEX IF NOT EXISTS idx_wip_balances_high_wip
  ON wip_balances(good_available DESC) WHERE good_available > 0;

-- wip_consumptions: Ledger recording pulls from upstream WIP
-- Used for deterministic LIFO reversal during corrections
-- Each row records how much a downstream session pulled from an upstream step
CREATE TABLE IF NOT EXISTS wip_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_item_id UUID NOT NULL REFERENCES job_items(id) ON DELETE CASCADE,
  consuming_session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  from_job_item_station_id UUID NOT NULL REFERENCES job_item_stations(id) ON DELETE CASCADE,
  good_used INTEGER NOT NULL CHECK (good_used > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for wip_consumptions
-- Primary index for LIFO reversal during corrections (newest first)
CREATE INDEX IF NOT EXISTS idx_wip_consumptions_session_lifo
  ON wip_consumptions(consuming_session_id, created_at DESC);
-- Index for querying total pulls from a specific step
CREATE INDEX IF NOT EXISTS idx_wip_consumptions_step
  ON wip_consumptions(job_item_id, from_job_item_station_id);
-- Index for cleanup when session is deleted
CREATE INDEX IF NOT EXISTS idx_wip_consumptions_session
  ON wip_consumptions(consuming_session_id);

-- Updated_at trigger for wip_balances
CREATE TRIGGER wip_balances_set_updated_at
  BEFORE UPDATE ON wip_balances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Comments for documentation
COMMENT ON TABLE wip_balances IS 'GOOD-only WIP balance per step - tracks available inventory between stations';
COMMENT ON COLUMN wip_balances.good_available IS 'Number of GOOD units available for downstream consumption';
COMMENT ON TABLE wip_consumptions IS 'Ledger of WIP pulls - enables LIFO reversal during corrections';
COMMENT ON COLUMN wip_consumptions.good_used IS 'Amount of GOOD pulled from upstream (must be > 0)';
COMMENT ON COLUMN wip_consumptions.from_job_item_station_id IS 'The upstream step that provided the GOOD';
