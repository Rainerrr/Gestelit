-- BINA-compatible local client onboarding.
-- No write-back is performed in this release. Records are staged locally and
-- exposed through a versioned payload for a future reviewed BINA connector.

CREATE TABLE IF NOT EXISTS public.pending_bina_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bina_customer_code integer UNIQUE,
  customer_name text NOT NULL CHECK (length(trim(customer_name)) >= 2),
  legal_name text,
  customer_group text NOT NULL,
  area text,
  status text NOT NULL DEFAULT 'פעיל',
  customer_warehouse text,
  address_line text,
  neighborhood text,
  city text,
  po_box text,
  postal_code text,
  bookkeeping_no text,
  tax_id text,
  contact_person text,
  phone text,
  mobile text,
  email text,
  salesperson text,
  notes text,
  sync_status text NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'ready', 'synced', 'failed', 'rejected')),
  sync_error text,
  synced_at timestamptz,
  created_by_sales_user uuid NOT NULL REFERENCES public.sales_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_bina_clients_name
  ON public.pending_bina_clients (lower(customer_name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_bina_clients_unique_active_name
  ON public.pending_bina_clients (lower(btrim(customer_name)))
  WHERE sync_status <> 'rejected';
CREATE INDEX IF NOT EXISTS idx_pending_bina_clients_salesperson
  ON public.pending_bina_clients (lower(salesperson))
  WHERE salesperson IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pending_bina_clients_sync_status
  ON public.pending_bina_clients (sync_status, created_at DESC);

ALTER TABLE public.pending_bina_clients ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.pending_bina_clients_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pending_bina_clients_set_updated_at ON public.pending_bina_clients;
CREATE TRIGGER pending_bina_clients_set_updated_at
  BEFORE UPDATE ON public.pending_bina_clients
  FOR EACH ROW EXECUTE FUNCTION public.pending_bina_clients_set_updated_at();

ALTER TABLE public.sales_activity_logs
  ADD COLUMN IF NOT EXISTS local_client_id uuid
  REFERENCES public.pending_bina_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_activity_logs_local_client
  ON public.sales_activity_logs (local_client_id, event_at DESC)
  WHERE local_client_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reconcile_pending_bina_client_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.bina_customer_code IS NOT NULL
    AND NEW.bina_customer_code IS DISTINCT FROM OLD.bina_customer_code THEN
    UPDATE public.sales_activity_logs
    SET customer_code = NEW.bina_customer_code
    WHERE local_client_id = NEW.id
      AND customer_code IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reconcile_pending_bina_client_code ON public.pending_bina_clients;
CREATE TRIGGER reconcile_pending_bina_client_code
  AFTER UPDATE OF bina_customer_code ON public.pending_bina_clients
  FOR EACH ROW EXECUTE FUNCTION public.reconcile_pending_bina_client_code();

CREATE OR REPLACE VIEW public.mart_sales_client_directory AS
SELECT
  ('bina:' || i.customer_code::text) AS client_ref,
  NULL::uuid AS local_client_id,
  i.customer_code,
  i.customer_code_text,
  i.customer_name,
  i.customer_group,
  i.status,
  NULL::text AS area,
  i.bookkeeping_no,
  NULL::text AS tax_id,
  NULL::text AS contact_person,
  NULL::text AS phone,
  NULL::text AS mobile,
  NULL::text AS email,
  i.salesperson,
  i.opened_at,
  'bina_index'::text AS source,
  'synced'::text AS sync_status,
  i.source_filename,
  i.source_updated_at,
  i.imported_at,
  i.updated_at
FROM public.bina_client_index i
UNION ALL
SELECT
  ('local:' || p.id::text) AS client_ref,
  p.id AS local_client_id,
  p.bina_customer_code AS customer_code,
  p.bina_customer_code::text AS customer_code_text,
  p.customer_name,
  p.customer_group,
  p.status,
  p.area,
  p.bookkeeping_no,
  p.tax_id,
  p.contact_person,
  p.phone,
  p.mobile,
  p.email,
  p.salesperson,
  p.created_at::date AS opened_at,
  'local_pending'::text AS source,
  p.sync_status,
  'Gestelit sales portal'::text AS source_filename,
  p.updated_at AS source_updated_at,
  p.created_at AS imported_at,
  p.updated_at
FROM public.pending_bina_clients p
WHERE p.sync_status <> 'rejected'
  AND NOT (
    p.sync_status = 'synced'
    AND p.bina_customer_code IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.bina_client_index imported
      WHERE imported.customer_code = p.bina_customer_code
    )
  );

CREATE OR REPLACE VIEW public.mart_bina_client_writeback_queue AS
SELECT
  p.id,
  p.sync_status,
  p.created_at,
  p.updated_at,
  p.created_by_sales_user,
  jsonb_build_object(
    'schema_version', 1,
    'customer_code', p.bina_customer_code,
    'name', p.customer_name,
    'legal_name', p.legal_name,
    'group', p.customer_group,
    'area', p.area,
    'status', p.status,
    'customer_warehouse', p.customer_warehouse,
    'address', p.address_line,
    'neighborhood', p.neighborhood,
    'city', p.city,
    'po_box', p.po_box,
    'postal_code', p.postal_code,
    'bookkeeping_no', p.bookkeeping_no,
    'tax_id', p.tax_id,
    'contact_person', p.contact_person,
    'phone', p.phone,
    'mobile', p.mobile,
    'email', p.email,
    'salesperson', p.salesperson,
    'notes', p.notes
  ) AS writeback_payload
FROM public.pending_bina_clients p
WHERE p.sync_status IN ('pending', 'ready', 'failed');

CREATE OR REPLACE VIEW public.mart_sales_client_activity AS
WITH directory AS (
  SELECT
    CASE
      WHEN customer_code IS NOT NULL THEN customer_code::text
      ELSE 'local:' || local_client_id::text
    END AS customer_key,
    local_client_id,
    customer_code,
    customer_name,
    customer_group,
    status AS customer_status,
    bookkeeping_no,
    contact_person,
    salesperson AS directory_salesperson,
    opened_at,
    source
  FROM public.mart_sales_client_directory
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
    (ARRAY_AGG(customer_name ORDER BY invoice_at DESC NULLS LAST)
      FILTER (WHERE customer_name IS NOT NULL AND customer_name <> ''))[1] AS customer_name,
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
    COALESCE(customer_code::text, 'local:' || local_client_id::text, lower(customer_name)) AS customer_key,
    local_client_id,
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
    (ARRAY_AGG(local_client_id) FILTER (WHERE local_client_id IS NOT NULL))[1] AS local_client_id,
    MAX(customer_code) FILTER (WHERE customer_code IS NOT NULL) AS customer_code,
    (ARRAY_AGG(customer_name ORDER BY event_at DESC NULLS LAST))[1] AS customer_name,
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
  SELECT customer_key FROM directory
  UNION
  SELECT customer_key FROM bina_sales
  UNION
  SELECT customer_key FROM manual_activity
)
SELECT
  COALESCE(d.customer_code, b.customer_code, a.customer_code) AS customer_code,
  COALESCE(d.customer_name, a.customer_name, b.customer_name) AS customer_name,
  COALESCE(b.invoice_count, 0) AS invoice_count,
  COALESCE(b.invoice_revenue, 0) AS invoice_revenue,
  b.last_invoice_at,
  COALESCE(a.activity_count, 0) AS activity_count,
  COALESCE(a.estimated_pipeline, 0) AS estimated_pipeline,
  a.last_activity_at,
  COALESCE(a.last_manual_salesperson, d.directory_salesperson, b.last_bina_salesperson) AS salesperson,
  d.customer_group,
  d.customer_status,
  d.bookkeeping_no,
  d.opened_at,
  COALESCE(d.source, CASE WHEN a.customer_name IS NOT NULL THEN 'manual_activity' ELSE 'bina' END) AS name_source,
  (
    COALESCE(b.invoice_revenue, 0)
    + COALESCE(a.estimated_pipeline, 0)
    + COALESCE(a.won_revenue, 0)
    + (COALESCE(a.activity_count, 0)::numeric * 1000)
    + (COALESCE(b.invoice_count, 0)::numeric * 250)
  ) AS combined_score,
  COALESCE(d.local_client_id, a.local_client_id) AS local_client_id,
  d.contact_person
FROM customer_keys k
LEFT JOIN directory d ON d.customer_key = k.customer_key
LEFT JOIN bina_sales b ON b.customer_key = k.customer_key
LEFT JOIN manual_activity a ON a.customer_key = k.customer_key;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.search_sales_client_activity(
  p_search text,
  p_limit integer DEFAULT 12
)
RETURNS SETOF public.mart_sales_client_activity
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT activity.*
  FROM public.mart_sales_client_activity activity
  WHERE
    activity.customer_name NOT LIKE '%??%'
    AND (
      NULLIF(trim(p_search), '') IS NULL
      OR activity.customer_name ILIKE ('%' || trim(p_search) || '%')
      OR extensions.similarity(lower(activity.customer_name), lower(trim(p_search))) >= 0.18
    )
  ORDER BY
    CASE
      WHEN lower(activity.customer_name) = lower(trim(p_search)) THEN 0
      WHEN activity.customer_name ILIKE (trim(p_search) || '%') THEN 1
      WHEN activity.customer_name ILIKE ('%' || trim(p_search) || '%') THEN 2
      ELSE 3
    END,
    extensions.similarity(lower(activity.customer_name), lower(trim(p_search))) DESC,
    activity.combined_score DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 12), 1), 30);
$$;

REVOKE ALL ON FUNCTION public.search_sales_client_activity(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_sales_client_activity(text, integer) TO service_role;

COMMENT ON TABLE public.pending_bina_clients IS
  'Locally onboarded clients staged for future reviewed BINA write-back; application is not permitted to write BINA directly.';
COMMENT ON VIEW public.mart_bina_client_writeback_queue IS
  'Versioned logical payload contract for a future BINA connector. Field-to-API mapping must be reviewed before enabling writes.';
COMMENT ON FUNCTION public.search_sales_client_activity(text, integer) IS
  'Ranked Hebrew client-name suggestions for the authenticated sales portal, including typo-tolerant matching.';
