BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';
-- Keep master metadata; discover customers and newer names from continuously synced documents.
CREATE OR REPLACE VIEW public.mart_sales_client_directory AS
WITH synced_customers AS (
 SELECT DISTINCT ON (customer_code) * FROM (
  SELECT reporting_customer_code AS customer_code, reporting_customer_name AS customer_name, reporting_created_at AS document_at, synced_at, bina_id FROM public.bina_dfhazmrashi WHERE bina_id NOT LIKE 'QA-%'
  UNION ALL
  SELECT reporting_customer_code, reporting_customer_name, reporting_invoice_at, synced_at, bina_id FROM public.bina_heshbonitrashi
  UNION ALL
  SELECT reporting_customer_code, reporting_customer_name, reporting_delivery_at, synced_at, bina_id FROM public.bina_mishloahrashi
 ) s WHERE customer_code > 0 AND nullif(trim(customer_name), '') IS NOT NULL AND customer_name NOT LIKE '%??%' AND customer_name NOT LIKE '%�%'
 ORDER BY customer_code, document_at DESC NULLS LAST, synced_at DESC, bina_id DESC
), customer_codes AS (
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


-- Lightweight canonical directory for autocomplete and assignment; no invoice aggregates.
CREATE OR REPLACE VIEW public.sales_customer_directory AS
 SELECT d.*, a.sales_user_id AS account_manager_sales_user_id,
 coalesce(a.account_manager_name,d.salesperson) AS account_manager
 FROM public.mart_sales_client_directory d
 LEFT JOIN public.sales_account_assignments a ON a.client_ref=d.client_ref AND a.valid_to IS NULL;
REVOKE ALL ON public.sales_customer_directory FROM anon, authenticated;
GRANT SELECT ON public.sales_customer_directory TO service_role;

-- Explicit, auditable aliases approved by the customer. No fuzzy/first-name matching.
CREATE TABLE IF NOT EXISTS public.sales_owner_aliases (
 source_name text PRIMARY KEY,
 sales_user_id uuid NOT NULL REFERENCES public.sales_users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_owner_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_owner_aliases FROM anon, authenticated;
GRANT ALL ON public.sales_owner_aliases TO service_role;
CREATE POLICY "Service role manages owner aliases" ON public.sales_owner_aliases FOR ALL TO service_role USING (true) WITH CHECK (true);
INSERT INTO public.sales_owner_aliases(source_name,sales_user_id)
SELECT m.source_name,u.id FROM (VALUES
 ('מתי ברגר','Maty Berger'),('עליזה סבג','Aliza Sabag'),('רגב הילת','Hilat Regev'),
 ('יובל קמחי','Yuval Kamhi'),('קמחי יובל','Yuval Kamhi'),('שרה לב','Sara Lev'),('ספי פסו','Sefi Peso')
) m(source_name,portal_name) JOIN public.sales_users u ON u.full_name=m.portal_name AND u.is_active
ON CONFLICT(source_name) DO NOTHING;
UPDATE public.sales_account_assignments a SET sales_user_id=m.sales_user_id,
 reason='Approved full-name identity match, 2026-11-23', ownership_confidence='exact'
FROM public.sales_owner_aliases m
WHERE a.valid_to IS NULL AND a.sales_user_id IS NULL AND trim(a.account_manager_name)=m.source_name;

-- Preserve manual overrides; future master imports resolve the same approved aliases.
CREATE OR REPLACE FUNCTION public.resolve_sales_owner_alias() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.sales_user_id IS NULL AND NEW.ownership_source IN ('bina_index','approved_local') THEN
  SELECT m.sales_user_id INTO NEW.sales_user_id FROM public.sales_owner_aliases m
  JOIN public.sales_users u ON u.id=m.sales_user_id AND u.is_active
  WHERE m.source_name=trim(NEW.account_manager_name);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER resolve_sales_owner_alias BEFORE INSERT OR UPDATE ON public.sales_account_assignments
 FOR EACH ROW EXECUTE FUNCTION public.resolve_sales_owner_alias();

-- Newly created local clients immediately belong to their authenticated creator.
CREATE OR REPLACE FUNCTION public.assign_new_local_sales_client() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.sales_account_assignments(client_ref,local_client_id,sales_user_id,account_manager_name,ownership_source,ownership_confidence,created_by_sales_user_id,reason)
 SELECT 'local:'||NEW.id,NEW.id,u.id,u.full_name,'approved_local','exact',u.id,'Authenticated client creation'
 FROM public.sales_users u WHERE u.id=NEW.created_by_sales_user AND u.is_active;
 RETURN NEW;
END $$;
CREATE TRIGGER assign_new_local_sales_client AFTER INSERT ON public.pending_bina_clients FOR EACH ROW EXECUTE FUNCTION public.assign_new_local_sales_client();

-- One transaction serializes reassignment and preserves the existing assignment history.
CREATE OR REPLACE FUNCTION public.assign_sales_customer(p_client_ref text,p_sales_user_id uuid,p_expected_owner uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c record; u record; prior record; result uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_client_ref,0));
 SELECT * INTO c FROM public.mart_sales_client_directory WHERE client_ref=p_client_ref;
 IF NOT FOUND THEN RAISE EXCEPTION 'SALES_CLIENT_NOT_FOUND'; END IF;
 SELECT * INTO u FROM public.sales_users WHERE id=p_sales_user_id AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'SALES_USER_NOT_FOUND'; END IF;
 SELECT * INTO prior FROM public.sales_account_assignments WHERE client_ref=p_client_ref AND valid_to IS NULL FOR UPDATE;
 IF prior.sales_user_id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'SALES_ASSIGNMENT_CONFLICT'; END IF;
 IF prior.sales_user_id=p_sales_user_id THEN RETURN prior.id; END IF;
 UPDATE public.sales_account_assignments SET valid_to=greatest(clock_timestamp(),valid_from+interval '1 microsecond') WHERE id=prior.id;
 INSERT INTO public.sales_account_assignments(client_ref,customer_code,local_client_id,sales_user_id,account_manager_name,ownership_source,ownership_confidence,reason)
 VALUES(p_client_ref,c.customer_code,c.local_client_id,u.id,u.full_name,'manual','exact','Assigned through admin customer management') RETURNING id INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.assign_sales_customer(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_sales_customer(text,uuid,uuid) TO service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
