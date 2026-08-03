-- Add outcome completeness to the sales logger quality signal. This prevents
-- a dashboard from presenting an apparently perfect win rate when losses are
-- simply not being closed in the logger.

CREATE OR REPLACE VIEW public.mart_sales_data_quality AS
SELECT
  COUNT(*)::integer AS total_count,
  COUNT(*) FILTER (WHERE customer_code IS NOT NULL OR local_client_id IS NOT NULL)::integer AS linked_client_count,
  COUNT(*) FILTER (WHERE estimated_revenue IS NOT NULL OR actual_revenue IS NOT NULL)::integer AS valued_count,
  COUNT(*) FILTER (WHERE contact_person IS NOT NULL AND contact_person <> '')::integer AS contact_count,
  COUNT(*) FILTER (WHERE status IN ('new', 'open', 'follow_up'))::integer AS open_count,
  COUNT(*) FILTER (
    WHERE status IN ('new', 'open', 'follow_up') AND next_action_date IS NOT NULL
  )::integer AS open_with_next_action_count,
  COUNT(*) FILTER (WHERE status IN ('won', 'lost'))::integer AS decided_count,
  COUNT(*) FILTER (WHERE status = 'lost')::integer AS lost_count
FROM public.sales_activity_logs
WHERE event_at >= now() - INTERVAL '90 days';

COMMENT ON VIEW public.mart_sales_data_quality IS 'Trailing 90-day capture and outcome completeness for the sales logger.';
