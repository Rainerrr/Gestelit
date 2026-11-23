-- Typed projections refresh in the SAME transaction as every raw BINA upsert.
-- No asynchronous cache, new refresh schedule, omitted history, or source writes.
-- Existing view names, columns and business meanings are preserved exactly.
-- Small separate transactions keep locks bounded; migration is rerunnable.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '180s';
ALTER TABLE public.bina_dfhazmrashi
 ADD COLUMN IF NOT EXISTS reporting_work_order_id integer GENERATED ALWAYS AS (public.bina_json_int(data->>'MisparDFHazmana')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_customer_name text GENERATED ALWAYS AS (COALESCE(data->>'ShemLako', data->>'ShemLako ')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_customer_code integer GENERATED ALWAYS AS (public.bina_json_int(COALESCE(data->>'KodLako', data->>'Kodlako'))) STORED,
 ADD COLUMN IF NOT EXISTS reporting_title text GENERATED ALWAYS AS (COALESCE(data->>'Koteret', data->>'TeorKotar', data->>'ShemAvoda')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_customer_order_ref text GENERATED ALWAYS AS (data->>'HazmanatLako') STORED,
 ADD COLUMN IF NOT EXISTS reporting_status_code text GENERATED ALWAYS AS (data->>'Status') STORED,
 ADD COLUMN IF NOT EXISTS reporting_status_text text GENERATED ALWAYS AS (data->>'Status1') STORED,
 ADD COLUMN IF NOT EXISTS reporting_quantity numeric GENERATED ALWAYS AS (public.bina_json_numeric(data->>'Kamut')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_created_at timestamptz GENERATED ALWAYS AS (public.bina_json_timestamptz(data->>'TarikRishum')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_due_at timestamptz GENERATED ALWAYS AS (public.bina_json_timestamptz(COALESCE(data->>'TarikAspaka', data->>'ShatAspaka'))) STORED,
 ADD COLUMN IF NOT EXISTS reporting_received_at timestamptz GENERATED ALWAYS AS (public.bina_json_timestamptz(data->>'TarikKabala')) STORED;
DO $verify$ BEGIN
 IF EXISTS (SELECT 1 FROM public.bina_dfhazmrashi WHERE reporting_work_order_id IS DISTINCT FROM (public.bina_json_int(data->>'MisparDFHazmana')) OR
reporting_customer_name IS DISTINCT FROM (COALESCE(data->>'ShemLako', data->>'ShemLako ')) OR
reporting_customer_code IS DISTINCT FROM (public.bina_json_int(COALESCE(data->>'KodLako', data->>'Kodlako'))) OR
reporting_title IS DISTINCT FROM (COALESCE(data->>'Koteret', data->>'TeorKotar', data->>'ShemAvoda')) OR
reporting_customer_order_ref IS DISTINCT FROM (data->>'HazmanatLako') OR
reporting_status_code IS DISTINCT FROM (data->>'Status') OR
reporting_status_text IS DISTINCT FROM (data->>'Status1') OR
reporting_quantity IS DISTINCT FROM (public.bina_json_numeric(data->>'Kamut')) OR
reporting_created_at IS DISTINCT FROM (public.bina_json_timestamptz(data->>'TarikRishum')) OR
reporting_due_at IS DISTINCT FROM (public.bina_json_timestamptz(COALESCE(data->>'TarikAspaka', data->>'ShatAspaka'))) OR
reporting_received_at IS DISTINCT FROM (public.bina_json_timestamptz(data->>'TarikKabala'))) THEN
  RAISE EXCEPTION 'Typed projection mismatch: bina_dfhazmrashi';
 END IF;
END $verify$;
CREATE OR REPLACE VIEW public.stg_bina_work_orders AS
SELECT
  r.bina_id,
  r.reporting_work_order_id AS work_order_id,
  r.reporting_customer_name AS customer_name,
  r.reporting_customer_code AS customer_code,
  r.reporting_title AS title,
  r.reporting_customer_order_ref AS customer_order_ref,
  r.reporting_status_code AS status_code,
  r.reporting_status_text AS status_text,
  r.reporting_quantity AS quantity,
  r.reporting_created_at AS created_at,
  r.reporting_due_at AS due_at,
  public.bina_json_timestamptz(r.source_updated_at::text) AS source_updated_at,
  r.synced_at,
  r.reporting_received_at AS received_at
FROM public.bina_dfhazmrashi r;
CREATE INDEX IF NOT EXISTS idx_bina_dfhazmrashi_r_work_order_id ON public.bina_dfhazmrashi(reporting_work_order_id);
CREATE INDEX IF NOT EXISTS idx_bina_dfhazmrashi_r_due_at ON public.bina_dfhazmrashi(reporting_due_at);
CREATE INDEX IF NOT EXISTS idx_bina_dfhazmrashi_r_received_at ON public.bina_dfhazmrashi(reporting_received_at);
ANALYZE public.bina_dfhazmrashi;
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '180s';
ALTER TABLE public.bina_bakashanigrar
 ADD COLUMN IF NOT EXISTS reporting_request_line_id bigint GENERATED ALWAYS AS (public.bina_json_bigint(data->>'RecordID')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_item_code text GENERATED ALWAYS AS (data->>'KodParit') STORED,
 ADD COLUMN IF NOT EXISTS reporting_item_name text GENERATED ALWAYS AS (data->>'TeorParit') STORED,
 ADD COLUMN IF NOT EXISTS reporting_supplier_code integer GENERATED ALWAYS AS (public.bina_json_int(data->>'KodSapak')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_supplier_name text GENERATED ALWAYS AS (data->>'ShemSapak') STORED,
 ADD COLUMN IF NOT EXISTS reporting_quantity numeric GENERATED ALWAYS AS (public.bina_json_numeric(data->>'Kamut')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_remaining_quantity numeric GENERATED ALWAYS AS (public.bina_json_numeric(data->>'Notar')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_unit_price numeric GENERATED ALWAYS AS (public.bina_json_numeric(data->>'Mhir')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_total_amount numeric GENERATED ALWAYS AS (public.bina_json_numeric(data->>'Sahacol')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_currency text GENERATED ALWAYS AS (data->>'Matbea') STORED,
 ADD COLUMN IF NOT EXISTS reporting_work_year integer GENERATED ALWAYS AS (public.bina_json_int(data->>'ShnatAvoda')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_warehouse text GENERATED ALWAYS AS (data->>'Mahsan') STORED;
DO $verify$ BEGIN
 IF EXISTS (SELECT 1 FROM public.bina_bakashanigrar WHERE reporting_request_line_id IS DISTINCT FROM (public.bina_json_bigint(data->>'RecordID')) OR
reporting_item_code IS DISTINCT FROM (data->>'KodParit') OR
reporting_item_name IS DISTINCT FROM (data->>'TeorParit') OR
reporting_supplier_code IS DISTINCT FROM (public.bina_json_int(data->>'KodSapak')) OR
reporting_supplier_name IS DISTINCT FROM (data->>'ShemSapak') OR
reporting_quantity IS DISTINCT FROM (public.bina_json_numeric(data->>'Kamut')) OR
reporting_remaining_quantity IS DISTINCT FROM (public.bina_json_numeric(data->>'Notar')) OR
reporting_unit_price IS DISTINCT FROM (public.bina_json_numeric(data->>'Mhir')) OR
reporting_total_amount IS DISTINCT FROM (public.bina_json_numeric(data->>'Sahacol')) OR
reporting_currency IS DISTINCT FROM (data->>'Matbea') OR
reporting_work_year IS DISTINCT FROM (public.bina_json_int(data->>'ShnatAvoda')) OR
reporting_warehouse IS DISTINCT FROM (data->>'Mahsan')) THEN
  RAISE EXCEPTION 'Typed projection mismatch: bina_bakashanigrar';
 END IF;
END $verify$;
CREATE OR REPLACE VIEW public.stg_bina_purchase_request_lines AS
SELECT
  b.bina_id,
  b.reporting_request_line_id AS request_line_id,
  b.reporting_item_code AS item_code,
  b.reporting_item_name AS item_name,
  b.reporting_supplier_code AS supplier_code,
  b.reporting_supplier_name AS supplier_name,
  b.reporting_quantity AS quantity,
  b.reporting_remaining_quantity AS remaining_quantity,
  b.reporting_unit_price AS unit_price,
  b.reporting_total_amount AS total_amount,
  b.reporting_currency AS currency,
  b.reporting_work_year AS work_year,
  b.reporting_warehouse AS warehouse,
  b.synced_at
FROM public.bina_bakashanigrar b;
CREATE INDEX IF NOT EXISTS idx_bina_bakashanigrar_r_item_code ON public.bina_bakashanigrar(reporting_item_code);
CREATE INDEX IF NOT EXISTS idx_bina_bakashanigrar_r_supplier_code ON public.bina_bakashanigrar(reporting_supplier_code);
ANALYZE public.bina_bakashanigrar;
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '180s';
ALTER TABLE public.bina_tovinrashi
 ADD COLUMN IF NOT EXISTS reporting_goods_receipt_no integer GENERATED ALWAYS AS (public.bina_json_int(data->>'MisparTovin')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_work_year integer GENERATED ALWAYS AS (public.bina_json_int(data->>'ShnatAvoda')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_supplier_code integer GENERATED ALWAYS AS (public.bina_json_int(data->>'KodSapak')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_supplier_name text GENERATED ALWAYS AS (data->>'ShemSapak') STORED,
 ADD COLUMN IF NOT EXISTS reporting_receipt_at timestamptz GENERATED ALWAYS AS (public.bina_json_timestamptz(data->>'TarikTovin')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_due_at timestamptz GENERATED ALWAYS AS (public.bina_json_timestamptz(data->>'TarikAspaka')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_work_order_id integer GENERATED ALWAYS AS (public.bina_json_int(data->>'MisparHazmana')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_total_amount numeric GENERATED ALWAYS AS (public.bina_json_numeric(data->>'SahhacolSofi')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_status_text text GENERATED ALWAYS AS (data->>'Status1') STORED;
DO $verify$ BEGIN
 IF EXISTS (SELECT 1 FROM public.bina_tovinrashi WHERE reporting_goods_receipt_no IS DISTINCT FROM (public.bina_json_int(data->>'MisparTovin')) OR
reporting_work_year IS DISTINCT FROM (public.bina_json_int(data->>'ShnatAvoda')) OR
reporting_supplier_code IS DISTINCT FROM (public.bina_json_int(data->>'KodSapak')) OR
reporting_supplier_name IS DISTINCT FROM (data->>'ShemSapak') OR
reporting_receipt_at IS DISTINCT FROM (public.bina_json_timestamptz(data->>'TarikTovin')) OR
reporting_due_at IS DISTINCT FROM (public.bina_json_timestamptz(data->>'TarikAspaka')) OR
reporting_work_order_id IS DISTINCT FROM (public.bina_json_int(data->>'MisparHazmana')) OR
reporting_total_amount IS DISTINCT FROM (public.bina_json_numeric(data->>'SahhacolSofi')) OR
reporting_status_text IS DISTINCT FROM (data->>'Status1')) THEN
  RAISE EXCEPTION 'Typed projection mismatch: bina_tovinrashi';
 END IF;
END $verify$;
CREATE OR REPLACE VIEW public.stg_bina_goods_receipts AS
SELECT
  t.bina_id,
  t.reporting_goods_receipt_no AS goods_receipt_no,
  t.reporting_work_year AS work_year,
  t.reporting_supplier_code AS supplier_code,
  t.reporting_supplier_name AS supplier_name,
  t.reporting_receipt_at AS receipt_at,
  t.reporting_due_at AS due_at,
  t.reporting_work_order_id AS work_order_id,
  t.reporting_total_amount AS total_amount,
  t.reporting_status_text AS status_text,
  t.synced_at
FROM public.bina_tovinrashi t;
CREATE INDEX IF NOT EXISTS idx_bina_tovinrashi_r_supplier_code ON public.bina_tovinrashi(reporting_supplier_code);
CREATE INDEX IF NOT EXISTS idx_bina_tovinrashi_r_receipt_at ON public.bina_tovinrashi(reporting_receipt_at);
CREATE INDEX IF NOT EXISTS idx_bina_tovinrashi_r_due_at ON public.bina_tovinrashi(reporting_due_at);
CREATE INDEX IF NOT EXISTS idx_bina_tovinrashi_r_work_order_id ON public.bina_tovinrashi(reporting_work_order_id);
ANALYZE public.bina_tovinrashi;
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '180s';
ALTER TABLE public.bina_heshsapakrashi
 ADD COLUMN IF NOT EXISTS reporting_supplier_invoice_no integer GENERATED ALWAYS AS (public.bina_json_int(data->>'MisparHeshSapak')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_work_year integer GENERATED ALWAYS AS (public.bina_json_int(data->>'ShnatAvoda')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_supplier_code integer GENERATED ALWAYS AS (public.bina_json_int(data->>'KodSapak')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_supplier_name text GENERATED ALWAYS AS (data->>'ShemSapak') STORED,
 ADD COLUMN IF NOT EXISTS reporting_invoice_at timestamptz GENERATED ALWAYS AS (public.bina_json_timestamptz(data->>'Tarik')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_due_at timestamptz GENERATED ALWAYS AS (public.bina_json_timestamptz(data->>'TarikPiraon')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_subtotal numeric GENERATED ALWAYS AS (public.bina_json_numeric(data->>'SahSofi')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_vat numeric GENERATED ALWAYS AS (public.bina_json_numeric(data->>'Mam')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_total_amount numeric GENERATED ALWAYS AS (public.bina_json_numeric(data->>'SahhacolSofi')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_currency text GENERATED ALWAYS AS (data->>'MatbeaMatah') STORED,
 ADD COLUMN IF NOT EXISTS reporting_email text GENERATED ALWAYS AS (data->>'Email') STORED;
DO $verify$ BEGIN
 IF EXISTS (SELECT 1 FROM public.bina_heshsapakrashi WHERE reporting_supplier_invoice_no IS DISTINCT FROM (public.bina_json_int(data->>'MisparHeshSapak')) OR
reporting_work_year IS DISTINCT FROM (public.bina_json_int(data->>'ShnatAvoda')) OR
reporting_supplier_code IS DISTINCT FROM (public.bina_json_int(data->>'KodSapak')) OR
reporting_supplier_name IS DISTINCT FROM (data->>'ShemSapak') OR
reporting_invoice_at IS DISTINCT FROM (public.bina_json_timestamptz(data->>'Tarik')) OR
reporting_due_at IS DISTINCT FROM (public.bina_json_timestamptz(data->>'TarikPiraon')) OR
reporting_subtotal IS DISTINCT FROM (public.bina_json_numeric(data->>'SahSofi')) OR
reporting_vat IS DISTINCT FROM (public.bina_json_numeric(data->>'Mam')) OR
reporting_total_amount IS DISTINCT FROM (public.bina_json_numeric(data->>'SahhacolSofi')) OR
reporting_currency IS DISTINCT FROM (data->>'MatbeaMatah') OR
reporting_email IS DISTINCT FROM (data->>'Email')) THEN
  RAISE EXCEPTION 'Typed projection mismatch: bina_heshsapakrashi';
 END IF;
END $verify$;
CREATE OR REPLACE VIEW public.stg_bina_supplier_invoice_headers AS
SELECT
  h.bina_id,
  h.reporting_supplier_invoice_no AS supplier_invoice_no,
  h.reporting_work_year AS work_year,
  h.reporting_supplier_code AS supplier_code,
  h.reporting_supplier_name AS supplier_name,
  h.reporting_invoice_at AS invoice_at,
  h.reporting_due_at AS due_at,
  h.reporting_subtotal AS subtotal,
  h.reporting_vat AS vat,
  h.reporting_total_amount AS total_amount,
  h.reporting_currency AS currency,
  h.reporting_email AS email,
  h.synced_at
FROM public.bina_heshsapakrashi h;
CREATE INDEX IF NOT EXISTS idx_bina_heshsapakrashi_r_supplier_code ON public.bina_heshsapakrashi(reporting_supplier_code);
CREATE INDEX IF NOT EXISTS idx_bina_heshsapakrashi_r_invoice_at ON public.bina_heshsapakrashi(reporting_invoice_at);
CREATE INDEX IF NOT EXISTS idx_bina_heshsapakrashi_r_due_at ON public.bina_heshsapakrashi(reporting_due_at);
ANALYZE public.bina_heshsapakrashi;
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '180s';
ALTER TABLE public.bina_heshbonitrashi
 ADD COLUMN IF NOT EXISTS reporting_invoice_no integer GENERATED ALWAYS AS (public.bina_json_int(data->>'MisparHeshbonit')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_work_year integer GENERATED ALWAYS AS (public.bina_json_int(data->>'ShnatAvoda')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_customer_code integer GENERATED ALWAYS AS (public.bina_json_int(data->>'KodLako')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_customer_name text GENERATED ALWAYS AS (data->>'ShemLako') STORED,
 ADD COLUMN IF NOT EXISTS reporting_invoice_at timestamptz GENERATED ALWAYS AS (public.bina_json_timestamptz(data->>'TarikHeshbonit')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_due_at timestamptz GENERATED ALWAYS AS (public.bina_json_timestamptz(data->>'TarikPiraon')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_work_order_id integer GENERATED ALWAYS AS (public.bina_json_int(data->>'MisparHazmana')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_delivery_no integer GENERATED ALWAYS AS (public.bina_json_int(data->>'MisparMishloah')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_subtotal numeric GENERATED ALWAYS AS (public.bina_json_numeric(data->>'SahSofi')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_vat numeric GENERATED ALWAYS AS (public.bina_json_numeric(data->>'Mam')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_total_amount numeric GENERATED ALWAYS AS (public.bina_json_numeric(data->>'SahhacolSofi')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_salesperson text GENERATED ALWAYS AS (data->>'Soken') STORED,
 ADD COLUMN IF NOT EXISTS reporting_paid_flag text GENERATED ALWAYS AS (data->>'Shulam') STORED;
DO $verify$ BEGIN
 IF EXISTS (SELECT 1 FROM public.bina_heshbonitrashi WHERE reporting_invoice_no IS DISTINCT FROM (public.bina_json_int(data->>'MisparHeshbonit')) OR
reporting_work_year IS DISTINCT FROM (public.bina_json_int(data->>'ShnatAvoda')) OR
reporting_customer_code IS DISTINCT FROM (public.bina_json_int(data->>'KodLako')) OR
reporting_customer_name IS DISTINCT FROM (data->>'ShemLako') OR
reporting_invoice_at IS DISTINCT FROM (public.bina_json_timestamptz(data->>'TarikHeshbonit')) OR
reporting_due_at IS DISTINCT FROM (public.bina_json_timestamptz(data->>'TarikPiraon')) OR
reporting_work_order_id IS DISTINCT FROM (public.bina_json_int(data->>'MisparHazmana')) OR
reporting_delivery_no IS DISTINCT FROM (public.bina_json_int(data->>'MisparMishloah')) OR
reporting_subtotal IS DISTINCT FROM (public.bina_json_numeric(data->>'SahSofi')) OR
reporting_vat IS DISTINCT FROM (public.bina_json_numeric(data->>'Mam')) OR
reporting_total_amount IS DISTINCT FROM (public.bina_json_numeric(data->>'SahhacolSofi')) OR
reporting_salesperson IS DISTINCT FROM (data->>'Soken') OR
reporting_paid_flag IS DISTINCT FROM (data->>'Shulam')) THEN
  RAISE EXCEPTION 'Typed projection mismatch: bina_heshbonitrashi';
 END IF;
END $verify$;
CREATE OR REPLACE VIEW public.stg_bina_customer_invoice_headers AS
SELECT
  h.bina_id,
  h.reporting_invoice_no AS invoice_no,
  h.reporting_work_year AS work_year,
  h.reporting_customer_code AS customer_code,
  h.reporting_customer_name AS customer_name,
  h.reporting_invoice_at AS invoice_at,
  h.reporting_due_at AS due_at,
  h.reporting_work_order_id AS work_order_id,
  h.reporting_delivery_no AS delivery_no,
  h.reporting_subtotal AS subtotal,
  h.reporting_vat AS vat,
  h.reporting_total_amount AS total_amount,
  h.reporting_salesperson AS salesperson,
  h.reporting_paid_flag AS paid_flag,
  h.synced_at
FROM public.bina_heshbonitrashi h;
CREATE INDEX IF NOT EXISTS idx_bina_heshbonitrashi_r_invoice_at ON public.bina_heshbonitrashi(reporting_invoice_at);
CREATE INDEX IF NOT EXISTS idx_bina_heshbonitrashi_r_due_at ON public.bina_heshbonitrashi(reporting_due_at);
CREATE INDEX IF NOT EXISTS idx_bina_heshbonitrashi_r_work_order_id ON public.bina_heshbonitrashi(reporting_work_order_id);
ANALYZE public.bina_heshbonitrashi;
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '180s';
ALTER TABLE public.bina_mishloahrashi
 ADD COLUMN IF NOT EXISTS reporting_delivery_no integer GENERATED ALWAYS AS (public.bina_json_int(data->>'MisparMishloah')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_work_year integer GENERATED ALWAYS AS (public.bina_json_int(data->>'ShnatAvoda')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_customer_code integer GENERATED ALWAYS AS (public.bina_json_int(data->>'KodLako')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_customer_name text GENERATED ALWAYS AS (data->>'ShemLako') STORED,
 ADD COLUMN IF NOT EXISTS reporting_delivery_at timestamptz GENERATED ALWAYS AS (public.bina_json_timestamptz(data->>'TarikMishloah')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_sent_at timestamptz GENERATED ALWAYS AS (public.bina_json_timestamptz(data->>'NishlahBeTarik')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_received_flag integer GENERATED ALWAYS AS (public.bina_json_int(data->>'Nitkabel')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_carrier text GENERATED ALWAYS AS (data->>'HevratMishloah') STORED,
 ADD COLUMN IF NOT EXISTS reporting_tracking_no text GENERATED ALWAYS AS (data->>'MishloahMispar') STORED,
 ADD COLUMN IF NOT EXISTS reporting_work_order_id integer GENERATED ALWAYS AS (public.bina_json_int(data->>'MisparHazmana')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_invoice_no integer GENERATED ALWAYS AS (public.bina_json_int(data->>'MisparHeshbonit')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_total_amount numeric GENERATED ALWAYS AS (public.bina_json_numeric(data->>'SahhacolSofi')) STORED;
DO $verify$ BEGIN
 IF EXISTS (SELECT 1 FROM public.bina_mishloahrashi WHERE reporting_delivery_no IS DISTINCT FROM (public.bina_json_int(data->>'MisparMishloah')) OR
reporting_work_year IS DISTINCT FROM (public.bina_json_int(data->>'ShnatAvoda')) OR
reporting_customer_code IS DISTINCT FROM (public.bina_json_int(data->>'KodLako')) OR
reporting_customer_name IS DISTINCT FROM (data->>'ShemLako') OR
reporting_delivery_at IS DISTINCT FROM (public.bina_json_timestamptz(data->>'TarikMishloah')) OR
reporting_sent_at IS DISTINCT FROM (public.bina_json_timestamptz(data->>'NishlahBeTarik')) OR
reporting_received_flag IS DISTINCT FROM (public.bina_json_int(data->>'Nitkabel')) OR
reporting_carrier IS DISTINCT FROM (data->>'HevratMishloah') OR
reporting_tracking_no IS DISTINCT FROM (data->>'MishloahMispar') OR
reporting_work_order_id IS DISTINCT FROM (public.bina_json_int(data->>'MisparHazmana')) OR
reporting_invoice_no IS DISTINCT FROM (public.bina_json_int(data->>'MisparHeshbonit')) OR
reporting_total_amount IS DISTINCT FROM (public.bina_json_numeric(data->>'SahhacolSofi'))) THEN
  RAISE EXCEPTION 'Typed projection mismatch: bina_mishloahrashi';
 END IF;
END $verify$;
CREATE OR REPLACE VIEW public.stg_bina_deliveries AS
SELECT
  m.bina_id,
  m.reporting_delivery_no AS delivery_no,
  m.reporting_work_year AS work_year,
  m.reporting_customer_code AS customer_code,
  m.reporting_customer_name AS customer_name,
  m.reporting_delivery_at AS delivery_at,
  m.reporting_sent_at AS sent_at,
  m.reporting_received_flag AS received_flag,
  m.reporting_carrier AS carrier,
  m.reporting_tracking_no AS tracking_no,
  m.reporting_work_order_id AS work_order_id,
  m.reporting_invoice_no AS invoice_no,
  m.reporting_total_amount AS total_amount,
  m.synced_at
FROM public.bina_mishloahrashi m;
CREATE INDEX IF NOT EXISTS idx_bina_mishloahrashi_r_delivery_at ON public.bina_mishloahrashi(reporting_delivery_at);
CREATE INDEX IF NOT EXISTS idx_bina_mishloahrashi_r_work_order_id ON public.bina_mishloahrashi(reporting_work_order_id);
ANALYZE public.bina_mishloahrashi;
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '180s';
ALTER TABLE public.bina_hovot
 ADD COLUMN IF NOT EXISTS reporting_debt_type integer GENERATED ALWAYS AS (public.bina_json_int(data->>'Sug')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_supplier_code integer GENERATED ALWAYS AS (public.bina_json_int(data->>'KodSapak')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_supplier_name text GENERATED ALWAYS AS (data->>'ShemSapak') STORED,
 ADD COLUMN IF NOT EXISTS reporting_registered_at timestamptz GENERATED ALWAYS AS (public.bina_json_timestamptz(data->>'TarikRishum')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_due_at timestamptz GENERATED ALWAYS AS (public.bina_json_timestamptz(data->>'TarikPiraon')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_reference_no text GENERATED ALWAYS AS (data->>'Asmakta') STORED,
 ADD COLUMN IF NOT EXISTS reporting_amount numeric GENERATED ALWAYS AS (public.bina_json_numeric(data->>'Schome')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_balance numeric GENERATED ALWAYS AS (public.bina_json_numeric(data->>'Ytra')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_currency text GENERATED ALWAYS AS (data->>'Matbea') STORED;
DO $verify$ BEGIN
 IF EXISTS (SELECT 1 FROM public.bina_hovot WHERE reporting_debt_type IS DISTINCT FROM (public.bina_json_int(data->>'Sug')) OR
reporting_supplier_code IS DISTINCT FROM (public.bina_json_int(data->>'KodSapak')) OR
reporting_supplier_name IS DISTINCT FROM (data->>'ShemSapak') OR
reporting_registered_at IS DISTINCT FROM (public.bina_json_timestamptz(data->>'TarikRishum')) OR
reporting_due_at IS DISTINCT FROM (public.bina_json_timestamptz(data->>'TarikPiraon')) OR
reporting_reference_no IS DISTINCT FROM (data->>'Asmakta') OR
reporting_amount IS DISTINCT FROM (public.bina_json_numeric(data->>'Schome')) OR
reporting_balance IS DISTINCT FROM (public.bina_json_numeric(data->>'Ytra')) OR
reporting_currency IS DISTINCT FROM (data->>'Matbea')) THEN
  RAISE EXCEPTION 'Typed projection mismatch: bina_hovot';
 END IF;
END $verify$;
CREATE OR REPLACE VIEW public.stg_bina_debts AS
SELECT
  h.bina_id,
  h.reporting_debt_type AS debt_type,
  h.reporting_supplier_code AS supplier_code,
  h.reporting_supplier_name AS supplier_name,
  h.reporting_registered_at AS registered_at,
  h.reporting_due_at AS due_at,
  h.reporting_reference_no AS reference_no,
  h.reporting_amount AS amount,
  h.reporting_balance AS balance,
  h.reporting_currency AS currency,
  h.synced_at
FROM public.bina_hovot h;
CREATE INDEX IF NOT EXISTS idx_bina_hovot_r_supplier_code ON public.bina_hovot(reporting_supplier_code);
CREATE INDEX IF NOT EXISTS idx_bina_hovot_r_due_at ON public.bina_hovot(reporting_due_at);
ANALYZE public.bina_hovot;
COMMIT;
NOTIFY pgrst, 'reload schema';
