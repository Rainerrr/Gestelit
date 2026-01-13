-- Partial unique index: only one active session per worker
-- This is a defense-in-depth measure - the atomic RPC should prevent duplicates,
-- but this constraint ensures database-level enforcement

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_session_per_worker
ON sessions (worker_id)
WHERE status = 'active' AND ended_at IS NULL;
