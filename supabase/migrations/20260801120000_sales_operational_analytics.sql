-- Operational sales analytics over user-entered sales logger data.
-- BINA/client directory data is enrichment only; all performance outcomes come
-- from sales_activity_logs. Currency is part of every monetary grain.

CREATE OR REPLACE VIEW public.mart_sales_activity_daily AS
SELECT
  (event_at AT TIME ZONE 'Asia/Jerusalem')::date AS activity_date,
  currency,
  COUNT(*)::integer AS activity_count,
  COUNT(DISTINCT COALESCE(customer_code::text, local_client_id::text, lower(customer_name)))::integer AS unique_clients,
  COUNT(*) FILTER (WHERE status = 'won')::integer AS won_count,
  COUNT(*) FILTER (WHERE status = 'lost')::integer AS lost_count,
  COALESCE(SUM(estimated_revenue) FILTER (WHERE status IN ('new', 'open', 'follow_up')), 0)::numeric AS estimated_pipeline,
  COALESCE(SUM(actual_revenue) FILTER (WHERE status = 'won'), 0)::numeric AS won_revenue
FROM public.sales_activity_logs
GROUP BY (event_at AT TIME ZONE 'Asia/Jerusalem')::date, currency;

CREATE OR REPLACE VIEW public.mart_sales_rep_performance AS
SELECT
  salesperson,
  currency,
  COUNT(*)::integer AS activity_count,
  COUNT(DISTINCT COALESCE(customer_code::text, local_client_id::text, lower(customer_name)))::integer AS unique_clients,
  COUNT(*) FILTER (WHERE status = 'won')::integer AS won_count,
  COUNT(*) FILTER (WHERE status = 'lost')::integer AS lost_count,
  COUNT(*) FILTER (WHERE status IN ('new', 'open', 'follow_up'))::integer AS open_count,
  COUNT(*) FILTER (
    WHERE status = 'follow_up'
      AND next_action_date < (now() AT TIME ZONE 'Asia/Jerusalem')::date
  )::integer AS overdue_followups,
  COALESCE(SUM(estimated_revenue) FILTER (WHERE status IN ('new', 'open', 'follow_up')), 0)::numeric AS estimated_pipeline,
  COALESCE(SUM(actual_revenue) FILTER (WHERE status = 'won'), 0)::numeric AS won_revenue,
  MAX(event_at) AS last_activity_at
FROM public.sales_activity_logs
WHERE event_at >= now() - INTERVAL '90 days'
GROUP BY salesperson, currency;

CREATE OR REPLACE VIEW public.mart_sales_event_mix AS
SELECT
  event_type,
  COUNT(*)::integer AS activity_count,
  COUNT(DISTINCT COALESCE(customer_code::text, local_client_id::text, lower(customer_name)))::integer AS unique_clients,
  COUNT(*) FILTER (WHERE status = 'won')::integer AS won_count
FROM public.sales_activity_logs
WHERE event_at >= now() - INTERVAL '90 days'
GROUP BY event_type;

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

CREATE OR REPLACE VIEW public.mart_sales_icp_segments AS
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
),
enriched AS (
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
  ) d ON TRUE
  WHERE l.event_at >= now() - INTERVAL '180 days'
),
dimensions AS (
  SELECT 'customer_group'::text AS dimension, customer_group AS segment, enriched.* FROM enriched
  UNION ALL
  SELECT 'area'::text AS dimension, area AS segment, enriched.* FROM enriched
)
SELECT
  dimension,
  segment,
  currency,
  COUNT(*)::integer AS activity_count,
  COUNT(DISTINCT client_key)::integer AS unique_clients,
  COUNT(*) FILTER (WHERE status = 'won')::integer AS won_count,
  COUNT(*) FILTER (WHERE status = 'lost')::integer AS lost_count,
  COUNT(*) FILTER (WHERE status IN ('new', 'open', 'follow_up'))::integer AS open_count,
  COALESCE(SUM(actual_revenue) FILTER (WHERE status = 'won'), 0)::numeric AS won_revenue,
  COALESCE(SUM(estimated_revenue) FILTER (WHERE status IN ('new', 'open', 'follow_up')), 0)::numeric AS estimated_pipeline,
  MAX(event_at) AS last_activity_at
FROM dimensions
GROUP BY dimension, segment, currency;

CREATE OR REPLACE VIEW public.mart_sales_opportunity_queue AS
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
),
account_rollup AS (
  SELECT
    COALESCE(l.customer_code::text, l.local_client_id::text, lower(l.customer_name)) AS client_key,
    (ARRAY_AGG(l.customer_name ORDER BY l.event_at DESC))[1] AS customer_name,
    MAX(l.customer_code) AS customer_code,
    (ARRAY_AGG(l.local_client_id ORDER BY l.event_at DESC) FILTER (WHERE l.local_client_id IS NOT NULL))[1] AS local_client_id,
    (ARRAY_AGG(l.salesperson ORDER BY l.event_at DESC))[1] AS salesperson,
    l.currency,
    COUNT(*)::integer AS activity_count,
    COALESCE(SUM(l.estimated_revenue) FILTER (WHERE l.status IN ('new', 'open', 'follow_up')), 0)::numeric AS estimated_pipeline,
    COUNT(*) FILTER (WHERE l.status = 'follow_up' AND l.next_action_date < (now() AT TIME ZONE 'Asia/Jerusalem')::date)::integer AS overdue_followups,
    MIN(l.next_action_date) FILTER (WHERE l.status IN ('new', 'open', 'follow_up')) AS next_action_date,
    MAX(l.event_at) AS last_activity_at,
    (ARRAY_AGG(COALESCE(l.ai_next_action, l.ai_summary, l.raw_note) ORDER BY l.event_at DESC))[1] AS latest_context
  FROM public.sales_activity_logs l
  WHERE l.status IN ('new', 'open', 'follow_up')
  GROUP BY COALESCE(l.customer_code::text, l.local_client_id::text, lower(l.customer_name)), l.currency
)
SELECT
  a.*,
  COALESCE(d.customer_group, 'לא מסווג') AS customer_group,
  COALESCE(d.area, 'לא מסווג') AS area,
  GREATEST(0, (now()::date - a.last_activity_at::date))::integer AS inactive_days,
  (
    LEAST(50, a.overdue_followups * 20)
    + LEAST(30, FLOOR(a.estimated_pipeline / 5000)::integer)
    + LEAST(20, GREATEST(0, (now()::date - a.last_activity_at::date))::integer)
  )::integer AS priority_score
FROM account_rollup a
LEFT JOIN LATERAL (
  SELECT candidate.*
  FROM directory candidate
  WHERE (a.customer_code IS NOT NULL AND candidate.customer_code = a.customer_code)
     OR (a.local_client_id IS NOT NULL AND candidate.local_client_id = a.local_client_id)
     OR (
       a.customer_code IS NULL
       AND a.local_client_id IS NULL
       AND candidate.normalized_name = lower(a.customer_name)
     )
  LIMIT 1
) d ON TRUE;

COMMENT ON VIEW public.mart_sales_activity_daily IS 'Daily, currency-separated outcomes from Gestelit sales logger activity.';
COMMENT ON VIEW public.mart_sales_rep_performance IS 'Trailing 90-day salesperson outcomes from user-entered sales activity.';
COMMENT ON VIEW public.mart_sales_event_mix IS 'Trailing 90-day sales activity mix and resulting wins.';
COMMENT ON VIEW public.mart_sales_data_quality IS 'Trailing 90-day capture completeness for the sales logger.';
COMMENT ON VIEW public.mart_sales_icp_segments IS 'Trailing 180-day outcome evidence by client group and area. Consumers must show sample confidence.';
COMMENT ON VIEW public.mart_sales_opportunity_queue IS 'Open-account queue prioritized by overdue follow-ups, pipeline value, and inactivity.';
