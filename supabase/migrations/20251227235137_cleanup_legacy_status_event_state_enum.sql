-- Cleanup legacy status_event_state enum
-- This enum was replaced by the status_definitions table system
-- The enum is no longer used but still exists in the database

-- First, drop any remaining column that uses this enum type
-- (current_status column was replaced by current_status_id in migration 20251212140000)
ALTER TABLE public.sessions DROP COLUMN IF EXISTS current_status;
ALTER TABLE public.status_events DROP COLUMN IF EXISTS status;

-- Now we can safely drop the enum type
DROP TYPE IF EXISTS public.status_event_state CASCADE;
