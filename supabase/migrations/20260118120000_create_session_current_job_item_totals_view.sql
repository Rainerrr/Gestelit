-- Migration: Create view for session's current job item totals
-- Purpose: Derives totals from status_events for the session's CURRENT job_item_id only
--          (as opposed to v_session_derived_totals which sums across ALL job items)
--
-- This view is used by the active sessions dashboard to show accurate
-- quantities for the job item the worker is currently working on.

CREATE OR REPLACE VIEW public.v_session_current_job_item_totals AS
SELECT
  s.id AS session_id,
  s.job_item_id,
  COALESCE(SUM(se.quantity_good), 0)::INTEGER AS total_good,
  COALESCE(SUM(se.quantity_scrap), 0)::INTEGER AS total_scrap
FROM public.sessions s
LEFT JOIN public.status_events se
  ON se.session_id = s.id
  AND se.job_item_id = s.job_item_id  -- Only count events for current job item
GROUP BY s.id, s.job_item_id;

-- Grant permissions
GRANT SELECT ON public.v_session_current_job_item_totals TO authenticated;
GRANT SELECT ON public.v_session_current_job_item_totals TO service_role;

COMMENT ON VIEW public.v_session_current_job_item_totals IS
  'Derives session totals from SUM(status_events.quantity_*) for the current job_item_id only.
   Use this for active session displays where you want quantities for the current job item,
   not historical totals from previous job items in the same session.';
