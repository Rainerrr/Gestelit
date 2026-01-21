-- Migration: Migrate Production Lines to Pipeline Presets
-- Part of: Job System Overhaul (Phase 5A)
-- Purpose: Convert legacy production_lines to pipeline_presets, migrate job_items to pipeline model
--
-- ⚠️ WARNING: This migration modifies production data. Run against branch project first!
-- Target project ID: yzpwxlgvfkkidjsphfzv

BEGIN;

-- ============================================
-- Step 1: Migrate production_lines → pipeline_presets
-- ============================================

-- Create pipeline presets from production_lines (skip if already exists by id)
INSERT INTO pipeline_presets (id, name, description, is_active, created_at, updated_at)
SELECT
  id,
  name,
  'מועבר מקו ייצור: ' || COALESCE(code, name),
  is_active,
  created_at,
  now()
FROM production_lines
WHERE NOT EXISTS (
  SELECT 1 FROM pipeline_presets WHERE pipeline_presets.id = production_lines.id
);

-- Create pipeline preset steps from production_line_stations
INSERT INTO pipeline_preset_steps (pipeline_preset_id, station_id, position, created_at)
SELECT
  production_line_id,
  station_id,
  position,
  created_at
FROM production_line_stations pls
WHERE NOT EXISTS (
  SELECT 1 FROM pipeline_preset_steps pps
  WHERE pps.pipeline_preset_id = pls.production_line_id
    AND pps.station_id = pls.station_id
);

-- ============================================
-- Step 2: Migrate job_items to pipeline model
-- ============================================

-- Update job_items with kind='line' to kind='pipeline'
-- Also set pipeline_preset_id from production_line_id for provenance
UPDATE job_items
SET
  kind = 'pipeline',
  pipeline_preset_id = production_line_id,
  name = COALESCE(name, (SELECT pl.name FROM production_lines pl WHERE pl.id = production_line_id))
WHERE kind = 'line' AND production_line_id IS NOT NULL;

-- Update job_items with kind='station' to kind='pipeline'
-- These become single-station pipelines
UPDATE job_items
SET
  kind = 'pipeline',
  name = COALESCE(name, (SELECT s.name FROM stations s WHERE s.id = station_id))
WHERE kind = 'station' AND station_id IS NOT NULL;

-- ============================================
-- Step 3: Create job_item_steps for items missing them
-- ============================================

-- For station-type items: create single-step pipeline
INSERT INTO job_item_steps (job_item_id, station_id, position, is_terminal, created_at)
SELECT
  ji.id,
  ji.station_id,
  1,
  true,
  now()
FROM job_items ji
WHERE ji.station_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM job_item_steps jis WHERE jis.job_item_id = ji.id
);

-- For line-type items that were migrated: ensure they have job_item_steps
-- (The rebuild_job_item_stations_from_line RPC should have created these already,
--  but let's ensure they exist)
INSERT INTO job_item_steps (job_item_id, station_id, position, is_terminal, created_at)
SELECT
  ji.id,
  pls.station_id,
  pls.position,
  pls.position = (SELECT MAX(position) FROM production_line_stations WHERE production_line_id = ji.production_line_id),
  now()
FROM job_items ji
INNER JOIN production_line_stations pls ON pls.production_line_id = ji.production_line_id
WHERE ji.production_line_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM job_item_steps jis WHERE jis.job_item_id = ji.id
);

-- ============================================
-- Step 4: Ensure all job_items have names
-- ============================================

-- Update names for any remaining NULL names (should be rare after above updates)
UPDATE job_items ji
SET name = COALESCE(
  ji.name,
  (SELECT pl.name FROM production_lines pl WHERE pl.id = ji.production_line_id),
  (SELECT s.name FROM stations s WHERE s.id = ji.station_id),
  (SELECT pp.name FROM pipeline_presets pp WHERE pp.id = ji.pipeline_preset_id),
  'פריט תהליך'  -- Fallback
)
WHERE ji.name IS NULL;

-- ============================================
-- Step 5: Ensure wip_balances and job_item_progress exist
-- ============================================

-- Create wip_balance rows for job_item_steps that don't have them
INSERT INTO wip_balances (job_item_id, job_item_step_id, good_available, updated_at)
SELECT
  jis.job_item_id,
  jis.id,
  0,
  now()
FROM job_item_steps jis
WHERE NOT EXISTS (
  SELECT 1 FROM wip_balances wb WHERE wb.job_item_step_id = jis.id
);

-- Create job_item_progress rows for job_items that don't have them
INSERT INTO job_item_progress (job_item_id, completed_good, updated_at)
SELECT
  ji.id,
  0,
  now()
FROM job_items ji
WHERE NOT EXISTS (
  SELECT 1 FROM job_item_progress jip WHERE jip.job_item_id = ji.id
);

COMMIT;

-- ============================================
-- Post-migration verification queries
-- ============================================
-- Run these manually to verify the migration:
--
-- Check all job_items have names:
-- SELECT COUNT(*) FROM job_items WHERE name IS NULL;
--
-- Check all job_items have at least one step:
-- SELECT ji.id, ji.name FROM job_items ji
-- WHERE NOT EXISTS (SELECT 1 FROM job_item_steps jis WHERE jis.job_item_id = ji.id);
--
-- Check production_lines were migrated to presets:
-- SELECT COUNT(*) as lines, (SELECT COUNT(*) FROM pipeline_presets) as presets FROM production_lines;
