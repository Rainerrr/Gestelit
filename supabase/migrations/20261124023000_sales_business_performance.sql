BEGIN; SET LOCAL statement_timeout='60s'; SET LOCAL lock_timeout='3s';
ALTER TABLE public.bina_sales_customer_cache ADD COLUMN area text;
CREATE OR REPLACE FUNCTION public.refresh_sales_customer_cache(p_code integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_code IS NULL OR p_code<=0 THEN RETURN; END IF;
 -- Serialize competing source-table updates of the same customer.
 PERFORM pg_advisory_xact_lock(hashtextextended('sales-customer:'||p_code,0));
 INSERT INTO public.bina_sales_customer_cache(customer_code,customer_name,document_at,synced_at,bina_id,area)
 SELECT customer_code,customer_name,document_at,synced_at,bina_id,area FROM (
  SELECT reporting_customer_code AS customer_code,reporting_customer_name AS customer_name,coalesce(reporting_received_at,reporting_created_at) AS document_at,synced_at,bina_id,nullif(trim(data->>'IrLako'),'') AS area FROM public.bina_dfhazmrashi WHERE reporting_customer_code=p_code AND bina_id NOT LIKE 'QA-%'
  UNION ALL SELECT reporting_customer_code,reporting_customer_name,reporting_invoice_at,synced_at,bina_id,nullif(trim(data->>'IrLako'),'') AS area FROM public.bina_heshbonitrashi WHERE reporting_customer_code=p_code
  UNION ALL SELECT reporting_customer_code,reporting_customer_name,reporting_delivery_at,synced_at,bina_id,nullif(trim(data->>'IrLako'),'') AS area FROM public.bina_mishloahrashi WHERE reporting_customer_code=p_code
 ) s WHERE nullif(trim(customer_name),'') IS NOT NULL AND customer_name NOT LIKE '%??%' AND customer_name NOT LIKE '%�%'
 ORDER BY document_at DESC NULLS LAST,synced_at DESC,bina_id DESC LIMIT 1
 ON CONFLICT(customer_code) DO UPDATE SET customer_name=excluded.customer_name,document_at=excluded.document_at,synced_at=excluded.synced_at,bina_id=excluded.bina_id,area=excluded.area;
 IF NOT FOUND THEN DELETE FROM public.bina_sales_customer_cache WHERE customer_code=p_code; END IF;
END $$;
REVOKE ALL ON FUNCTION public.refresh_sales_customer_cache(integer) FROM PUBLIC,anon,authenticated;
UPDATE public.bina_sales_customer_cache c SET area=x.area FROM (
 SELECT DISTINCT ON(customer_code) customer_code,area FROM (
 SELECT reporting_customer_code customer_code,coalesce(reporting_received_at,reporting_created_at) document_at,nullif(trim(data->>'IrLako'),'') area FROM public.bina_dfhazmrashi
 UNION ALL SELECT reporting_customer_code,reporting_invoice_at,nullif(trim(data->>'IrLako'),'') FROM public.bina_heshbonitrashi
 UNION ALL SELECT reporting_customer_code,reporting_delivery_at,nullif(trim(data->>'IrLako'),'') FROM public.bina_mishloahrashi
 ) t WHERE area IS NOT NULL ORDER BY customer_code,document_at DESC NULLS LAST
) x WHERE x.customer_code=c.customer_code;
CREATE OR REPLACE VIEW public.mart_sales_client_directory AS
WITH synced_customers AS (SELECT * FROM public.bina_sales_customer_cache), customer_codes AS (
 SELECT customer_code FROM public.bina_client_index UNION SELECT customer_code FROM synced_customers
)
SELECT
  ('bina:' || k.customer_code::text) AS client_ref,
  NULL::uuid AS local_client_id,
  k.customer_code,
  k.customer_code::text AS customer_code_text,
  CASE WHEN s.document_at > i.source_updated_at OR i.customer_code IS NULL THEN s.customer_name ELSE i.customer_name END AS customer_name,
  i.customer_group,
  i.status,
  s.area AS area,
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
  CASE WHEN i.customer_code IS NULL THEN 'BINA synced documents' ELSE i.source_filename END AS source_filename,
  greatest(i.source_updated_at, s.synced_at) AS source_updated_at,
  coalesce(i.imported_at, s.synced_at) AS imported_at,
  greatest(i.updated_at, s.synced_at) AS updated_at
FROM customer_codes k
LEFT JOIN public.bina_client_index i USING (customer_code)
LEFT JOIN synced_customers s USING (customer_code)
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
      FROM customer_codes imported
      WHERE imported.customer_code = p.bina_customer_code
    )
  );


CREATE OR REPLACE VIEW public.mart_sales_bina_orders AS
SELECT o.bina_id, o.reporting_work_order_id AS work_order_id,
 o.reporting_customer_code AS customer_code, coalesce(c.customer_name,o.reporting_customer_name) AS customer_name,
 o.reporting_title AS title,o.reporting_received_at AS received_at,
 o.reporting_due_at AS due_at,o.reporting_status_text AS status_text,
 o.reporting_quantity AS quantity,i.customer_group,c.area,
 a.account_manager_name AS account_manager,a.sales_user_id AS account_manager_sales_user_id,o.synced_at
FROM public.bina_dfhazmrashi o
LEFT JOIN public.bina_sales_customer_cache c ON c.customer_code=o.reporting_customer_code
LEFT JOIN public.bina_client_index i ON i.customer_code=o.reporting_customer_code
LEFT JOIN public.sales_account_assignments a ON a.client_ref='bina:'||o.reporting_customer_code::text AND a.valid_to IS NULL
WHERE o.bina_id NOT LIKE 'QA-%';

CREATE OR REPLACE VIEW public.mart_sales_bina_invoices AS
SELECT i.bina_id,i.reporting_invoice_no AS invoice_no,i.reporting_work_year AS work_year,
 i.reporting_customer_code AS customer_code,coalesce(c.customer_name,i.reporting_customer_name) AS customer_name,
 i.reporting_invoice_at AS invoice_at,i.reporting_due_at AS due_at,
 i.reporting_total_amount AS total_amount,
 COALESCE(NULLIF(btrim(i.data->>'MatbeaMatah'),''),'UNKNOWN') AS currency,
 idx.customer_group,c.area,a.account_manager_name AS account_manager,a.sales_user_id AS account_manager_sales_user_id,i.synced_at
FROM public.bina_heshbonitrashi i
LEFT JOIN public.bina_sales_customer_cache c ON c.customer_code=i.reporting_customer_code
LEFT JOIN public.bina_client_index idx ON idx.customer_code=i.reporting_customer_code
LEFT JOIN public.sales_account_assignments a ON a.client_ref='bina:'||i.reporting_customer_code::text AND a.valid_to IS NULL;


COMMIT; NOTIFY pgrst,'reload schema';
