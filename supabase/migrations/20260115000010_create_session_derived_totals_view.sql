-- Migration: Create view to derive session totals from status_events
-- Part of: Database Cleanup - Remove legacy quantity columns
-- Purpose: Provides backward compatibility before dropping sessions.total_good/total_scrap
--
-- This view derives session totals from SUM(status_events.quantity_good/scrap)
-- instead of relying on the cached columns in sessions table.

CREATE OR REPLACE VIEW public.v_session_derived_totals AS
SELECT
  s.id AS session_id,
  COALESCE(SUM(se.quantity_good), 0)::INTEGER AS total_good,
  COALESCE(SUM(se.quantity_scrap), 0)::INTEGER AS total_scrap
FROM public.sessions s
LEFT JOIN public.status_events se ON se.session_id = s.id
GROUP BY s.id;

-- Grant permissions
GRANT SELECT ON public.v_session_derived_totals TO authenticated;
GRANT SELECT ON public.v_session_derived_totals TO service_role;

COMMENT ON VIEW public.v_session_derived_totals IS
  'Derives session totals from SUM(status_events.quantity_good/scrap). Use this instead of sessions.total_good/scrap columns.';
