-- Migration: Create v_session_wip_accounting view
-- Part of: Production Lines + Job Items + WIP feature (Phase 2.3)
--
-- Helper view for understanding GOOD origin per session.
-- Shows how much was originated at this step vs pulled from upstream.

CREATE OR REPLACE VIEW public.v_session_wip_accounting AS
SELECT
  s.id AS session_id,
  s.job_item_id,
  s.job_item_station_id,
  COALESCE(s.total_good, 0) AS total_good,
  COALESCE(SUM(wc.good_used), 0)::INTEGER AS pulled_good,
  (COALESCE(s.total_good, 0) - COALESCE(SUM(wc.good_used), 0))::INTEGER AS originated_good
FROM public.sessions s
LEFT JOIN public.wip_consumptions wc ON wc.consuming_session_id = s.id
WHERE s.job_item_id IS NOT NULL
GROUP BY s.id, s.job_item_id, s.job_item_station_id, s.total_good;

-- Grant select to authenticated and service roles
GRANT SELECT ON public.v_session_wip_accounting TO authenticated;
GRANT SELECT ON public.v_session_wip_accounting TO service_role;

-- Documentation
COMMENT ON VIEW public.v_session_wip_accounting IS 'Shows how much GOOD each session originated vs pulled from upstream';
COMMENT ON COLUMN public.v_session_wip_accounting.pulled_good IS 'Amount of GOOD consumed from upstream step balance';
COMMENT ON COLUMN public.v_session_wip_accounting.originated_good IS 'Amount of GOOD created at this step (not pulled from upstream)';
