-- Fix job deletion: Allow sessions/reports to become orphaned when job is deleted
-- Sessions and reports are preserved for historical records but lose job/job_item references
--
-- Data flow after fix:
-- jobs (deleted)
--   ↓ CASCADE
-- job_items (deleted)
--   ├── CASCADE → job_item_steps (deleted)
--   │     ├── CASCADE → wip_balances (deleted)
--   │     ├── CASCADE → wip_consumptions (deleted)
--   │     └── SET NULL → sessions.job_item_step_id, status_events.job_item_step_id
--   ├── CASCADE → job_item_progress (deleted)
--   └── SET NULL → sessions.job_item_id, status_events.job_item_id, reports.job_item_id
--
-- sessions (preserved, job_id/job_item_id/job_item_step_id SET NULL)
-- status_events (preserved, job_item references SET NULL)
-- reports (preserved, job_item_id SET NULL)

-- 1. sessions.job_id -> jobs (RESTRICT -> SET NULL)
ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_job_id_fkey;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_job_id_fkey
  FOREIGN KEY (job_id)
  REFERENCES public.jobs(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.sessions.job_id IS
  'Optional - job bound when entering production. SET NULL on job deletion to preserve session history.';

-- 2. sessions.job_item_id -> job_items (NO ACTION -> SET NULL)
ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_job_item_id_fkey;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_job_item_id_fkey
  FOREIGN KEY (job_item_id)
  REFERENCES public.job_items(id)
  ON DELETE SET NULL;

-- 3. sessions.job_item_step_id -> job_item_steps (NO ACTION -> SET NULL)
ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_job_item_station_id_fkey;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_job_item_station_id_fkey
  FOREIGN KEY (job_item_step_id)
  REFERENCES public.job_item_steps(id)
  ON DELETE SET NULL;

-- 4. reports.job_item_id -> job_items (NO ACTION -> SET NULL)
ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_job_item_id_fkey;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_job_item_id_fkey
  FOREIGN KEY (job_item_id)
  REFERENCES public.job_items(id)
  ON DELETE SET NULL;
