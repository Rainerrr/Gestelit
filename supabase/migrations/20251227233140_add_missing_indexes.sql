-- Add missing indexes for frequently queried columns
-- These indexes improve performance for dashboard queries and job lookups

-- Sessions table - frequently filtered/joined columns
CREATE INDEX IF NOT EXISTS sessions_current_status_idx ON public.sessions(current_status_id);
CREATE INDEX IF NOT EXISTS sessions_job_idx ON public.sessions(job_id);
CREATE INDEX IF NOT EXISTS sessions_started_at_idx ON public.sessions(started_at);

-- Malfunctions table - status filtering for admin views
CREATE INDEX IF NOT EXISTS malfunctions_status_idx ON public.malfunctions(status);

-- Status definitions - machine_state grouping for KPI calculations
CREATE INDEX IF NOT EXISTS status_definitions_machine_state_idx ON public.status_definitions(machine_state);
