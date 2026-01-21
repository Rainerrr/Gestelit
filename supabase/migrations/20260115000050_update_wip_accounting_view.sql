-- Migration: Update v_session_wip_accounting to derive totals from status_events
-- Part of: Database Cleanup - Remove legacy quantity columns
-- Purpose: Remove dependency on sessions.total_good/total_scrap columns
--
-- The view now derives total_good/total_scrap from SUM(status_events.quantity_*)
-- instead of reading from sessions columns.

CREATE OR REPLACE VIEW public.v_session_wip_accounting AS
SELECT
  s.id AS session_id,
  s.job_item_id,
  s.job_item_step_id,
  -- Good accounting (now derived from status_events)
  COALESCE(se_totals.total_good, 0)::INTEGER AS total_good,
  COALESCE(good_pulls.pulled, 0)::INTEGER AS pulled_good,
  (COALESCE(se_totals.total_good, 0) - COALESCE(good_pulls.pulled, 0))::INTEGER AS originated_good,
  -- Scrap accounting (now derived from status_events)
  COALESCE(se_totals.total_scrap, 0)::INTEGER AS total_scrap,
  COALESCE(scrap_pulls.pulled, 0)::INTEGER AS pulled_scrap,
  (COALESCE(se_totals.total_scrap, 0) - COALESCE(scrap_pulls.pulled, 0))::INTEGER AS originated_scrap
FROM public.sessions s
-- Derive totals from status_events
LEFT JOIN (
  SELECT
    session_id,
    SUM(COALESCE(quantity_good, 0))::INTEGER AS total_good,
    SUM(COALESCE(quantity_scrap, 0))::INTEGER AS total_scrap
  FROM public.status_events
  GROUP BY session_id
) se_totals ON se_totals.session_id = s.id
-- Good pulls from upstream
LEFT JOIN (
  SELECT consuming_session_id, SUM(good_used)::INTEGER AS pulled
  FROM public.wip_consumptions
  WHERE is_scrap = FALSE
  GROUP BY consuming_session_id
) good_pulls ON good_pulls.consuming_session_id = s.id
-- Scrap pulls from upstream
LEFT JOIN (
  SELECT consuming_session_id, SUM(good_used)::INTEGER AS pulled
  FROM public.wip_consumptions
  WHERE is_scrap = TRUE
  GROUP BY consuming_session_id
) scrap_pulls ON scrap_pulls.consuming_session_id = s.id
WHERE s.job_item_id IS NOT NULL;

-- Grant select to authenticated and service roles
GRANT SELECT ON public.v_session_wip_accounting TO authenticated;
GRANT SELECT ON public.v_session_wip_accounting TO service_role;

-- Documentation
COMMENT ON VIEW public.v_session_wip_accounting IS
  'Shows how much each session originated vs pulled from upstream, separately for good and scrap. v2: totals derived from status_events.';
COMMENT ON COLUMN public.v_session_wip_accounting.pulled_good IS 'Amount of GOOD consumed from upstream step balance';
COMMENT ON COLUMN public.v_session_wip_accounting.originated_good IS 'Amount of GOOD created at this step (not pulled from upstream)';
COMMENT ON COLUMN public.v_session_wip_accounting.pulled_scrap IS 'Amount consumed from upstream that became SCRAP';
COMMENT ON COLUMN public.v_session_wip_accounting.originated_scrap IS 'Amount of SCRAP created at this step (not from upstream)';
