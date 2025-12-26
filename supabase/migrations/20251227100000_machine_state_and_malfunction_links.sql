-- Migration: Machine State & Malfunction Links
-- Description: Add machine_state enum to status_definitions (replaces is_stoppage),
-- add requires_malfunction_report flag, and link malfunctions to status_events and sessions.

-- ============================================================================
-- STEP 1: Add machine_state column to status_definitions
-- ============================================================================
-- Using TEXT with CHECK constraint (more flexible than ENUM for future migrations)
ALTER TABLE public.status_definitions
  ADD COLUMN IF NOT EXISTS machine_state TEXT
    CHECK (machine_state IN ('production', 'setup', 'stoppage'));

-- Default all existing statuses to 'production' (safe default)
UPDATE public.status_definitions
SET machine_state = 'production'
WHERE machine_state IS NULL;

-- Make machine_state NOT NULL after data migration
ALTER TABLE public.status_definitions
  ALTER COLUMN machine_state SET NOT NULL;

-- ============================================================================
-- STEP 2: Add requires_malfunction_report boolean to status_definitions
-- ============================================================================
ALTER TABLE public.status_definitions
  ADD COLUMN IF NOT EXISTS requires_malfunction_report BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================================
-- STEP 3: Add malfunction_id FK to status_events
-- ============================================================================
-- This links a status event to an optional malfunction report
ALTER TABLE public.status_events
  ADD COLUMN IF NOT EXISTS malfunction_id UUID REFERENCES public.malfunctions(id) ON DELETE SET NULL;

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS status_events_malfunction_id_idx
  ON public.status_events(malfunction_id);

-- ============================================================================
-- STEP 4: Add session_id FK to malfunctions
-- ============================================================================
-- This links a malfunction report to the session where it was created
ALTER TABLE public.malfunctions
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL;

-- Index for efficient session-based queries
CREATE INDEX IF NOT EXISTS malfunctions_session_id_idx
  ON public.malfunctions(session_id);

-- ============================================================================
-- STEP 5: Add comments for documentation
-- ============================================================================
COMMENT ON COLUMN public.status_definitions.machine_state IS
  'Machine state classification: production (active work counting toward output), setup (changeover/preparation time), stoppage (downtime/faults)';

COMMENT ON COLUMN public.status_definitions.requires_malfunction_report IS
  'If true, worker must fill malfunction report when selecting this status';

COMMENT ON COLUMN public.status_events.malfunction_id IS
  'Optional link to malfunction report created when this status event started';

COMMENT ON COLUMN public.malfunctions.session_id IS
  'Optional link to session where this malfunction was reported';
