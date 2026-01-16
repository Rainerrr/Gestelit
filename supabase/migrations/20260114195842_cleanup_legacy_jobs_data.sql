-- Migration: Cleanup Legacy Jobs Data
-- Purpose: Delete all jobs that don't have any job items with pipeline presets
--
-- This removes legacy jobs created before the pipeline preset system was implemented.
-- Jobs are considered "legacy" if they have no job_items OR all their job_items
-- lack a pipeline_preset_id reference.
--
-- ⚠️ WARNING: This migration DELETES DATA PERMANENTLY. Review the affected data first.
--
-- Pre-migration verification queries (run these before applying):
--   -- Jobs to be deleted (no job items with pipeline presets):
--   SELECT j.id, j.job_number, j.customer_name
--   FROM jobs j
--   WHERE NOT EXISTS (
--     SELECT 1 FROM job_items ji
--     WHERE ji.job_id = j.id
--       AND ji.pipeline_preset_id IS NOT NULL
--   );
--
--   -- Count of affected jobs:
--   SELECT COUNT(*) as legacy_jobs_count FROM jobs j
--   WHERE NOT EXISTS (
--     SELECT 1 FROM job_items ji
--     WHERE ji.job_id = j.id
--       AND ji.pipeline_preset_id IS NOT NULL
--   );

BEGIN;

-- ============================================
-- Step 1: Identify legacy jobs (for logging)
-- ============================================
-- Jobs are "legacy" if they have no job items with pipeline_preset_id
DO $$
DECLARE
  v_legacy_job_count INTEGER;
  v_legacy_session_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_legacy_job_count
  FROM jobs j
  WHERE NOT EXISTS (
    SELECT 1 FROM job_items ji
    WHERE ji.job_id = j.id
      AND ji.pipeline_preset_id IS NOT NULL
  );

  SELECT COUNT(*) INTO v_legacy_session_count
  FROM sessions s
  WHERE s.job_id IN (
    SELECT j.id FROM jobs j
    WHERE NOT EXISTS (
      SELECT 1 FROM job_items ji
      WHERE ji.job_id = j.id
        AND ji.pipeline_preset_id IS NOT NULL
    )
  );

  RAISE NOTICE 'Cleaning up % legacy jobs with % associated sessions', v_legacy_job_count, v_legacy_session_count;
END $$;

-- ============================================
-- Step 2: Delete associated status_events
-- ============================================
-- Delete status events for sessions belonging to legacy jobs
DELETE FROM status_events
WHERE session_id IN (
  SELECT s.id FROM sessions s
  WHERE s.job_id IN (
    SELECT j.id FROM jobs j
    WHERE NOT EXISTS (
      SELECT 1 FROM job_items ji
      WHERE ji.job_id = j.id
        AND ji.pipeline_preset_id IS NOT NULL
    )
  )
);

-- ============================================
-- Step 3: Delete associated reports
-- ============================================
-- Delete reports for sessions belonging to legacy jobs
DELETE FROM reports
WHERE session_id IN (
  SELECT s.id FROM sessions s
  WHERE s.job_id IN (
    SELECT j.id FROM jobs j
    WHERE NOT EXISTS (
      SELECT 1 FROM job_items ji
      WHERE ji.job_id = j.id
        AND ji.pipeline_preset_id IS NOT NULL
    )
  )
);

-- Also delete reports linked to legacy job items
DELETE FROM reports
WHERE job_item_id IN (
  SELECT ji.id FROM job_items ji
  WHERE ji.pipeline_preset_id IS NULL
);

-- ============================================
-- Step 4: Delete associated sessions
-- ============================================
DELETE FROM sessions
WHERE job_id IN (
  SELECT j.id FROM jobs j
  WHERE NOT EXISTS (
    SELECT 1 FROM job_items ji
    WHERE ji.job_id = j.id
      AND ji.pipeline_preset_id IS NOT NULL
  )
);

-- Also delete sessions with null job_id (created without job binding)
-- but only if they also have null job_item_id (no pipeline binding)
DELETE FROM sessions
WHERE job_id IS NULL
  AND job_item_id IS NULL;

-- ============================================
-- Step 5: Delete WIP tracking data for legacy items
-- ============================================
-- wip_consumptions cascade from sessions, but clean up orphans
DELETE FROM wip_consumptions
WHERE job_item_id IN (
  SELECT ji.id FROM job_items ji
  WHERE ji.pipeline_preset_id IS NULL
);

DELETE FROM wip_balances
WHERE job_item_id IN (
  SELECT ji.id FROM job_items ji
  WHERE ji.pipeline_preset_id IS NULL
);

-- ============================================
-- Step 6: Delete job_item_progress for legacy items
-- ============================================
DELETE FROM job_item_progress
WHERE job_item_id IN (
  SELECT ji.id FROM job_items ji
  WHERE ji.pipeline_preset_id IS NULL
);

-- ============================================
-- Step 7: Delete job_item_steps for legacy items
-- ============================================
DELETE FROM job_item_steps
WHERE job_item_id IN (
  SELECT ji.id FROM job_items ji
  WHERE ji.pipeline_preset_id IS NULL
);

-- ============================================
-- Step 8: Delete legacy job_items
-- ============================================
DELETE FROM job_items
WHERE pipeline_preset_id IS NULL;

-- ============================================
-- Step 9: Delete legacy jobs
-- ============================================
-- Delete jobs that now have no job items
DELETE FROM jobs
WHERE NOT EXISTS (
  SELECT 1 FROM job_items ji
  WHERE ji.job_id = jobs.id
);

-- ============================================
-- Post-cleanup verification
-- ============================================
DO $$
DECLARE
  v_remaining_legacy_jobs INTEGER;
  v_remaining_legacy_items INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining_legacy_jobs
  FROM jobs j
  WHERE NOT EXISTS (
    SELECT 1 FROM job_items ji
    WHERE ji.job_id = j.id
      AND ji.pipeline_preset_id IS NOT NULL
  );

  SELECT COUNT(*) INTO v_remaining_legacy_items
  FROM job_items
  WHERE pipeline_preset_id IS NULL;

  IF v_remaining_legacy_jobs > 0 OR v_remaining_legacy_items > 0 THEN
    RAISE WARNING 'Cleanup incomplete: % legacy jobs, % legacy items remaining', v_remaining_legacy_jobs, v_remaining_legacy_items;
  ELSE
    RAISE NOTICE 'Legacy cleanup complete: all jobs now have pipeline presets';
  END IF;
END $$;

COMMIT;

-- ============================================
-- Post-migration verification queries:
-- ============================================
-- Run these to verify the cleanup:
--
-- -- Check no legacy jobs remain:
-- SELECT COUNT(*) FROM jobs j
-- WHERE NOT EXISTS (
--   SELECT 1 FROM job_items ji
--   WHERE ji.job_id = j.id AND ji.pipeline_preset_id IS NOT NULL
-- );
--
-- -- Check no legacy job items remain:
-- SELECT COUNT(*) FROM job_items WHERE pipeline_preset_id IS NULL;
--
-- -- Check all remaining jobs have pipeline presets:
-- SELECT j.job_number, ji.name, pp.name as preset_name
-- FROM jobs j
-- JOIN job_items ji ON ji.job_id = j.id
-- LEFT JOIN pipeline_presets pp ON pp.id = ji.pipeline_preset_id
-- ORDER BY j.job_number;
