-- Lightweight Gestelit sales activity log.
-- BINA remains the financial source of truth; this table stores human sales
-- touchpoints and AI-assisted summaries owned by Gestelit.

CREATE TABLE IF NOT EXISTS public.sales_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('sale', 'meeting', 'call', 'lead', 'follow_up')),
  event_at timestamptz NOT NULL DEFAULT now(),
  salesperson text NOT NULL,
  customer_name text NOT NULL,
  customer_code integer,
  contact_person text,
  raw_note text NOT NULL,
  ai_summary text,
  ai_next_action text,
  next_action_date date,
  estimated_revenue numeric,
  actual_revenue numeric,
  currency text NOT NULL DEFAULT 'ILS',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('new', 'open', 'follow_up', 'won', 'lost')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'voice', 'ai_assisted')),
  linked_bina_invoice_no integer,
  linked_bina_order_no integer,
  linked_bina_delivery_no integer,
  ai_confidence text CHECK (ai_confidence IN ('low', 'medium', 'high')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_activity_logs_event_at
  ON public.sales_activity_logs(event_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_activity_logs_salesperson
  ON public.sales_activity_logs(salesperson);
CREATE INDEX IF NOT EXISTS idx_sales_activity_logs_customer
  ON public.sales_activity_logs(customer_code, customer_name);
CREATE INDEX IF NOT EXISTS idx_sales_activity_logs_status_next_action
  ON public.sales_activity_logs(status, next_action_date);
CREATE INDEX IF NOT EXISTS idx_sales_activity_logs_event_type
  ON public.sales_activity_logs(event_type);

CREATE OR REPLACE FUNCTION public.sales_activity_logs_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_activity_logs_set_updated_at ON public.sales_activity_logs;
CREATE TRIGGER sales_activity_logs_set_updated_at
  BEFORE UPDATE ON public.sales_activity_logs
  FOR EACH ROW EXECUTE FUNCTION public.sales_activity_logs_set_updated_at();

ALTER TABLE public.sales_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.mart_sales_client_activity AS
WITH bina_sales AS (
  SELECT
    customer_code,
    customer_name,
    COUNT(*)::integer AS invoice_count,
    COALESCE(SUM(total_amount), 0)::numeric AS invoice_revenue,
    MAX(invoice_at) AS last_invoice_at,
    MAX(salesperson) FILTER (WHERE salesperson IS NOT NULL AND salesperson <> '') AS last_bina_salesperson
  FROM public.mart_bina_sales_status
  WHERE customer_name IS NOT NULL
  GROUP BY customer_code, customer_name
),
manual_activity AS (
  SELECT
    customer_code,
    customer_name,
    COUNT(*)::integer AS activity_count,
    COALESCE(SUM(estimated_revenue), 0)::numeric AS estimated_pipeline,
    MAX(event_at) AS last_activity_at,
    MAX(salesperson) FILTER (WHERE salesperson IS NOT NULL AND salesperson <> '') AS last_manual_salesperson
  FROM public.sales_activity_logs
  GROUP BY customer_code, customer_name
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
FROM bina_sales b
FULL OUTER JOIN manual_activity a
  ON (
    b.customer_code IS NOT NULL
    AND a.customer_code IS NOT NULL
    AND b.customer_code = a.customer_code
  )
  OR (
    b.customer_code IS NULL
    AND a.customer_code IS NULL
    AND b.customer_name = a.customer_name
  );

COMMENT ON TABLE public.sales_activity_logs IS 'Gestelit-owned daily sales activity log. Read-only relative to BINA.';
COMMENT ON VIEW public.mart_sales_client_activity IS 'Combined BINA customer revenue and Gestelit manual sales activity for sales prioritization.';
