BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

CREATE TABLE public.sales_calendar_subscriptions (
  sales_user_id uuid PRIMARY KEY REFERENCES public.sales_users(id),
  token_hash text NOT NULL UNIQUE CHECK(length(token_hash)=64),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
ALTER TABLE public.sales_calendar_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_calendar_subscriptions FROM anon,authenticated;
GRANT ALL ON public.sales_calendar_subscriptions TO service_role;

-- Current account ownership, never the person who happened to log an activity.
CREATE VIEW public.mart_sales_bina_orders AS
SELECT o.bina_id, o.reporting_work_order_id AS work_order_id,
 o.reporting_customer_code AS customer_code, c.customer_name,
 o.reporting_title AS title,o.reporting_received_at AS received_at,
 o.reporting_due_at AS due_at,o.reporting_status_text AS status_text,
 o.reporting_quantity AS quantity,c.customer_group,c.area,
 c.account_manager,c.account_manager_sales_user_id,o.synced_at
FROM public.bina_dfhazmrashi o
JOIN public.sales_customer_directory c ON c.customer_code=o.reporting_customer_code AND c.client_ref='bina:'||o.reporting_customer_code::text
WHERE o.bina_id NOT LIKE 'QA-%';

CREATE VIEW public.mart_sales_bina_invoices AS
SELECT i.bina_id,i.reporting_invoice_no AS invoice_no,i.reporting_work_year AS work_year,
 i.reporting_customer_code AS customer_code,c.customer_name,
 i.reporting_invoice_at AS invoice_at,i.reporting_due_at AS due_at,
 i.reporting_total_amount AS total_amount,
 COALESCE(NULLIF(btrim(i.data->>'MatbeaMatah'),''),'UNKNOWN') AS currency,
 c.customer_group,c.area,c.account_manager,c.account_manager_sales_user_id,i.synced_at
FROM public.bina_heshbonitrashi i
JOIN public.sales_customer_directory c ON c.customer_code=i.reporting_customer_code AND c.client_ref='bina:'||i.reporting_customer_code::text;

-- Invoice line KodSug is the supplier invoice number, not MisparBina.
-- Verified across 47,797 repaired lines; use all three key dimensions.
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_line_parent ON public.bina_heshsapaknigrar
 ((data->>'KodSug'),(data->>'ShnatAvoda'),(data->>'KodSapak'));
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_parent ON public.bina_heshsapakrashi
 ((data->>'MisparHeshSapak'),(data->>'ShnatAvoda'),(data->>'KodSapak'));
CREATE VIEW public.mart_procurement_invoice_lines AS
SELECT l.bina_id,l.data->>'KodParit' AS item_code,l.data->>'TeorParit' AS item_name,
 NULLIF(btrim(l.data->>'Yehida'),'') AS unit,
 public.bina_json_numeric(l.data->>'Kamut') AS quantity,
 public.bina_json_numeric(l.data->>'Mhir') AS unit_price,
 public.bina_json_numeric(l.data->>'Sahacol') AS line_amount,
 COALESCE(NULLIF(btrim(l.data->>'Matbea'),''),NULLIF(btrim(h.data->>'MatbeaMatah'),''),'UNKNOWN') AS currency,
 h.reporting_supplier_code AS supplier_code,h.reporting_supplier_name AS supplier_name,
 h.reporting_supplier_invoice_no AS invoice_no,h.reporting_work_year AS work_year,
 h.reporting_invoice_at AS invoice_at,
 date_trunc('quarter',h.reporting_invoice_at AT TIME ZONE 'Asia/Jerusalem')::date AS quarter,
 LEAST(l.synced_at,h.synced_at) AS synced_at
FROM public.bina_heshsapaknigrar l
JOIN public.bina_heshsapakrashi h ON h.data->>'MisparHeshSapak'=l.data->>'KodSug'
 AND h.data->>'ShnatAvoda'=l.data->>'ShnatAvoda' AND h.data->>'KodSapak'=l.data->>'KodSapak'
WHERE NOT EXISTS (SELECT 1 FROM public.bina_heshsapakrashi duplicate
 WHERE duplicate.bina_id<>h.bina_id AND duplicate.data->>'MisparHeshSapak'=l.data->>'KodSug'
 AND duplicate.data->>'ShnatAvoda'=l.data->>'ShnatAvoda' AND duplicate.data->>'KodSapak'=l.data->>'KodSapak');

CREATE TABLE public.operations_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text NOT NULL CHECK(length(btrim(title)) BETWEEN 2 AND 200),
 description text NOT NULL DEFAULT '',owner_name text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','done','cancelled')),
 due_date date,category text NOT NULL DEFAULT 'management' CHECK(category IN ('management','purchasing','maintenance','sales')),
 customer_code integer,station_id uuid REFERENCES public.stations(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.supplier_capabilities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),supplier_code integer NOT NULL,
 service_name text NOT NULL CHECK(length(btrim(service_name)) BETWEEN 2 AND 200),
 unit text NOT NULL CHECK(length(btrim(unit))>0),unit_price numeric CHECK(unit_price>=0),
 currency text NOT NULL CHECK(currency IN ('ILS','USD','EUR','GBP','UNKNOWN')),
 valid_from date NOT NULL DEFAULT CURRENT_DATE,valid_until date,notes text NOT NULL DEFAULT '',
 is_active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(valid_until IS NULL OR valid_until>=valid_from)
);
ALTER TABLE public.operations_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operations_tasks,public.supplier_capabilities FROM anon,authenticated;
GRANT ALL ON public.operations_tasks,public.supplier_capabilities TO service_role;
CREATE TRIGGER operations_tasks_updated BEFORE UPDATE ON public.operations_tasks FOR EACH ROW EXECUTE FUNCTION public.sales_foundation_set_updated_at();
CREATE TRIGGER supplier_capabilities_updated BEFORE UPDATE ON public.supplier_capabilities FOR EACH ROW EXECUTE FUNCTION public.sales_foundation_set_updated_at();
REVOKE ALL ON public.mart_sales_bina_orders,public.mart_sales_bina_invoices,public.mart_procurement_invoice_lines FROM anon,authenticated;
GRANT SELECT ON public.mart_sales_bina_orders,public.mart_sales_bina_invoices,public.mart_procurement_invoice_lines TO service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
