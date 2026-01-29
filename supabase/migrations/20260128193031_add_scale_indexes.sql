-- =====================================================
-- Performance at Scale: Critical Database Indexes
-- Phase P0.1 - Prevent database degradation at 50+ workers
-- =====================================================

-- =====================================================
-- STATUS_EVENTS TABLE - Most critical for scale
-- This table grows fastest (3-5 rows per session)
-- =====================================================

-- Missing FK index - causes full table scans on every dashboard load
-- when joining status_events to status_definitions
CREATE INDEX IF NOT EXISTS idx_status_events_status_def
  ON status_events(status_definition_id);

-- Session timeline queries (dashboard, history views)
-- Supports: ORDER BY created_at DESC WHERE session_id = ?
CREATE INDEX IF NOT EXISTS idx_status_events_session_timeline
  ON status_events(session_id, created_at DESC);

-- Quantity aggregation for job stats RPC
-- Only index rows with actual quantities to keep index small
CREATE INDEX IF NOT EXISTS idx_status_events_quantities
  ON status_events(session_id, quantity_good, quantity_scrap)
  WHERE quantity_good > 0 OR quantity_scrap > 0;

-- Job item step aggregation (for WIP and progress queries)
CREATE INDEX IF NOT EXISTS idx_status_events_step_quantities
  ON status_events(job_item_step_id, quantity_good)
  WHERE job_item_step_id IS NOT NULL AND quantity_good > 0;

-- =====================================================
-- SESSIONS TABLE - Core query patterns
-- =====================================================

-- Active session queries (most common dashboard pattern)
-- Partial index keeps it small - only active sessions
CREATE INDEX IF NOT EXISTS idx_sessions_active_lookup
  ON sessions(status, ended_at, station_id)
  WHERE status = 'active';

-- Historical session queries with date range
-- Supports: WHERE ended_at > ? ORDER BY ended_at DESC
CREATE INDEX IF NOT EXISTS idx_sessions_history
  ON sessions(ended_at DESC, station_id)
  WHERE ended_at IS NOT NULL;

-- Worker session lookup (for grace period recovery)
CREATE INDEX IF NOT EXISTS idx_sessions_worker_active
  ON sessions(worker_id, status, started_at DESC)
  WHERE status = 'active';

-- =====================================================
-- REPORTS TABLE - Dashboard widgets
-- =====================================================

-- Active reports dashboard widget
-- Partial index for only active (non-resolved) reports
CREATE INDEX IF NOT EXISTS idx_reports_active_by_type
  ON reports(type, created_at DESC)
  WHERE status IN ('open', 'known', 'new');

-- Report enrichment queries (join to sessions)
CREATE INDEX IF NOT EXISTS idx_reports_session_type
  ON reports(session_id, type);

-- Station grouping for reports pages
CREATE INDEX IF NOT EXISTS idx_reports_station_type_status
  ON reports(station_id, type, status, created_at DESC);

-- =====================================================
-- NOTIFICATIONS TABLE - Admin notification center
-- Note: Core indexes already exist in create table migration
-- (idx_notifications_created_at, idx_notifications_unread)
-- =====================================================

-- =====================================================
-- JOB ITEMS TABLE - Job selection and progress
-- =====================================================

-- Active job items per job (job management page)
CREATE INDEX IF NOT EXISTS idx_job_items_job_active
  ON job_items(job_id, is_active)
  WHERE is_active = true;

-- =====================================================
-- WIP_BALANCES TABLE - Pipeline flow
-- =====================================================

-- High WIP detection (bottleneck alerts)
CREATE INDEX IF NOT EXISTS idx_wip_high_balance
  ON wip_balances(good_available DESC)
  WHERE good_available > 0;
