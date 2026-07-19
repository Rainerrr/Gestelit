-- Canonical client index supplied by Gestelit sales operations.
-- This table corrects display names from corrupted BINA payloads without
-- mutating any sync-owned bina_* source table.

CREATE TABLE IF NOT EXISTS public.bina_client_index (
  customer_code integer PRIMARY KEY CHECK (customer_code >= 0),
  customer_code_text text GENERATED ALWAYS AS (customer_code::text) STORED,
  customer_name text NOT NULL CHECK (length(trim(customer_name)) > 0),
  customer_group text,
  status text,
  bookkeeping_no text,
  salesperson text,
  opened_at date,
  source_filename text NOT NULL,
  source_updated_at timestamptz,
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bina_client_index_name
  ON public.bina_client_index (lower(customer_name));
CREATE INDEX IF NOT EXISTS idx_bina_client_index_salesperson
  ON public.bina_client_index (lower(salesperson))
  WHERE salesperson IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bina_client_index_group
  ON public.bina_client_index (lower(customer_group))
  WHERE customer_group IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bina_client_index_status
  ON public.bina_client_index (lower(status))
  WHERE status IS NOT NULL;

ALTER TABLE public.bina_client_index ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bina_client_index_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bina_client_index_set_updated_at ON public.bina_client_index;
CREATE TRIGGER bina_client_index_set_updated_at
  BEFORE UPDATE ON public.bina_client_index
  FOR EACH ROW EXECUTE FUNCTION public.bina_client_index_set_updated_at();

-- The existing production view has a shorter column contract. PostgreSQL does
-- not allow CREATE OR REPLACE VIEW to insert columns before combined_score, so
-- replace this derived view explicitly while leaving all source tables intact.
DROP VIEW IF EXISTS public.mart_sales_client_activity;

CREATE VIEW public.mart_sales_client_activity AS
WITH client_index AS (
  SELECT
    customer_code::text AS customer_key,
    customer_code,
    customer_name,
    customer_group,
    status AS customer_status,
    bookkeeping_no,
    salesperson AS index_salesperson,
    opened_at
  FROM public.bina_client_index
),
bina_sales_raw AS (
  SELECT
    COALESCE(customer_code::text, lower(customer_name)) AS customer_key,
    customer_code,
    customer_name,
    invoice_at,
    total_amount,
    salesperson
  FROM public.mart_bina_sales_status
  WHERE customer_code IS NOT NULL OR customer_name IS NOT NULL
),
bina_sales AS (
  SELECT
    customer_key,
    MAX(customer_code) FILTER (WHERE customer_code IS NOT NULL) AS customer_code,
    COALESCE(
      (ARRAY_AGG(customer_name ORDER BY invoice_at DESC NULLS LAST, customer_name DESC)
        FILTER (WHERE customer_name IS NOT NULL AND customer_name <> ''))[1],
      MAX(customer_name)
    ) AS customer_name,
    COUNT(*)::integer AS invoice_count,
    COALESCE(SUM(total_amount), 0)::numeric AS invoice_revenue,
    MAX(invoice_at) AS last_invoice_at,
    (ARRAY_AGG(salesperson ORDER BY invoice_at DESC NULLS LAST)
      FILTER (WHERE salesperson IS NOT NULL AND salesperson <> ''))[1] AS last_bina_salesperson
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
    (ARRAY_AGG(salesperson ORDER BY event_at DESC NULLS LAST)
      FILTER (WHERE salesperson IS NOT NULL AND salesperson <> ''))[1] AS last_manual_salesperson
  FROM manual_activity_raw
  GROUP BY customer_key
),
customer_keys AS (
  SELECT customer_key FROM client_index
  UNION
  SELECT customer_key FROM bina_sales
  UNION
  SELECT customer_key FROM manual_activity
)
SELECT
  COALESCE(i.customer_code, b.customer_code, a.customer_code) AS customer_code,
  COALESCE(i.customer_name, a.customer_name, b.customer_name) AS customer_name,
  COALESCE(b.invoice_count, 0) AS invoice_count,
  COALESCE(b.invoice_revenue, 0) AS invoice_revenue,
  b.last_invoice_at,
  COALESCE(a.activity_count, 0) AS activity_count,
  COALESCE(a.estimated_pipeline, 0) AS estimated_pipeline,
  a.last_activity_at,
  COALESCE(a.last_manual_salesperson, i.index_salesperson, b.last_bina_salesperson) AS salesperson,
  i.customer_group,
  i.customer_status,
  i.bookkeeping_no,
  i.opened_at,
  CASE
    WHEN i.customer_code IS NOT NULL THEN 'client_index'
    WHEN a.customer_name IS NOT NULL THEN 'manual_activity'
    ELSE 'bina'
  END AS name_source,
  (
    COALESCE(b.invoice_revenue, 0)
    + COALESCE(a.estimated_pipeline, 0)
    + COALESCE(a.won_revenue, 0)
    + (COALESCE(a.activity_count, 0)::numeric * 1000)
    + (COALESCE(b.invoice_count, 0)::numeric * 250)
  ) AS combined_score
FROM customer_keys k
LEFT JOIN client_index i ON i.customer_key = k.customer_key
LEFT JOIN bina_sales b ON b.customer_key = k.customer_key
LEFT JOIN manual_activity a ON a.customer_key = k.customer_key;

COMMENT ON TABLE public.bina_client_index IS
  'Trusted client directory imported from Gestelit sales operations; read-only to application users.';
COMMENT ON VIEW public.mart_sales_client_activity IS
  'Sales and BINA activity enriched with canonical client names and ownership from bina_client_index.';
