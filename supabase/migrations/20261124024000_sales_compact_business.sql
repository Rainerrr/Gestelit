BEGIN; SET LOCAL statement_timeout='120s'; SET LOCAL lock_timeout='3s';
LOCK TABLE public.bina_heshbonitrashi IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.bina_projection_customer_invoice_headers ADD COLUMN currency text NOT NULL DEFAULT 'UNKNOWN';
UPDATE public.bina_projection_customer_invoice_headers p SET currency=COALESCE(NULLIF(btrim(r.data->>'MatbeaMatah'),''),'UNKNOWN') FROM public.bina_heshbonitrashi r WHERE r.bina_id=p.bina_id;
CREATE OR REPLACE FUNCTION public.maintain_bina_projection_customer_invoice_headers() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN DELETE FROM public.bina_projection_customer_invoice_headers WHERE bina_id=OLD.bina_id; RETURN OLD; END IF;
 INSERT INTO public.bina_projection_customer_invoice_headers(bina_id, invoice_no, work_year, customer_code, customer_name, invoice_at, due_at, work_order_id, delivery_no, subtotal, vat, total_amount, salesperson, paid_flag, synced_at, currency) SELECT
  NEW.bina_id,
  NEW.reporting_invoice_no AS invoice_no,
  NEW.reporting_work_year AS work_year,
  NEW.reporting_customer_code AS customer_code,
  NEW.reporting_customer_name AS customer_name,
  NEW.reporting_invoice_at AS invoice_at,
  NEW.reporting_due_at AS due_at,
  NEW.reporting_work_order_id AS work_order_id,
  NEW.reporting_delivery_no AS delivery_no,
  NEW.reporting_subtotal AS subtotal,
  NEW.reporting_vat AS vat,
  NEW.reporting_total_amount AS total_amount,
  NEW.reporting_salesperson AS salesperson,
  NEW.reporting_paid_flag AS paid_flag,
  NEW.synced_at,
  COALESCE(NULLIF(btrim(NEW.data->>'MatbeaMatah'),''),'UNKNOWN')
 ON CONFLICT(bina_id) DO UPDATE SET invoice_no=EXCLUDED.invoice_no, work_year=EXCLUDED.work_year, customer_code=EXCLUDED.customer_code, customer_name=EXCLUDED.customer_name, invoice_at=EXCLUDED.invoice_at, due_at=EXCLUDED.due_at, work_order_id=EXCLUDED.work_order_id, delivery_no=EXCLUDED.delivery_no, subtotal=EXCLUDED.subtotal, vat=EXCLUDED.vat, total_amount=EXCLUDED.total_amount, salesperson=EXCLUDED.salesperson, paid_flag=EXCLUDED.paid_flag, synced_at=EXCLUDED.synced_at, currency=EXCLUDED.currency;
 RETURN NEW;
END $fn$;
CREATE OR REPLACE VIEW public.mart_sales_bina_orders AS
SELECT o.bina_id, o.work_order_id AS work_order_id,
 o.customer_code AS customer_code, coalesce(c.customer_name,o.customer_name) AS customer_name,
 o.title AS title,o.received_at AS received_at,
 o.due_at AS due_at,o.status_text AS status_text,
 o.quantity AS quantity,i.customer_group,c.area,
 a.account_manager_name AS account_manager,a.sales_user_id AS account_manager_sales_user_id,o.synced_at
FROM public.bina_projection_work_orders o
LEFT JOIN public.bina_sales_customer_cache c ON c.customer_code=o.customer_code
LEFT JOIN public.bina_client_index i ON i.customer_code=o.customer_code
LEFT JOIN public.sales_account_assignments a ON a.client_ref='bina:'||o.customer_code::text AND a.valid_to IS NULL
WHERE o.bina_id NOT LIKE 'QA-%';

CREATE OR REPLACE VIEW public.mart_sales_bina_invoices AS
SELECT i.bina_id,i.invoice_no AS invoice_no,i.work_year AS work_year,
 i.customer_code AS customer_code,coalesce(c.customer_name,i.customer_name) AS customer_name,
 i.invoice_at AS invoice_at,i.due_at AS due_at,
 i.total_amount AS total_amount,
 i.currency AS currency,
 idx.customer_group,c.area,a.account_manager_name AS account_manager,a.sales_user_id AS account_manager_sales_user_id,i.synced_at
FROM public.bina_projection_customer_invoice_headers i
LEFT JOIN public.bina_sales_customer_cache c ON c.customer_code=i.customer_code
LEFT JOIN public.bina_client_index idx ON idx.customer_code=i.customer_code
LEFT JOIN public.sales_account_assignments a ON a.client_ref='bina:'||i.customer_code::text AND a.valid_to IS NULL;



ANALYZE public.bina_projection_customer_invoice_headers;
COMMIT; NOTIFY pgrst,'reload schema';
