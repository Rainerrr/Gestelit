-- Harden the sales daily log views and constraints after initial rollout.

ALTER TABLE public.sales_activity_logs
  DROP CONSTRAINT IF EXISTS sales_activity_logs_status_check;

ALTER TABLE public.sales_activity_logs
  ADD CONSTRAINT sales_activity_logs_status_check
  CHECK (status IN ('new', 'open', 'follow_up', 'won', 'lost', 'done'));

DO $$
BEGIN
  ALTER TABLE public.sales_activity_logs
    ADD CONSTRAINT sales_activity_logs_estimated_revenue_nonnegative
    CHECK (estimated_revenue IS NULL OR estimated_revenue >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.sales_activity_logs
    ADD CONSTRAINT sales_activity_logs_actual_revenue_nonnegative
    CHECK (actual_revenue IS NULL OR actual_revenue >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE VIEW public.mart_sales_client_activity AS
WITH bina_sales_raw AS (
  SELECT
    COALESCE(customer_code::text, lower(customer_name)) AS customer_key,
    customer_code,
    customer_name,
    invoice_at,
    total_amount,
    salesperson
  FROM public.mart_bina_sales_status
  WHERE customer_name IS NOT NULL
),
bina_sales AS (
  SELECT
    customer_key,
    MAX(customer_code) FILTER (WHERE customer_code IS NOT NULL) AS customer_code,
    COALESCE(
      (ARRAY_AGG(customer_name ORDER BY invoice_at DESC NULLS LAST, customer_name DESC))[1],
      MAX(customer_name)
    ) AS customer_name,
    COUNT(*)::integer AS invoice_count,
    COALESCE(SUM(total_amount), 0)::numeric AS invoice_revenue,
    MAX(invoice_at) AS last_invoice_at,
    (ARRAY_AGG(salesperson ORDER BY invoice_at DESC NULLS LAST) FILTER (WHERE salesperson IS NOT NULL AND salesperson <> ''))[1] AS last_bina_salesperson
  FROM bina_sales_raw
  GROUP BY customer_key
),
manual_activity_raw AS (
  SELECT
    COALESCE(customer_code::text, lower(customer_name)) AS customer_key,
    customer_code,
    customer_name,
    event_at,
    estimated_revenue,
    actual_revenue,
    status,
    salesperson
  FROM public.sales_activity_logs
),
manual_activity AS (
  SELECT
    customer_key,
    MAX(customer_code) FILTER (WHERE customer_code IS NOT NULL) AS customer_code,
    COALESCE(
      (ARRAY_AGG(customer_name ORDER BY event_at DESC NULLS LAST, customer_name DESC))[1],
      MAX(customer_name)
    ) AS customer_name,
    COUNT(*)::integer AS activity_count,
    COALESCE(SUM(estimated_revenue) FILTER (WHERE status IN ('new', 'open', 'follow_up')), 0)::numeric AS estimated_pipeline,
    COALESCE(SUM(actual_revenue) FILTER (WHERE status = 'won'), 0)::numeric AS won_revenue,
    MAX(event_at) AS last_activity_at,
    (ARRAY_AGG(salesperson ORDER BY event_at DESC NULLS LAST) FILTER (WHERE salesperson IS NOT NULL AND salesperson <> ''))[1] AS last_manual_salesperson
  FROM manual_activity_raw
  GROUP BY customer_key
),
customer_keys AS (
  SELECT customer_key FROM bina_sales
  UNION
  SELECT customer_key FROM manual_activity
)
SELECT
  COALESCE(b.customer_code, a.customer_code) AS customer_code,
  COALESCE(b.customer_name, a.customer_name) AS customer_name,
  COALESCE(b.invoice_count, 0) AS invoice_count,
  COALESCE(b.invoice_revenue, 0) AS invoice_revenue,
  b.last_invoice_at,
  COALESCE(a.activity_count, 0) AS activity_count,
  COALESCE(a.estimated_pipeline, 0) AS estimated_pipeline,
  a.last_activity_at,
  COALESCE(a.last_manual_salesperson, b.last_bina_salesperson) AS salesperson,
  (
    COALESCE(b.invoice_revenue, 0)
    + COALESCE(a.estimated_pipeline, 0)
    + COALESCE(a.won_revenue, 0)
    + (COALESCE(a.activity_count, 0)::numeric * 1000)
    + (COALESCE(b.invoice_count, 0)::numeric * 250)
  ) AS combined_score
FROM customer_keys k
LEFT JOIN bina_sales b ON b.customer_key = k.customer_key
LEFT JOIN manual_activity a ON a.customer_key = k.customer_key;

CREATE OR REPLACE VIEW public.mart_sales_dashboard_summary AS
WITH bounds AS (
  SELECT
    (date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') AT TIME ZONE 'Asia/Jerusalem') AS day_start,
    (
      (
        date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem')
        - (EXTRACT(DOW FROM now() AT TIME ZONE 'Asia/Jerusalem')::int * INTERVAL '1 day')
      ) AT TIME ZONE 'Asia/Jerusalem'
    ) AS week_start,
    (date_trunc('month', now() AT TIME ZONE 'Asia/Jerusalem') AT TIME ZONE 'Asia/Jerusalem') AS month_start,
    (date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem'))::date AS today_local
)
SELECT
  COUNT(l.id) FILTER (WHERE l.event_at >= b.day_start)::integer AS today_count,
  COUNT(l.id) FILTER (WHERE l.event_at >= b.week_start)::integer AS week_count,
  COUNT(l.id) FILTER (WHERE l.status = 'follow_up')::integer AS open_followups,
  COUNT(l.id) FILTER (WHERE l.status = 'follow_up' AND l.next_action_date <= b.today_local)::integer AS overdue_followups,
  COALESCE(SUM(l.estimated_revenue) FILTER (WHERE l.event_at >= b.week_start AND l.status IN ('new', 'open', 'follow_up')), 0)::numeric AS estimated_pipeline,
  COALESCE(SUM(l.actual_revenue) FILTER (WHERE l.event_at >= b.week_start AND l.status = 'won'), 0)::numeric AS actual_logged_revenue,
  (
    SELECT COALESCE(SUM(s.total_amount), 0)::numeric
    FROM public.mart_bina_sales_status s
    WHERE s.invoice_at >= b.month_start
  ) AS bina_month_revenue
FROM bounds b
LEFT JOIN public.sales_activity_logs l ON TRUE
GROUP BY b.day_start, b.week_start, b.month_start, b.today_local;

COMMENT ON VIEW public.mart_sales_dashboard_summary IS 'Single-row sales dashboard KPI view using Israel business-day boundaries and uncapped aggregate totals.';
