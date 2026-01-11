-- Migration: Change wip_consumptions FK from CASCADE to RESTRICT
-- Prevents session deletion when WIP consumptions exist (preserves WIP balance integrity)

-- Drop existing foreign key constraint
ALTER TABLE wip_consumptions
  DROP CONSTRAINT IF EXISTS wip_consumptions_consuming_session_id_fkey;

-- Add new constraint with RESTRICT behavior
ALTER TABLE wip_consumptions
  ADD CONSTRAINT wip_consumptions_consuming_session_id_fkey
    FOREIGN KEY (consuming_session_id)
    REFERENCES sessions(id)
    ON DELETE RESTRICT;

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT wip_consumptions_consuming_session_id_fkey ON wip_consumptions IS
  'RESTRICT delete: Sessions with WIP consumptions cannot be deleted directly. '
  'This prevents orphaned WIP balance changes. Complete the session properly to handle WIP cleanup.';
