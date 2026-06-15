CREATE OR REPLACE VIEW public.mart_sales_client_activity AS
WITH bina_sales AS (
  SELECT
    COALESCE(customer_code::text, lower(customer_name)) AS customer_key,
    customer_code,
    customer_name,
    COUNT(*)::integer AS invoice_count,
    COALESCE(SUM(total_amount), 0)::numeric AS invoice_revenue,
    MAX(invoice_at) AS last_invoice_at,
    MAX(salesperson) FILTER (WHERE salesperson IS NOT NULL AND salesperson <> '') AS last_bina_salesperson
  FROM public.mart_bina_sales_status
  WHERE customer_name IS NOT NULL
  GROUP BY COALESCE(customer_code::text, lower(customer_name)), customer_code, customer_name
),
manual_activity AS (
  SELECT
    COALESCE(customer_code::text, lower(customer_name)) AS customer_key,
    customer_code,
    customer_name,
    COUNT(*)::integer AS activity_count,
    COALESCE(SUM(estimated_revenue), 0)::numeric AS estimated_pipeline,
    MAX(event_at) AS last_activity_at,
    MAX(salesperson) FILTER (WHERE salesperson IS NOT NULL AND salesperson <> '') AS last_manual_salesperson
  FROM public.sales_activity_logs
  GROUP BY COALESCE(customer_code::text, lower(customer_name)), customer_code, customer_name
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
    + (COALESCE(a.activity_count, 0)::numeric * 1000)
    + (COALESCE(b.invoice_count, 0)::numeric * 250)
  ) AS combined_score
FROM customer_keys k
LEFT JOIN bina_sales b ON b.customer_key = k.customer_key
LEFT JOIN manual_activity a ON a.customer_key = k.customer_key;
