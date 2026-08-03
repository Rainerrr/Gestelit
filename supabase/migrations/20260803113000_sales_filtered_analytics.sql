-- Typed enrichment grain used by the filter-aware sales dashboard.
-- The view remains read-only and keeps the activity row as its primary grain.

CREATE OR REPLACE VIEW public.mart_sales_activity_enriched AS
WITH directory AS (
  SELECT DISTINCT ON (client_ref)
    client_ref,
    local_client_id,
    customer_code,
    lower(customer_name) AS normalized_name,
    NULLIF(customer_group, '') AS customer_group,
    NULLIF(area, '') AS area
  FROM public.mart_sales_client_directory
  ORDER BY client_ref, updated_at DESC NULLS LAST
)
SELECT
  l.*,
  COALESCE(d.customer_group, 'לא מסווג') AS customer_group,
  COALESCE(d.area, 'לא מסווג') AS area,
  COALESCE(l.customer_code::text, l.local_client_id::text, lower(l.customer_name)) AS client_key
FROM public.sales_activity_logs l
LEFT JOIN LATERAL (
  SELECT candidate.*
  FROM directory candidate
  WHERE (l.customer_code IS NOT NULL AND candidate.customer_code = l.customer_code)
     OR (l.local_client_id IS NOT NULL AND candidate.local_client_id = l.local_client_id)
     OR (
       l.customer_code IS NULL
       AND l.local_client_id IS NULL
       AND candidate.normalized_name = lower(l.customer_name)
     )
  ORDER BY
    (candidate.customer_code = l.customer_code) DESC NULLS LAST,
    (candidate.local_client_id = l.local_client_id) DESC NULLS LAST
  LIMIT 1
) d ON TRUE;

COMMENT ON VIEW public.mart_sales_activity_enriched IS
  'Read-only sales activity grain enriched with client group and area for filter-aware admin analytics.';

CREATE INDEX IF NOT EXISTS idx_sales_activity_logs_event_salesperson
  ON public.sales_activity_logs (event_at DESC, salesperson);

CREATE INDEX IF NOT EXISTS idx_sales_activity_logs_event_status_type
  ON public.sales_activity_logs (event_at DESC, status, event_type);
