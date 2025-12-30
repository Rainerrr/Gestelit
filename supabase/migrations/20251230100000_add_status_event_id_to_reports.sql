-- Add status_event_id FK column to reports table
-- This links a report to the status event during which it was created

ALTER TABLE public.reports
  ADD COLUMN status_event_id UUID REFERENCES public.status_events(id) ON DELETE SET NULL;

-- Index for efficient lookups of reports by status event
CREATE INDEX reports_status_event_id_idx ON public.reports(status_event_id);

COMMENT ON COLUMN public.reports.status_event_id IS
  'Optional link to the status event that was active when this report was created';
