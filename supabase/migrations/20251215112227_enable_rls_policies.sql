-- Enable Row Level Security (RLS) on all tables
-- This migration protects against direct database access via anon key
-- Service role (used by API routes) bypasses RLS automatically

-- ============================================
-- WORKERS TABLE
-- ============================================
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (bypasses RLS anyway)
-- Anon key has no access to workers table
CREATE POLICY "Service role can manage workers"
  ON workers FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- ============================================
-- STATIONS TABLE
-- ============================================
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;

-- Everyone can view active stations (needed for worker UI)
CREATE POLICY "Anyone can view active stations"
  ON stations FOR SELECT
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR
    is_active = true
  );

-- Service role can manage all stations
CREATE POLICY "Service role can manage stations"
  ON stations FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- ============================================
-- WORKER_STATIONS TABLE
-- ============================================
ALTER TABLE worker_stations ENABLE ROW LEVEL SECURITY;

-- Service role can manage all assignments
CREATE POLICY "Service role can manage worker stations"
  ON worker_stations FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- ============================================
-- JOBS TABLE
-- ============================================
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Everyone can read and create jobs (needed for session creation)
CREATE POLICY "Anyone can read and create jobs"
  ON jobs FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create jobs"
  ON jobs FOR INSERT
  WITH CHECK (true);

-- Service role can manage all jobs
CREATE POLICY "Service role can manage jobs"
  ON jobs FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- ============================================
-- SESSIONS TABLE
-- ============================================
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Service role can manage all sessions
CREATE POLICY "Service role can manage sessions"
  ON sessions FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- ============================================
-- STATUS_EVENTS TABLE
-- ============================================
ALTER TABLE status_events ENABLE ROW LEVEL SECURITY;

-- Service role can manage all status events
CREATE POLICY "Service role can manage status events"
  ON status_events FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- ============================================
-- STATUS_DEFINITIONS TABLE
-- ============================================
ALTER TABLE status_definitions ENABLE ROW LEVEL SECURITY;

-- Everyone can read status definitions (needed to see available statuses)
CREATE POLICY "Anyone can read status definitions"
  ON status_definitions FOR SELECT
  USING (true);

-- Service role can manage all status definitions
CREATE POLICY "Service role can manage status definitions"
  ON status_definitions FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- ============================================
-- MALFUNCTIONS TABLE
-- ============================================
ALTER TABLE malfunctions ENABLE ROW LEVEL SECURITY;

-- Everyone can create and read malfunctions (to report issues)
CREATE POLICY "Anyone can create malfunctions"
  ON malfunctions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can read malfunctions"
  ON malfunctions FOR SELECT
  USING (true);

-- Service role can manage all malfunctions
CREATE POLICY "Service role can manage malfunctions"
  ON malfunctions FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

