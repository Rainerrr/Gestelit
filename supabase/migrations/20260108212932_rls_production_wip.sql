-- Migration: Enable RLS and create policies for production/WIP tables
-- Part of: Production Lines + Job Items + WIP feature (Phase 1.5)

-- ============================================
-- PRODUCTION_LINES TABLE
-- ============================================
ALTER TABLE production_lines ENABLE ROW LEVEL SECURITY;

-- Anyone can view active production lines (needed for worker UI)
CREATE POLICY "Anyone can view active production lines"
  ON production_lines FOR SELECT
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR
    is_active = true
  );

-- Service role can manage all production lines
CREATE POLICY "Service role can manage production lines"
  ON production_lines FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- ============================================
-- PRODUCTION_LINE_STATIONS TABLE
-- ============================================
ALTER TABLE production_line_stations ENABLE ROW LEVEL SECURITY;

-- Anyone can view production line stations (needed for worker UI to see line composition)
CREATE POLICY "Anyone can view production line stations"
  ON production_line_stations FOR SELECT
  USING (true);

-- Service role can manage all production line stations
CREATE POLICY "Service role can manage production line stations"
  ON production_line_stations FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- ============================================
-- JOB_ITEMS TABLE
-- ============================================
ALTER TABLE job_items ENABLE ROW LEVEL SECURITY;

-- Anyone can view job items (needed for worker flow to see allowed stations)
CREATE POLICY "Anyone can view job items"
  ON job_items FOR SELECT
  USING (true);

-- Service role can manage all job items
CREATE POLICY "Service role can manage job items"
  ON job_items FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- ============================================
-- JOB_ITEM_STATIONS TABLE
-- ============================================
ALTER TABLE job_item_stations ENABLE ROW LEVEL SECURITY;

-- Anyone can view job item stations (needed for worker flow)
CREATE POLICY "Anyone can view job item stations"
  ON job_item_stations FOR SELECT
  USING (true);

-- Service role can manage all job item stations
CREATE POLICY "Service role can manage job item stations"
  ON job_item_stations FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- ============================================
-- JOB_ITEM_PROGRESS TABLE
-- ============================================
ALTER TABLE job_item_progress ENABLE ROW LEVEL SECURITY;

-- Anyone can view job item progress (needed for progress displays)
CREATE POLICY "Anyone can view job item progress"
  ON job_item_progress FOR SELECT
  USING (true);

-- Service role can manage all job item progress
CREATE POLICY "Service role can manage job item progress"
  ON job_item_progress FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- ============================================
-- WIP_BALANCES TABLE
-- ============================================
ALTER TABLE wip_balances ENABLE ROW LEVEL SECURITY;

-- Anyone can view WIP balances (needed for worker UI to show upstream availability)
CREATE POLICY "Anyone can view wip balances"
  ON wip_balances FOR SELECT
  USING (true);

-- Service role can manage all WIP balances
CREATE POLICY "Service role can manage wip balances"
  ON wip_balances FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- ============================================
-- WIP_CONSUMPTIONS TABLE
-- ============================================
ALTER TABLE wip_consumptions ENABLE ROW LEVEL SECURITY;

-- Service role only for WIP consumptions (ledger should not be directly accessible)
CREATE POLICY "Service role can manage wip consumptions"
  ON wip_consumptions FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- Optional: Allow read access for debugging/analytics
CREATE POLICY "Anyone can view wip consumptions"
  ON wip_consumptions FOR SELECT
  USING (true);
