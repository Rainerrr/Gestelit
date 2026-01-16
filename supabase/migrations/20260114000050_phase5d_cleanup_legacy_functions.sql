-- Migration: Phase 5D - Final Legacy Function Cleanup
-- Purpose: Drop old function versions and create_session_atomic overloads

BEGIN;

-- ============================================
-- Step 1: Drop legacy update_session_quantities_atomic_v2
-- (references dropped job_item_stations table)
-- ============================================
DROP FUNCTION IF EXISTS update_session_quantities_atomic_v2(UUID, INTEGER, INTEGER);

-- ============================================
-- Step 2: Drop old create_session_atomic overloads
-- (have job_item_station_id parameter or text instance_id)
-- ============================================

-- Drop version with text instance_id and job_item_station_id
DROP FUNCTION IF EXISTS create_session_atomic(UUID, UUID, UUID, TEXT, UUID, UUID);

-- Drop version with text instance_id, job_item_station_id, and initial_status_id
DROP FUNCTION IF EXISTS create_session_atomic(UUID, UUID, UUID, TEXT, UUID, UUID, UUID);

-- ============================================
-- Step 3: Verify remaining create_session_atomic is correct
-- (should only have UUID instance_id and job_item_step_id)
-- ============================================

-- The correct version was created in phase5c migration

COMMIT;
