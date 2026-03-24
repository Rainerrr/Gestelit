-- Chunk 7: Remove legacy consumption model objects
-- IMPORTANT: Code must be deployed BEFORE this migration runs.

DO $$
BEGIN
  DROP TABLE IF EXISTS wip_consumptions CASCADE;
  DROP VIEW IF EXISTS v_session_wip_accounting CASCADE;
  DROP FUNCTION IF EXISTS end_production_status_atomic(UUID, UUID, INTEGER, INTEGER, UUID);
  DROP FUNCTION IF EXISTS update_session_quantities_atomic_v2(UUID, INTEGER, INTEGER);
  DROP FUNCTION IF EXISTS update_session_quantities_atomic_v3(UUID, INTEGER, INTEGER);
  DROP FUNCTION IF EXISTS update_session_quantities_atomic_v4(UUID, INTEGER, INTEGER);
  DROP FUNCTION IF EXISTS update_session_quantities_atomic_v5(UUID, INTEGER, INTEGER);
  ALTER TABLE wip_balances DROP COLUMN IF EXISTS good_available;
END $$;
