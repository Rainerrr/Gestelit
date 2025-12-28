-- Migrate existing malfunctions to the unified reports table

-- 1. Copy all malfunctions to reports table
INSERT INTO public.reports (
  id,
  type,
  station_id,
  session_id,
  reported_by_worker_id,
  description,
  image_url,
  station_reason_id,
  report_reason_id,
  status,
  status_changed_at,
  status_changed_by,
  admin_notes,
  created_at,
  updated_at
)
SELECT
  id,
  'malfunction'::report_type_enum,
  station_id,
  session_id,
  reported_by_worker_id,
  description,
  image_url,
  station_reason_id,
  NULL,  -- report_reason_id not used for malfunctions
  status::report_status,  -- Cast existing status to enum
  status_changed_at,
  status_changed_by,
  admin_notes,
  created_at,
  updated_at
FROM public.malfunctions;

-- 2. Update status_events.malfunction_id to point to reports table
-- Note: We keep the malfunction_id column name for now, but it now references reports.id
-- A future migration can rename this to report_id if desired

-- 3. Add comment to clarify the relationship
COMMENT ON COLUMN public.status_events.malfunction_id IS 'References reports.id (legacy name, originally for malfunctions only)';
