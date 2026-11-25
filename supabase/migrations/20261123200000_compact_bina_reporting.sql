-- Exact compact projections maintained atomically with raw sync writes. No delayed refresh.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='120s';
LOCK TABLE public.bina_dfhazmrashi IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.bina_projection_work_orders AS SELECT * FROM public.stg_bina_work_orders WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bina_projection_work_orders_pk ON public.bina_projection_work_orders(bina_id);
ALTER TABLE public.bina_projection_work_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bina_projection_work_orders FROM anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.bina_projection_work_orders TO service_role;
INSERT INTO public.bina_projection_work_orders SELECT * FROM public.stg_bina_work_orders ON CONFLICT(bina_id) DO UPDATE SET work_order_id=EXCLUDED.work_order_id, customer_name=EXCLUDED.customer_name, customer_code=EXCLUDED.customer_code, title=EXCLUDED.title, customer_order_ref=EXCLUDED.customer_order_ref, status_code=EXCLUDED.status_code, status_text=EXCLUDED.status_text, quantity=EXCLUDED.quantity, created_at=EXCLUDED.created_at, due_at=EXCLUDED.due_at, source_updated_at=EXCLUDED.source_updated_at, synced_at=EXCLUDED.synced_at, received_at=EXCLUDED.received_at;
DO $check$ BEGIN
 IF EXISTS ((SELECT * FROM public.stg_bina_work_orders EXCEPT SELECT * FROM public.bina_projection_work_orders) UNION ALL (SELECT * FROM public.bina_projection_work_orders EXCEPT SELECT * FROM public.stg_bina_work_orders)) THEN RAISE EXCEPTION 'Compact projection mismatch: stg_bina_work_orders'; END IF;
END $check$;
CREATE OR REPLACE FUNCTION public.maintain_bina_projection_work_orders() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN DELETE FROM public.bina_projection_work_orders WHERE bina_id=OLD.bina_id; RETURN OLD; END IF;
 INSERT INTO public.bina_projection_work_orders(bina_id, work_order_id, customer_name, customer_code, title, customer_order_ref, status_code, status_text, quantity, created_at, due_at, source_updated_at, synced_at, received_at) SELECT
  NEW.bina_id,
  NEW.reporting_work_order_id AS work_order_id,
  NEW.reporting_customer_name AS customer_name,
  NEW.reporting_customer_code AS customer_code,
  NEW.reporting_title AS title,
  NEW.reporting_customer_order_ref AS customer_order_ref,
  NEW.reporting_status_code AS status_code,
  NEW.reporting_status_text AS status_text,
  NEW.reporting_quantity AS quantity,
  NEW.reporting_created_at AS created_at,
  NEW.reporting_due_at AS due_at,
  public.bina_json_timestamptz(NEW.source_updated_at::text) AS source_updated_at,
  NEW.synced_at,
  NEW.reporting_received_at AS received_at
 ON CONFLICT(bina_id) DO UPDATE SET work_order_id=EXCLUDED.work_order_id, customer_name=EXCLUDED.customer_name, customer_code=EXCLUDED.customer_code, title=EXCLUDED.title, customer_order_ref=EXCLUDED.customer_order_ref, status_code=EXCLUDED.status_code, status_text=EXCLUDED.status_text, quantity=EXCLUDED.quantity, created_at=EXCLUDED.created_at, due_at=EXCLUDED.due_at, source_updated_at=EXCLUDED.source_updated_at, synced_at=EXCLUDED.synced_at, received_at=EXCLUDED.received_at;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.maintain_bina_projection_work_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maintain_bina_projection_work_orders() TO service_role;
DROP TRIGGER IF EXISTS sync_compact_projection ON public.bina_dfhazmrashi;
CREATE TRIGGER sync_compact_projection AFTER INSERT OR UPDATE OR DELETE ON public.bina_dfhazmrashi FOR EACH ROW EXECUTE FUNCTION public.maintain_bina_projection_work_orders();
CREATE OR REPLACE VIEW public.stg_bina_work_orders AS SELECT bina_id, work_order_id, customer_name, customer_code, title, customer_order_ref, status_code, status_text, quantity, created_at, due_at, source_updated_at, synced_at, received_at FROM public.bina_projection_work_orders;
CREATE INDEX IF NOT EXISTS idx_bina_projection_work_orders_work_order_id ON public.bina_projection_work_orders (work_order_id);
CREATE INDEX IF NOT EXISTS idx_bina_projection_work_orders_due_at ON public.bina_projection_work_orders (due_at);
CREATE INDEX IF NOT EXISTS idx_bina_projection_work_orders_synced_at ON public.bina_projection_work_orders (synced_at);
CREATE INDEX IF NOT EXISTS idx_bina_projection_work_orders_received_at ON public.bina_projection_work_orders (received_at);
ANALYZE public.bina_projection_work_orders;
COMMIT;

BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='120s';
LOCK TABLE public.bina_bakashanigrar IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.bina_projection_purchase_request_lines AS SELECT * FROM public.stg_bina_purchase_request_lines WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bina_projection_purchase_request_lines_pk ON public.bina_projection_purchase_request_lines(bina_id);
ALTER TABLE public.bina_projection_purchase_request_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bina_projection_purchase_request_lines FROM anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.bina_projection_purchase_request_lines TO service_role;
INSERT INTO public.bina_projection_purchase_request_lines SELECT * FROM public.stg_bina_purchase_request_lines ON CONFLICT(bina_id) DO UPDATE SET request_line_id=EXCLUDED.request_line_id, item_code=EXCLUDED.item_code, item_name=EXCLUDED.item_name, supplier_code=EXCLUDED.supplier_code, supplier_name=EXCLUDED.supplier_name, quantity=EXCLUDED.quantity, remaining_quantity=EXCLUDED.remaining_quantity, unit_price=EXCLUDED.unit_price, total_amount=EXCLUDED.total_amount, currency=EXCLUDED.currency, work_year=EXCLUDED.work_year, warehouse=EXCLUDED.warehouse, synced_at=EXCLUDED.synced_at;
DO $check$ BEGIN
 IF EXISTS ((SELECT * FROM public.stg_bina_purchase_request_lines EXCEPT SELECT * FROM public.bina_projection_purchase_request_lines) UNION ALL (SELECT * FROM public.bina_projection_purchase_request_lines EXCEPT SELECT * FROM public.stg_bina_purchase_request_lines)) THEN RAISE EXCEPTION 'Compact projection mismatch: stg_bina_purchase_request_lines'; END IF;
END $check$;
CREATE OR REPLACE FUNCTION public.maintain_bina_projection_purchase_request_lines() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN DELETE FROM public.bina_projection_purchase_request_lines WHERE bina_id=OLD.bina_id; RETURN OLD; END IF;
 INSERT INTO public.bina_projection_purchase_request_lines(bina_id, request_line_id, item_code, item_name, supplier_code, supplier_name, quantity, remaining_quantity, unit_price, total_amount, currency, work_year, warehouse, synced_at) SELECT
  NEW.bina_id,
  NEW.reporting_request_line_id AS request_line_id,
  NEW.reporting_item_code AS item_code,
  NEW.reporting_item_name AS item_name,
  NEW.reporting_supplier_code AS supplier_code,
  NEW.reporting_supplier_name AS supplier_name,
  NEW.reporting_quantity AS quantity,
  NEW.reporting_remaining_quantity AS remaining_quantity,
  NEW.reporting_unit_price AS unit_price,
  NEW.reporting_total_amount AS total_amount,
  NEW.reporting_currency AS currency,
  NEW.reporting_work_year AS work_year,
  NEW.reporting_warehouse AS warehouse,
  NEW.synced_at
 ON CONFLICT(bina_id) DO UPDATE SET request_line_id=EXCLUDED.request_line_id, item_code=EXCLUDED.item_code, item_name=EXCLUDED.item_name, supplier_code=EXCLUDED.supplier_code, supplier_name=EXCLUDED.supplier_name, quantity=EXCLUDED.quantity, remaining_quantity=EXCLUDED.remaining_quantity, unit_price=EXCLUDED.unit_price, total_amount=EXCLUDED.total_amount, currency=EXCLUDED.currency, work_year=EXCLUDED.work_year, warehouse=EXCLUDED.warehouse, synced_at=EXCLUDED.synced_at;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.maintain_bina_projection_purchase_request_lines() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maintain_bina_projection_purchase_request_lines() TO service_role;
DROP TRIGGER IF EXISTS sync_compact_projection ON public.bina_bakashanigrar;
CREATE TRIGGER sync_compact_projection AFTER INSERT OR UPDATE OR DELETE ON public.bina_bakashanigrar FOR EACH ROW EXECUTE FUNCTION public.maintain_bina_projection_purchase_request_lines();
CREATE OR REPLACE VIEW public.stg_bina_purchase_request_lines AS SELECT bina_id, request_line_id, item_code, item_name, supplier_code, supplier_name, quantity, remaining_quantity, unit_price, total_amount, currency, work_year, warehouse, synced_at FROM public.bina_projection_purchase_request_lines;
CREATE INDEX IF NOT EXISTS idx_bina_projection_purchase_request_lines_item_code ON public.bina_projection_purchase_request_lines (item_code);
CREATE INDEX IF NOT EXISTS idx_bina_projection_purchase_request_lines_supplier_code ON public.bina_projection_purchase_request_lines (supplier_code);
CREATE INDEX IF NOT EXISTS idx_bina_projection_purchase_request_lines_synced_at ON public.bina_projection_purchase_request_lines (synced_at);
ANALYZE public.bina_projection_purchase_request_lines;
COMMIT;

BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='120s';
LOCK TABLE public.bina_tovinrashi IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.bina_projection_goods_receipts AS SELECT * FROM public.stg_bina_goods_receipts WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bina_projection_goods_receipts_pk ON public.bina_projection_goods_receipts(bina_id);
ALTER TABLE public.bina_projection_goods_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bina_projection_goods_receipts FROM anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.bina_projection_goods_receipts TO service_role;
INSERT INTO public.bina_projection_goods_receipts SELECT * FROM public.stg_bina_goods_receipts ON CONFLICT(bina_id) DO UPDATE SET goods_receipt_no=EXCLUDED.goods_receipt_no, work_year=EXCLUDED.work_year, supplier_code=EXCLUDED.supplier_code, supplier_name=EXCLUDED.supplier_name, receipt_at=EXCLUDED.receipt_at, due_at=EXCLUDED.due_at, work_order_id=EXCLUDED.work_order_id, total_amount=EXCLUDED.total_amount, status_text=EXCLUDED.status_text, synced_at=EXCLUDED.synced_at;
DO $check$ BEGIN
 IF EXISTS ((SELECT * FROM public.stg_bina_goods_receipts EXCEPT SELECT * FROM public.bina_projection_goods_receipts) UNION ALL (SELECT * FROM public.bina_projection_goods_receipts EXCEPT SELECT * FROM public.stg_bina_goods_receipts)) THEN RAISE EXCEPTION 'Compact projection mismatch: stg_bina_goods_receipts'; END IF;
END $check$;
CREATE OR REPLACE FUNCTION public.maintain_bina_projection_goods_receipts() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN DELETE FROM public.bina_projection_goods_receipts WHERE bina_id=OLD.bina_id; RETURN OLD; END IF;
 INSERT INTO public.bina_projection_goods_receipts(bina_id, goods_receipt_no, work_year, supplier_code, supplier_name, receipt_at, due_at, work_order_id, total_amount, status_text, synced_at) SELECT
  NEW.bina_id,
  NEW.reporting_goods_receipt_no AS goods_receipt_no,
  NEW.reporting_work_year AS work_year,
  NEW.reporting_supplier_code AS supplier_code,
  NEW.reporting_supplier_name AS supplier_name,
  NEW.reporting_receipt_at AS receipt_at,
  NEW.reporting_due_at AS due_at,
  NEW.reporting_work_order_id AS work_order_id,
  NEW.reporting_total_amount AS total_amount,
  NEW.reporting_status_text AS status_text,
  NEW.synced_at
 ON CONFLICT(bina_id) DO UPDATE SET goods_receipt_no=EXCLUDED.goods_receipt_no, work_year=EXCLUDED.work_year, supplier_code=EXCLUDED.supplier_code, supplier_name=EXCLUDED.supplier_name, receipt_at=EXCLUDED.receipt_at, due_at=EXCLUDED.due_at, work_order_id=EXCLUDED.work_order_id, total_amount=EXCLUDED.total_amount, status_text=EXCLUDED.status_text, synced_at=EXCLUDED.synced_at;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.maintain_bina_projection_goods_receipts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maintain_bina_projection_goods_receipts() TO service_role;
DROP TRIGGER IF EXISTS sync_compact_projection ON public.bina_tovinrashi;
CREATE TRIGGER sync_compact_projection AFTER INSERT OR UPDATE OR DELETE ON public.bina_tovinrashi FOR EACH ROW EXECUTE FUNCTION public.maintain_bina_projection_goods_receipts();
CREATE OR REPLACE VIEW public.stg_bina_goods_receipts AS SELECT bina_id, goods_receipt_no, work_year, supplier_code, supplier_name, receipt_at, due_at, work_order_id, total_amount, status_text, synced_at FROM public.bina_projection_goods_receipts;
CREATE INDEX IF NOT EXISTS idx_bina_projection_goods_receipts_supplier_code ON public.bina_projection_goods_receipts (supplier_code);
CREATE INDEX IF NOT EXISTS idx_bina_projection_goods_receipts_receipt_at ON public.bina_projection_goods_receipts (receipt_at);
CREATE INDEX IF NOT EXISTS idx_bina_projection_goods_receipts_due_at ON public.bina_projection_goods_receipts (due_at);
CREATE INDEX IF NOT EXISTS idx_bina_projection_goods_receipts_work_order_id ON public.bina_projection_goods_receipts (work_order_id);
CREATE INDEX IF NOT EXISTS idx_bina_projection_goods_receipts_synced_at ON public.bina_projection_goods_receipts (synced_at);
ANALYZE public.bina_projection_goods_receipts;
COMMIT;

BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='120s';
LOCK TABLE public.bina_heshsapakrashi IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.bina_projection_supplier_invoice_headers AS SELECT * FROM public.stg_bina_supplier_invoice_headers WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bina_projection_supplier_invoice_headers_pk ON public.bina_projection_supplier_invoice_headers(bina_id);
ALTER TABLE public.bina_projection_supplier_invoice_headers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bina_projection_supplier_invoice_headers FROM anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.bina_projection_supplier_invoice_headers TO service_role;
INSERT INTO public.bina_projection_supplier_invoice_headers SELECT * FROM public.stg_bina_supplier_invoice_headers ON CONFLICT(bina_id) DO UPDATE SET supplier_invoice_no=EXCLUDED.supplier_invoice_no, work_year=EXCLUDED.work_year, supplier_code=EXCLUDED.supplier_code, supplier_name=EXCLUDED.supplier_name, invoice_at=EXCLUDED.invoice_at, due_at=EXCLUDED.due_at, subtotal=EXCLUDED.subtotal, vat=EXCLUDED.vat, total_amount=EXCLUDED.total_amount, currency=EXCLUDED.currency, email=EXCLUDED.email, synced_at=EXCLUDED.synced_at;
DO $check$ BEGIN
 IF EXISTS ((SELECT * FROM public.stg_bina_supplier_invoice_headers EXCEPT SELECT * FROM public.bina_projection_supplier_invoice_headers) UNION ALL (SELECT * FROM public.bina_projection_supplier_invoice_headers EXCEPT SELECT * FROM public.stg_bina_supplier_invoice_headers)) THEN RAISE EXCEPTION 'Compact projection mismatch: stg_bina_supplier_invoice_headers'; END IF;
END $check$;
CREATE OR REPLACE FUNCTION public.maintain_bina_projection_supplier_invoice_headers() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN DELETE FROM public.bina_projection_supplier_invoice_headers WHERE bina_id=OLD.bina_id; RETURN OLD; END IF;
 INSERT INTO public.bina_projection_supplier_invoice_headers(bina_id, supplier_invoice_no, work_year, supplier_code, supplier_name, invoice_at, due_at, subtotal, vat, total_amount, currency, email, synced_at) SELECT
  NEW.bina_id,
  NEW.reporting_supplier_invoice_no AS supplier_invoice_no,
  NEW.reporting_work_year AS work_year,
  NEW.reporting_supplier_code AS supplier_code,
  NEW.reporting_supplier_name AS supplier_name,
  NEW.reporting_invoice_at AS invoice_at,
  NEW.reporting_due_at AS due_at,
  NEW.reporting_subtotal AS subtotal,
  NEW.reporting_vat AS vat,
  NEW.reporting_total_amount AS total_amount,
  NEW.reporting_currency AS currency,
  NEW.reporting_email AS email,
  NEW.synced_at
 ON CONFLICT(bina_id) DO UPDATE SET supplier_invoice_no=EXCLUDED.supplier_invoice_no, work_year=EXCLUDED.work_year, supplier_code=EXCLUDED.supplier_code, supplier_name=EXCLUDED.supplier_name, invoice_at=EXCLUDED.invoice_at, due_at=EXCLUDED.due_at, subtotal=EXCLUDED.subtotal, vat=EXCLUDED.vat, total_amount=EXCLUDED.total_amount, currency=EXCLUDED.currency, email=EXCLUDED.email, synced_at=EXCLUDED.synced_at;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.maintain_bina_projection_supplier_invoice_headers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maintain_bina_projection_supplier_invoice_headers() TO service_role;
DROP TRIGGER IF EXISTS sync_compact_projection ON public.bina_heshsapakrashi;
CREATE TRIGGER sync_compact_projection AFTER INSERT OR UPDATE OR DELETE ON public.bina_heshsapakrashi FOR EACH ROW EXECUTE FUNCTION public.maintain_bina_projection_supplier_invoice_headers();
CREATE OR REPLACE VIEW public.stg_bina_supplier_invoice_headers AS SELECT bina_id, supplier_invoice_no, work_year, supplier_code, supplier_name, invoice_at, due_at, subtotal, vat, total_amount, currency, email, synced_at FROM public.bina_projection_supplier_invoice_headers;
CREATE INDEX IF NOT EXISTS idx_bina_projection_supplier_invoice_headers_supplier_code ON public.bina_projection_supplier_invoice_headers (supplier_code);
CREATE INDEX IF NOT EXISTS idx_bina_projection_supplier_invoice_headers_invoice_at ON public.bina_projection_supplier_invoice_headers (invoice_at);
CREATE INDEX IF NOT EXISTS idx_bina_projection_supplier_invoice_headers_due_at ON public.bina_projection_supplier_invoice_headers (due_at);
CREATE INDEX IF NOT EXISTS idx_bina_projection_supplier_invoice_headers_synced_at ON public.bina_projection_supplier_invoice_headers (synced_at);
ANALYZE public.bina_projection_supplier_invoice_headers;
COMMIT;

BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='120s';
LOCK TABLE public.bina_heshbonitrashi IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.bina_projection_customer_invoice_headers AS SELECT * FROM public.stg_bina_customer_invoice_headers WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bina_projection_customer_invoice_headers_pk ON public.bina_projection_customer_invoice_headers(bina_id);
ALTER TABLE public.bina_projection_customer_invoice_headers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bina_projection_customer_invoice_headers FROM anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.bina_projection_customer_invoice_headers TO service_role;
INSERT INTO public.bina_projection_customer_invoice_headers SELECT * FROM public.stg_bina_customer_invoice_headers ON CONFLICT(bina_id) DO UPDATE SET invoice_no=EXCLUDED.invoice_no, work_year=EXCLUDED.work_year, customer_code=EXCLUDED.customer_code, customer_name=EXCLUDED.customer_name, invoice_at=EXCLUDED.invoice_at, due_at=EXCLUDED.due_at, work_order_id=EXCLUDED.work_order_id, delivery_no=EXCLUDED.delivery_no, subtotal=EXCLUDED.subtotal, vat=EXCLUDED.vat, total_amount=EXCLUDED.total_amount, salesperson=EXCLUDED.salesperson, paid_flag=EXCLUDED.paid_flag, synced_at=EXCLUDED.synced_at;
DO $check$ BEGIN
 IF EXISTS ((SELECT * FROM public.stg_bina_customer_invoice_headers EXCEPT SELECT * FROM public.bina_projection_customer_invoice_headers) UNION ALL (SELECT * FROM public.bina_projection_customer_invoice_headers EXCEPT SELECT * FROM public.stg_bina_customer_invoice_headers)) THEN RAISE EXCEPTION 'Compact projection mismatch: stg_bina_customer_invoice_headers'; END IF;
END $check$;
CREATE OR REPLACE FUNCTION public.maintain_bina_projection_customer_invoice_headers() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN DELETE FROM public.bina_projection_customer_invoice_headers WHERE bina_id=OLD.bina_id; RETURN OLD; END IF;
 INSERT INTO public.bina_projection_customer_invoice_headers(bina_id, invoice_no, work_year, customer_code, customer_name, invoice_at, due_at, work_order_id, delivery_no, subtotal, vat, total_amount, salesperson, paid_flag, synced_at) SELECT
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
  NEW.synced_at
 ON CONFLICT(bina_id) DO UPDATE SET invoice_no=EXCLUDED.invoice_no, work_year=EXCLUDED.work_year, customer_code=EXCLUDED.customer_code, customer_name=EXCLUDED.customer_name, invoice_at=EXCLUDED.invoice_at, due_at=EXCLUDED.due_at, work_order_id=EXCLUDED.work_order_id, delivery_no=EXCLUDED.delivery_no, subtotal=EXCLUDED.subtotal, vat=EXCLUDED.vat, total_amount=EXCLUDED.total_amount, salesperson=EXCLUDED.salesperson, paid_flag=EXCLUDED.paid_flag, synced_at=EXCLUDED.synced_at;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.maintain_bina_projection_customer_invoice_headers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maintain_bina_projection_customer_invoice_headers() TO service_role;
DROP TRIGGER IF EXISTS sync_compact_projection ON public.bina_heshbonitrashi;
CREATE TRIGGER sync_compact_projection AFTER INSERT OR UPDATE OR DELETE ON public.bina_heshbonitrashi FOR EACH ROW EXECUTE FUNCTION public.maintain_bina_projection_customer_invoice_headers();
CREATE OR REPLACE VIEW public.stg_bina_customer_invoice_headers AS SELECT bina_id, invoice_no, work_year, customer_code, customer_name, invoice_at, due_at, work_order_id, delivery_no, subtotal, vat, total_amount, salesperson, paid_flag, synced_at FROM public.bina_projection_customer_invoice_headers;
CREATE INDEX IF NOT EXISTS idx_bina_projection_customer_invoice_headers_invoice_at ON public.bina_projection_customer_invoice_headers (invoice_at);
CREATE INDEX IF NOT EXISTS idx_bina_projection_customer_invoice_headers_due_at ON public.bina_projection_customer_invoice_headers (due_at);
CREATE INDEX IF NOT EXISTS idx_bina_projection_customer_invoice_headers_work_order_id ON public.bina_projection_customer_invoice_headers (work_order_id);
CREATE INDEX IF NOT EXISTS idx_bina_projection_customer_invoice_headers_synced_at ON public.bina_projection_customer_invoice_headers (synced_at);
ANALYZE public.bina_projection_customer_invoice_headers;
COMMIT;

BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='120s';
LOCK TABLE public.bina_mishloahrashi IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.bina_projection_deliveries AS SELECT * FROM public.stg_bina_deliveries WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bina_projection_deliveries_pk ON public.bina_projection_deliveries(bina_id);
ALTER TABLE public.bina_projection_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bina_projection_deliveries FROM anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.bina_projection_deliveries TO service_role;
INSERT INTO public.bina_projection_deliveries SELECT * FROM public.stg_bina_deliveries ON CONFLICT(bina_id) DO UPDATE SET delivery_no=EXCLUDED.delivery_no, work_year=EXCLUDED.work_year, customer_code=EXCLUDED.customer_code, customer_name=EXCLUDED.customer_name, delivery_at=EXCLUDED.delivery_at, sent_at=EXCLUDED.sent_at, received_flag=EXCLUDED.received_flag, carrier=EXCLUDED.carrier, tracking_no=EXCLUDED.tracking_no, work_order_id=EXCLUDED.work_order_id, invoice_no=EXCLUDED.invoice_no, total_amount=EXCLUDED.total_amount, synced_at=EXCLUDED.synced_at;
DO $check$ BEGIN
 IF EXISTS ((SELECT * FROM public.stg_bina_deliveries EXCEPT SELECT * FROM public.bina_projection_deliveries) UNION ALL (SELECT * FROM public.bina_projection_deliveries EXCEPT SELECT * FROM public.stg_bina_deliveries)) THEN RAISE EXCEPTION 'Compact projection mismatch: stg_bina_deliveries'; END IF;
END $check$;
CREATE OR REPLACE FUNCTION public.maintain_bina_projection_deliveries() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN DELETE FROM public.bina_projection_deliveries WHERE bina_id=OLD.bina_id; RETURN OLD; END IF;
 INSERT INTO public.bina_projection_deliveries(bina_id, delivery_no, work_year, customer_code, customer_name, delivery_at, sent_at, received_flag, carrier, tracking_no, work_order_id, invoice_no, total_amount, synced_at) SELECT
  NEW.bina_id,
  NEW.reporting_delivery_no AS delivery_no,
  NEW.reporting_work_year AS work_year,
  NEW.reporting_customer_code AS customer_code,
  NEW.reporting_customer_name AS customer_name,
  NEW.reporting_delivery_at AS delivery_at,
  NEW.reporting_sent_at AS sent_at,
  NEW.reporting_received_flag AS received_flag,
  NEW.reporting_carrier AS carrier,
  NEW.reporting_tracking_no AS tracking_no,
  NEW.reporting_work_order_id AS work_order_id,
  NEW.reporting_invoice_no AS invoice_no,
  NEW.reporting_total_amount AS total_amount,
  NEW.synced_at
 ON CONFLICT(bina_id) DO UPDATE SET delivery_no=EXCLUDED.delivery_no, work_year=EXCLUDED.work_year, customer_code=EXCLUDED.customer_code, customer_name=EXCLUDED.customer_name, delivery_at=EXCLUDED.delivery_at, sent_at=EXCLUDED.sent_at, received_flag=EXCLUDED.received_flag, carrier=EXCLUDED.carrier, tracking_no=EXCLUDED.tracking_no, work_order_id=EXCLUDED.work_order_id, invoice_no=EXCLUDED.invoice_no, total_amount=EXCLUDED.total_amount, synced_at=EXCLUDED.synced_at;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.maintain_bina_projection_deliveries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maintain_bina_projection_deliveries() TO service_role;
DROP TRIGGER IF EXISTS sync_compact_projection ON public.bina_mishloahrashi;
CREATE TRIGGER sync_compact_projection AFTER INSERT OR UPDATE OR DELETE ON public.bina_mishloahrashi FOR EACH ROW EXECUTE FUNCTION public.maintain_bina_projection_deliveries();
CREATE OR REPLACE VIEW public.stg_bina_deliveries AS SELECT bina_id, delivery_no, work_year, customer_code, customer_name, delivery_at, sent_at, received_flag, carrier, tracking_no, work_order_id, invoice_no, total_amount, synced_at FROM public.bina_projection_deliveries;
CREATE INDEX IF NOT EXISTS idx_bina_projection_deliveries_delivery_at ON public.bina_projection_deliveries (delivery_at);
CREATE INDEX IF NOT EXISTS idx_bina_projection_deliveries_work_order_id ON public.bina_projection_deliveries (work_order_id);
CREATE INDEX IF NOT EXISTS idx_bina_projection_deliveries_synced_at ON public.bina_projection_deliveries (synced_at);
ANALYZE public.bina_projection_deliveries;
COMMIT;

BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='120s';
LOCK TABLE public.bina_hovot IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.bina_projection_debts AS SELECT * FROM public.stg_bina_debts WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bina_projection_debts_pk ON public.bina_projection_debts(bina_id);
ALTER TABLE public.bina_projection_debts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bina_projection_debts FROM anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.bina_projection_debts TO service_role;
INSERT INTO public.bina_projection_debts SELECT * FROM public.stg_bina_debts ON CONFLICT(bina_id) DO UPDATE SET debt_type=EXCLUDED.debt_type, supplier_code=EXCLUDED.supplier_code, supplier_name=EXCLUDED.supplier_name, registered_at=EXCLUDED.registered_at, due_at=EXCLUDED.due_at, reference_no=EXCLUDED.reference_no, amount=EXCLUDED.amount, balance=EXCLUDED.balance, currency=EXCLUDED.currency, synced_at=EXCLUDED.synced_at;
DO $check$ BEGIN
 IF EXISTS ((SELECT * FROM public.stg_bina_debts EXCEPT SELECT * FROM public.bina_projection_debts) UNION ALL (SELECT * FROM public.bina_projection_debts EXCEPT SELECT * FROM public.stg_bina_debts)) THEN RAISE EXCEPTION 'Compact projection mismatch: stg_bina_debts'; END IF;
END $check$;
CREATE OR REPLACE FUNCTION public.maintain_bina_projection_debts() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN DELETE FROM public.bina_projection_debts WHERE bina_id=OLD.bina_id; RETURN OLD; END IF;
 INSERT INTO public.bina_projection_debts(bina_id, debt_type, supplier_code, supplier_name, registered_at, due_at, reference_no, amount, balance, currency, synced_at) SELECT
  NEW.bina_id,
  NEW.reporting_debt_type AS debt_type,
  NEW.reporting_supplier_code AS supplier_code,
  NEW.reporting_supplier_name AS supplier_name,
  NEW.reporting_registered_at AS registered_at,
  NEW.reporting_due_at AS due_at,
  NEW.reporting_reference_no AS reference_no,
  NEW.reporting_amount AS amount,
  NEW.reporting_balance AS balance,
  NEW.reporting_currency AS currency,
  NEW.synced_at
 ON CONFLICT(bina_id) DO UPDATE SET debt_type=EXCLUDED.debt_type, supplier_code=EXCLUDED.supplier_code, supplier_name=EXCLUDED.supplier_name, registered_at=EXCLUDED.registered_at, due_at=EXCLUDED.due_at, reference_no=EXCLUDED.reference_no, amount=EXCLUDED.amount, balance=EXCLUDED.balance, currency=EXCLUDED.currency, synced_at=EXCLUDED.synced_at;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.maintain_bina_projection_debts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maintain_bina_projection_debts() TO service_role;
DROP TRIGGER IF EXISTS sync_compact_projection ON public.bina_hovot;
CREATE TRIGGER sync_compact_projection AFTER INSERT OR UPDATE OR DELETE ON public.bina_hovot FOR EACH ROW EXECUTE FUNCTION public.maintain_bina_projection_debts();
CREATE OR REPLACE VIEW public.stg_bina_debts AS SELECT bina_id, debt_type, supplier_code, supplier_name, registered_at, due_at, reference_no, amount, balance, currency, synced_at FROM public.bina_projection_debts;
CREATE INDEX IF NOT EXISTS idx_bina_projection_debts_supplier_code ON public.bina_projection_debts (supplier_code);
CREATE INDEX IF NOT EXISTS idx_bina_projection_debts_due_at ON public.bina_projection_debts (due_at);
CREATE INDEX IF NOT EXISTS idx_bina_projection_debts_synced_at ON public.bina_projection_debts (synced_at);
ANALYZE public.bina_projection_debts;
COMMIT;
NOTIFY pgrst, 'reload schema';
