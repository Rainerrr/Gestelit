BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='120s';
-- Indexed, transactionally refreshed projection prevents each customer search from
-- sorting every historical order, invoice, and delivery (and timing out).
CREATE INDEX IF NOT EXISTS idx_sales_order_customer ON public.bina_dfhazmrashi(reporting_customer_code);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_customer ON public.bina_heshbonitrashi(reporting_customer_code);
CREATE INDEX IF NOT EXISTS idx_sales_delivery_customer ON public.bina_mishloahrashi(reporting_customer_code);
CREATE TABLE public.bina_sales_customer_cache (
 customer_code integer PRIMARY KEY,customer_name text NOT NULL,document_at timestamptz,
 synced_at timestamptz,bina_id text
);
ALTER TABLE public.bina_sales_customer_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bina_sales_customer_cache FROM anon,authenticated;
GRANT SELECT ON public.bina_sales_customer_cache TO service_role;
CREATE OR REPLACE FUNCTION public.refresh_sales_customer_cache(p_code integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_code IS NULL OR p_code<=0 THEN RETURN; END IF;
 -- Serialize competing source-table updates of the same customer.
 PERFORM pg_advisory_xact_lock(hashtextextended('sales-customer:'||p_code,0));
 INSERT INTO public.bina_sales_customer_cache(customer_code,customer_name,document_at,synced_at,bina_id)
 SELECT customer_code,customer_name,document_at,synced_at,bina_id FROM (
  SELECT reporting_customer_code AS customer_code,reporting_customer_name AS customer_name,reporting_created_at AS document_at,synced_at,bina_id FROM public.bina_dfhazmrashi WHERE reporting_customer_code=p_code AND bina_id NOT LIKE 'QA-%'
  UNION ALL SELECT reporting_customer_code,reporting_customer_name,reporting_invoice_at,synced_at,bina_id FROM public.bina_heshbonitrashi WHERE reporting_customer_code=p_code
  UNION ALL SELECT reporting_customer_code,reporting_customer_name,reporting_delivery_at,synced_at,bina_id FROM public.bina_mishloahrashi WHERE reporting_customer_code=p_code
 ) s WHERE nullif(trim(customer_name),'') IS NOT NULL AND customer_name NOT LIKE '%??%' AND customer_name NOT LIKE '%�%'
 ORDER BY document_at DESC NULLS LAST,synced_at DESC,bina_id DESC LIMIT 1
 ON CONFLICT(customer_code) DO UPDATE SET customer_name=excluded.customer_name,document_at=excluded.document_at,synced_at=excluded.synced_at,bina_id=excluded.bina_id;
 IF NOT FOUND THEN DELETE FROM public.bina_sales_customer_cache WHERE customer_code=p_code; END IF;
END $$;
REVOKE ALL ON FUNCTION public.refresh_sales_customer_cache(integer) FROM PUBLIC,anon,authenticated;
-- Once per affected customer per ingestion statement; handles deletes and key corrections too.
CREATE OR REPLACE FUNCTION public.refresh_sales_customer_cache_statement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k integer;
BEGIN
 IF TG_OP='INSERT' THEN
  FOR k IN SELECT DISTINCT reporting_customer_code FROM new_customers ORDER BY reporting_customer_code LOOP PERFORM public.refresh_sales_customer_cache(k); END LOOP;
 ELSIF TG_OP='DELETE' THEN
  FOR k IN SELECT DISTINCT reporting_customer_code FROM old_customers ORDER BY reporting_customer_code LOOP PERFORM public.refresh_sales_customer_cache(k); END LOOP;
 ELSE
  FOR k IN SELECT reporting_customer_code FROM new_customers UNION SELECT reporting_customer_code FROM old_customers ORDER BY reporting_customer_code LOOP PERFORM public.refresh_sales_customer_cache(k); END LOOP;
 END IF;
 RETURN NULL;
END $$;
INSERT INTO public.bina_sales_customer_cache 
 SELECT DISTINCT ON (customer_code) * FROM (
  SELECT reporting_customer_code AS customer_code, reporting_customer_name AS customer_name, reporting_created_at AS document_at, synced_at, bina_id FROM public.bina_dfhazmrashi WHERE bina_id NOT LIKE 'QA-%'
  UNION ALL
  SELECT reporting_customer_code, reporting_customer_name, reporting_invoice_at, synced_at, bina_id FROM public.bina_heshbonitrashi
  UNION ALL
  SELECT reporting_customer_code, reporting_customer_name, reporting_delivery_at, synced_at, bina_id FROM public.bina_mishloahrashi
 ) s WHERE customer_code > 0 AND nullif(trim(customer_name), '') IS NOT NULL AND customer_name NOT LIKE '%??%' AND customer_name NOT LIKE '%�%'
 ORDER BY customer_code, document_at DESC NULLS LAST, synced_at DESC, bina_id DESC
;
CREATE TRIGGER sales_customer_cache_insert AFTER INSERT ON public.bina_dfhazmrashi REFERENCING NEW TABLE AS new_customers FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_sales_customer_cache_statement();
CREATE TRIGGER sales_customer_cache_update AFTER UPDATE ON public.bina_dfhazmrashi REFERENCING OLD TABLE AS old_customers NEW TABLE AS new_customers FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_sales_customer_cache_statement();
CREATE TRIGGER sales_customer_cache_delete AFTER DELETE ON public.bina_dfhazmrashi REFERENCING OLD TABLE AS old_customers FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_sales_customer_cache_statement();
CREATE TRIGGER sales_customer_cache_insert AFTER INSERT ON public.bina_heshbonitrashi REFERENCING NEW TABLE AS new_customers FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_sales_customer_cache_statement();
CREATE TRIGGER sales_customer_cache_update AFTER UPDATE ON public.bina_heshbonitrashi REFERENCING OLD TABLE AS old_customers NEW TABLE AS new_customers FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_sales_customer_cache_statement();
CREATE TRIGGER sales_customer_cache_delete AFTER DELETE ON public.bina_heshbonitrashi REFERENCING OLD TABLE AS old_customers FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_sales_customer_cache_statement();
CREATE TRIGGER sales_customer_cache_insert AFTER INSERT ON public.bina_mishloahrashi REFERENCING NEW TABLE AS new_customers FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_sales_customer_cache_statement();
CREATE TRIGGER sales_customer_cache_update AFTER UPDATE ON public.bina_mishloahrashi REFERENCING OLD TABLE AS old_customers NEW TABLE AS new_customers FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_sales_customer_cache_statement();
CREATE TRIGGER sales_customer_cache_delete AFTER DELETE ON public.bina_mishloahrashi REFERENCING OLD TABLE AS old_customers FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_sales_customer_cache_statement();
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


COMMIT;
NOTIFY pgrst,'reload schema';
