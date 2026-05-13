-- BINA typed analytics layer, Gestelit links, and AI audit tables.
-- Raw bina_* JSONB tables remain sync-owned landing tables. App UI and AI read
-- from these typed views/marts instead of reaching into raw JSON directly.

CREATE OR REPLACE FUNCTION public.bina_json_int(value text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN value IS NULL OR btrim(value) = '' THEN NULL
    WHEN btrim(value) ~ '^-?\d+(\.0+)?$' THEN btrim(value)::numeric::integer
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.bina_json_bigint(value text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN value IS NULL OR btrim(value) = '' THEN NULL
    WHEN btrim(value) ~ '^-?\d+(\.0+)?$' THEN btrim(value)::numeric::bigint
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.bina_json_numeric(value text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN value IS NULL OR btrim(value) = '' THEN NULL
    WHEN btrim(value) ~ '^-?\d+(\.\d+)?$' THEN btrim(value)::numeric
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.bina_json_timestamptz(value text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF value IS NULL OR btrim(value) = '' THEN
    RETURN NULL;
  END IF;

  IF btrim(value) !~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN NULL;
  END IF;

  RETURN value::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.bina_gestelit_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bina_table text NOT NULL,
  bina_id text NOT NULL,
  gestelit_entity_type text NOT NULL,
  gestelit_entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (bina_table, bina_id, gestelit_entity_type)
);

ALTER TABLE public.bina_gestelit_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to bina_gestelit_links" ON public.bina_gestelit_links;
CREATE POLICY "Service role has full access to bina_gestelit_links"
  ON public.bina_gestelit_links FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.ai_chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_identity text,
  model text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  redacted boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.ai_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.ai_chat_messages(id) ON DELETE SET NULL,
  tool_name text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count integer NOT NULL DEFAULT 0,
  duration_ms integer,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.ai_chat_sessions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_saved_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_he text NOT NULL,
  prompt_he text NOT NULL,
  domain text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_saved_questions_unique_active_seed
  ON public.ai_saved_questions (domain, title_he, prompt_he);

CREATE TABLE IF NOT EXISTS public.semantic_bina_metrics (
  id text PRIMARY KEY,
  domain text NOT NULL,
  label_he text NOT NULL,
  definition_he text NOT NULL,
  source_views text[] NOT NULL DEFAULT ARRAY[]::text[],
  grain text NOT NULL,
  aliases_he text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_saved_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semantic_bina_metrics ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ai_chat_sessions',
    'ai_chat_messages',
	    'ai_tool_calls',
	    'ai_usage',
	    'ai_security_events',
	    'ai_saved_questions',
	    'semantic_bina_metrics'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Service role has full access to %1$s" ON public.%1$I', table_name);
    EXECUTE format(
      'CREATE POLICY "Service role has full access to %1$s" ON public.%1$I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
      table_name
    );
  END LOOP;
END $$;

INSERT INTO public.ai_saved_questions (title_he, prompt_he, domain, sort_order)
VALUES
  ('פק״עות בסיכון', 'איזה פק״עות בסיכון לאיחור היום ולמה?', 'production', 10),
  ('פק״עות שלא יובאו', 'איזה פק״עות קיימות ב-BINA ועדיין לא נוצרו בגסטליט?', 'production', 20),
  ('פערי כמויות', 'האם יש פער בין כמות ב-BINA לכמות בגסטליט?', 'production', 30),
  ('מצב רכש', 'מה מצב הרכש השבוע?', 'purchasing', 40),
  ('ספקים באיחור', 'מי הספקים עם חוב פתוח או איחורים משמעותיים?', 'suppliers', 50),
  ('משלוחים פתוחים', 'איזה משלוחים יצאו ועדיין לא חזרו או נסגרו?', 'deliveries', 60),
  ('מכירות השבוע', 'סכם את המכירות וחשבוניות הלקוח השבוע, ומה כדאי להשוות מול משלוחים ופק״עות?', 'sales', 65),
  ('שינויים מסנכרון קודם', 'מה השתנה מאז הסנכרון הקודם?', 'sync', 70),
  ('דוח מנהלים', 'כתוב דוח מנהלים יומי בעברית.', 'overview', 80)
ON CONFLICT (domain, title_he, prompt_he) DO UPDATE
SET sort_order = EXCLUDED.sort_order,
    is_active = true;

INSERT INTO public.semantic_bina_metrics (id, domain, label_he, definition_he, source_views, grain, aliases_he)
VALUES
  ('bina_sync_health', 'sync', 'בריאות סנכרון BINA', 'סטטוס עדכניות לכל טבלת BINA לפי זמן הסנכרון האחרון וכמות שורות.', ARRAY['mart_bina_sync_health','bina_sync_log'], 'source_table', ARRAY['סנכרון','עדכניות','sync','BINA']),
  ('risky_work_orders', 'production', 'פק״עות בסיכון', 'פק״עות שעברו תאריך אספקה או שיש בהן פערים בין BINA להתקדמות בגסטליט.', ARRAY['mart_bina_work_order_status','mart_gestelit_bina_reconciliation'], 'work_order', ARRAY['איחור','בסיכון','פקע','פק״ע','הזמנה']),
  ('missing_gestelit_jobs', 'production', 'פק״עות שלא יובאו', 'פק״עות שקיימות ב-BINA אך אין להן עבודה מקושרת בגסטליט.', ARRAY['mart_bina_work_order_status'], 'work_order', ARRAY['לא יובא','חסר בגסטליט','יצירת עבודה']),
  ('purchase_flow', 'purchasing', 'זרימת רכש', 'שורות בקשת רכש וקבלות טובין מסונכרנות מ-BINA.', ARRAY['mart_bina_purchase_flow'], 'purchase_document_line', ARRAY['רכש','קניות','בקשות','טובין','חומרים']),
  ('supplier_aging', 'suppliers', 'יתרות ספקים', 'יתרה פתוחה ואיחור לפי ספק מתוך טבלת חובות BINA.', ARRAY['mart_bina_supplier_aging'], 'supplier_currency', ARRAY['ספקים','חובות ספקים','יתרה פתוחה','איחור ספק']),
  ('sales_status', 'sales', 'מכירות וחשבוניות לקוח', 'חשבוניות לקוח, סכומים, לקוחות, אנשי מכירות ותאריכי פירעון.', ARRAY['mart_bina_sales_status'], 'customer_invoice', ARRAY['מכירות','חשבוניות לקוח','לקוח','סוכן']),
  ('delivery_status', 'deliveries', 'משלוחים וספקי חוץ', 'משלוחים פתוחים/סגורים, תאריכי יציאה, מוביל ומספר מעקב.', ARRAY['mart_bina_delivery_status'], 'delivery', ARRAY['משלוח','יצא','חזר','ספקי חוץ'])
ON CONFLICT (id) DO UPDATE
SET domain = EXCLUDED.domain,
    label_he = EXCLUDED.label_he,
    definition_he = EXCLUDED.definition_he,
    source_views = EXCLUDED.source_views,
    grain = EXCLUDED.grain,
    aliases_he = EXCLUDED.aliases_he,
    is_active = true,
    updated_at = now();

CREATE OR REPLACE VIEW public.stg_bina_work_orders AS
SELECT
  r.bina_id,
  public.bina_json_int(r.data->>'MisparDFHazmana') AS work_order_id,
  COALESCE(r.data->>'ShemLako', r.data->>'ShemLako ') AS customer_name,
  public.bina_json_int(COALESCE(r.data->>'KodLako', r.data->>'Kodlako')) AS customer_code,
  COALESCE(r.data->>'Koteret', r.data->>'TeorKotar', r.data->>'ShemAvoda') AS title,
  r.data->>'HazmanatLako' AS customer_order_ref,
  r.data->>'Status' AS status_code,
  r.data->>'Status1' AS status_text,
  public.bina_json_numeric(r.data->>'Kamut') AS quantity,
  public.bina_json_timestamptz(r.data->>'TarikRishum') AS created_at,
  public.bina_json_timestamptz(COALESCE(r.data->>'TarikAspaka', r.data->>'ShatAspaka')) AS due_at,
  public.bina_json_timestamptz(r.source_updated_at::text) AS source_updated_at,
  r.synced_at
FROM public.bina_dfhazmrashi r;

CREATE OR REPLACE VIEW public.stg_bina_production_rows AS
SELECT
  'DFShelita'::text AS source_table,
  s.bina_id,
  public.bina_json_int(s.data->>'MisparRashi') AS work_order_id,
  public.bina_json_int(s.data->>'MisparAvoda') AS work_line_no,
  s.data->>'KodParit' AS item_code,
  s.data->>'ShemAvoda' AS item_name,
  public.bina_json_numeric(s.data->>'Kamut') AS planned_quantity,
  public.bina_json_numeric(s.data->>'KamutBafoal') AS actual_quantity,
  s.data->>'Mekona' AS machine_name,
  s.data->>'ShemLako' AS customer_name,
  public.bina_json_timestamptz(s.data->>'TarikKabala') AS received_at,
  public.bina_json_timestamptz(s.data->>'TarikAspaka') AS due_at,
  public.bina_json_timestamptz(COALESCE(s.data->>'TarikStart', s.data->>'ShatStart')) AS started_at,
  public.bina_json_timestamptz(COALESCE(s.data->>'TarikEnd', s.data->>'ShatEnd')) AS ended_at,
  s.data->>'Status' AS status_code,
  s.synced_at
FROM public.bina_dfshelita s
UNION ALL
SELECT
  'DFHazmGlyonot'::text,
  g.bina_id,
  public.bina_json_int(g.data->>'MisparRashi'),
  public.bina_json_int(g.data->>'MisparAvoda'),
  g.data->>'KodParit',
  COALESCE(g.data->>'ShemAvoda', g.data->>'TeorParit'),
  public.bina_json_numeric(g.data->>'Kamut'),
  NULL::numeric,
  g.data->>'Mekona',
  NULL::text,
  NULL::timestamptz,
  NULL::timestamptz,
  NULL::timestamptz,
  NULL::timestamptz,
  NULL::text,
  g.synced_at
FROM public.bina_dfhazmglyonot g;

CREATE OR REPLACE VIEW public.stg_bina_purchase_request_lines AS
SELECT
  b.bina_id,
  public.bina_json_bigint(b.data->>'RecordID') AS request_line_id,
  b.data->>'KodParit' AS item_code,
  b.data->>'TeorParit' AS item_name,
  public.bina_json_int(b.data->>'KodSapak') AS supplier_code,
  b.data->>'ShemSapak' AS supplier_name,
  public.bina_json_numeric(b.data->>'Kamut') AS quantity,
  public.bina_json_numeric(b.data->>'Notar') AS remaining_quantity,
  public.bina_json_numeric(b.data->>'Mhir') AS unit_price,
  public.bina_json_numeric(b.data->>'Sahacol') AS total_amount,
  b.data->>'Matbea' AS currency,
  public.bina_json_int(b.data->>'ShnatAvoda') AS work_year,
  b.data->>'Mahsan' AS warehouse,
  b.synced_at
FROM public.bina_bakashanigrar b;

CREATE OR REPLACE VIEW public.stg_bina_goods_receipts AS
SELECT
  t.bina_id,
  public.bina_json_int(t.data->>'MisparTovin') AS goods_receipt_no,
  public.bina_json_int(t.data->>'ShnatAvoda') AS work_year,
  public.bina_json_int(t.data->>'KodSapak') AS supplier_code,
  t.data->>'ShemSapak' AS supplier_name,
  public.bina_json_timestamptz(t.data->>'TarikTovin') AS receipt_at,
  public.bina_json_timestamptz(t.data->>'TarikAspaka') AS due_at,
  public.bina_json_int(t.data->>'MisparHazmana') AS work_order_id,
  public.bina_json_numeric(t.data->>'SahhacolSofi') AS total_amount,
  t.data->>'Status1' AS status_text,
  t.synced_at
FROM public.bina_tovinrashi t;

CREATE OR REPLACE VIEW public.stg_bina_supplier_invoice_headers AS
SELECT
  h.bina_id,
  public.bina_json_int(h.data->>'MisparHeshSapak') AS supplier_invoice_no,
  public.bina_json_int(h.data->>'ShnatAvoda') AS work_year,
  public.bina_json_int(h.data->>'KodSapak') AS supplier_code,
  h.data->>'ShemSapak' AS supplier_name,
  public.bina_json_timestamptz(h.data->>'Tarik') AS invoice_at,
  public.bina_json_timestamptz(h.data->>'TarikPiraon') AS due_at,
  public.bina_json_numeric(h.data->>'SahSofi') AS subtotal,
  public.bina_json_numeric(h.data->>'Mam') AS vat,
  public.bina_json_numeric(h.data->>'SahhacolSofi') AS total_amount,
  h.data->>'MatbeaMatah' AS currency,
  h.data->>'Email' AS email,
  h.synced_at
FROM public.bina_heshsapakrashi h;

CREATE OR REPLACE VIEW public.stg_bina_supplier_invoice_lines AS
SELECT
  l.bina_id,
  public.bina_json_bigint(l.data->>'RecordID') AS line_id,
  public.bina_json_int(l.data->>'KodSapak') AS supplier_code,
  l.data->>'KodParit' AS item_code,
  l.data->>'TeorParit' AS item_name,
  public.bina_json_numeric(l.data->>'Kamut') AS quantity,
  public.bina_json_numeric(l.data->>'Mhir') AS unit_price,
  public.bina_json_numeric(l.data->>'Sahacol') AS total_amount,
  l.data->>'Matbea' AS currency,
  public.bina_json_int(l.data->>'MisparTovin') AS goods_receipt_no,
  public.bina_json_int(l.data->>'ProjectNo') AS project_no,
  l.synced_at
FROM public.bina_heshsapaknigrar l;

CREATE OR REPLACE VIEW public.stg_bina_customer_invoice_headers AS
SELECT
  h.bina_id,
  public.bina_json_int(h.data->>'MisparHeshbonit') AS invoice_no,
  public.bina_json_int(h.data->>'ShnatAvoda') AS work_year,
  public.bina_json_int(h.data->>'KodLako') AS customer_code,
  h.data->>'ShemLako' AS customer_name,
  public.bina_json_timestamptz(h.data->>'TarikHeshbonit') AS invoice_at,
  public.bina_json_timestamptz(h.data->>'TarikPiraon') AS due_at,
  public.bina_json_int(h.data->>'MisparHazmana') AS work_order_id,
  public.bina_json_int(h.data->>'MisparMishloah') AS delivery_no,
  public.bina_json_numeric(h.data->>'SahSofi') AS subtotal,
  public.bina_json_numeric(h.data->>'Mam') AS vat,
  public.bina_json_numeric(h.data->>'SahhacolSofi') AS total_amount,
  h.data->>'Soken' AS salesperson,
  h.data->>'Shulam' AS paid_flag,
  h.synced_at
FROM public.bina_heshbonitrashi h;

CREATE OR REPLACE VIEW public.stg_bina_customer_invoice_lines AS
SELECT
  l.bina_id,
  public.bina_json_bigint(l.data->>'RecordID') AS line_id,
  l.data->>'KodParit' AS item_code,
  l.data->>'TeorParit' AS item_name,
  public.bina_json_numeric(l.data->>'Kamut') AS quantity,
  public.bina_json_numeric(l.data->>'Mhir') AS unit_price,
  public.bina_json_numeric(l.data->>'Sahacol') AS total_amount,
  l.data->>'Matbea' AS currency,
  l.synced_at
FROM public.bina_heshbonitnigrar l;

CREATE OR REPLACE VIEW public.stg_bina_deliveries AS
SELECT
  m.bina_id,
  public.bina_json_int(m.data->>'MisparMishloah') AS delivery_no,
  public.bina_json_int(m.data->>'ShnatAvoda') AS work_year,
  public.bina_json_int(m.data->>'KodLako') AS customer_code,
  m.data->>'ShemLako' AS customer_name,
  public.bina_json_timestamptz(m.data->>'TarikMishloah') AS delivery_at,
  public.bina_json_timestamptz(m.data->>'NishlahBeTarik') AS sent_at,
  public.bina_json_int(m.data->>'Nitkabel') AS received_flag,
  m.data->>'HevratMishloah' AS carrier,
  m.data->>'MishloahMispar' AS tracking_no,
  public.bina_json_int(m.data->>'MisparHazmana') AS work_order_id,
  public.bina_json_int(m.data->>'MisparHeshbonit') AS invoice_no,
  public.bina_json_numeric(m.data->>'SahhacolSofi') AS total_amount,
  m.synced_at
FROM public.bina_mishloahrashi m;

CREATE OR REPLACE VIEW public.stg_bina_debts AS
SELECT
  h.bina_id,
  public.bina_json_int(h.data->>'Sug') AS debt_type,
  public.bina_json_int(h.data->>'KodSapak') AS supplier_code,
  h.data->>'ShemSapak' AS supplier_name,
  public.bina_json_timestamptz(h.data->>'TarikRishum') AS registered_at,
  public.bina_json_timestamptz(h.data->>'TarikPiraon') AS due_at,
  h.data->>'Asmakta' AS reference_no,
  public.bina_json_numeric(h.data->>'Schome') AS amount,
  public.bina_json_numeric(h.data->>'Ytra') AS balance,
  h.data->>'Matbea' AS currency,
  h.synced_at
FROM public.bina_hovot h;

CREATE OR REPLACE VIEW public.mart_bina_work_order_status AS
SELECT
  wo.bina_id,
  wo.work_order_id,
  wo.customer_name,
  wo.customer_code,
  wo.title,
  wo.customer_order_ref,
  wo.status_code,
  wo.status_text,
  wo.quantity AS bina_quantity,
  wo.created_at,
  wo.due_at,
  wo.synced_at,
  j.id AS gestelit_job_id,
  j.job_number AS gestelit_job_number,
  j.due_date AS gestelit_due_date,
  COALESCE(ji.item_count, 0) AS gestelit_item_count,
  COALESCE(ji.planned_quantity, 0) AS gestelit_planned_quantity,
  COALESCE(ji.completed_good, 0) AS gestelit_completed_good,
  COALESCE(pr.production_row_count, 0) AS bina_production_row_count,
  CASE
    WHEN j.id IS NULL THEN 'not_imported'
    WHEN wo.quantity IS NOT NULL AND ji.planned_quantity IS NOT NULL AND wo.quantity <> ji.planned_quantity THEN 'quantity_mismatch'
    WHEN wo.due_at IS NOT NULL AND wo.due_at < now() AND COALESCE(ji.completed_good, 0) < COALESCE(NULLIF(ji.planned_quantity, 0), wo.quantity, 1) THEN 'at_risk'
    ELSE 'linked'
  END AS link_status
FROM public.stg_bina_work_orders wo
LEFT JOIN public.jobs j ON j.job_number = wo.work_order_id::text
LEFT JOIN (
  SELECT
    job_id,
    COUNT(*) AS item_count,
    SUM(planned_quantity)::numeric AS planned_quantity,
    SUM(COALESCE(p.completed_good, 0))::numeric AS completed_good
  FROM public.job_items i
  LEFT JOIN public.job_item_progress p ON p.job_item_id = i.id
  WHERE i.is_active = true
  GROUP BY job_id
) ji ON ji.job_id = j.id
LEFT JOIN (
  SELECT work_order_id, COUNT(*) AS production_row_count
  FROM public.stg_bina_production_rows
  WHERE work_order_id IS NOT NULL
  GROUP BY work_order_id
) pr ON pr.work_order_id = wo.work_order_id;

CREATE OR REPLACE VIEW public.mart_gestelit_bina_reconciliation AS
SELECT
  *,
  CASE
    WHEN link_status = 'not_imported' THEN 'פק״ע קיימת ב-BINA ועדיין לא נוצרה בגסטליט'
    WHEN link_status = 'quantity_mismatch' THEN 'יש פער בין כמות BINA לכמות מתוכננת בגסטליט'
    WHEN link_status = 'at_risk' THEN 'פק״ע בסיכון איחור לפי תאריך אספקה והתקדמות'
    ELSE 'מקושר'
  END AS status_he
FROM public.mart_bina_work_order_status;

CREATE OR REPLACE VIEW public.mart_bina_supplier_aging AS
SELECT
  supplier_code,
  COALESCE(MAX(supplier_name), 'לא ידוע') AS supplier_name,
  COALESCE(currency, 'NIS') AS currency,
  SUM(COALESCE(balance, 0)) AS open_balance,
  SUM(COALESCE(balance, 0)) FILTER (WHERE due_at < now()) AS overdue_balance,
  MIN(due_at) FILTER (WHERE COALESCE(balance, 0) <> 0) AS oldest_due_at,
  COUNT(*) FILTER (WHERE COALESCE(balance, 0) <> 0) AS open_items,
  MAX(synced_at) AS synced_at
FROM public.stg_bina_debts
WHERE supplier_code IS NOT NULL
GROUP BY supplier_code, currency;

CREATE OR REPLACE VIEW public.mart_bina_purchase_flow AS
SELECT
  pr.bina_id,
  'purchase_request'::text AS flow_type,
  pr.request_line_id::text AS document_no,
  NULL::integer AS work_order_id,
  pr.supplier_code,
  pr.supplier_name,
  pr.item_code,
  pr.item_name,
  pr.quantity,
  pr.remaining_quantity,
  pr.total_amount,
  pr.currency,
  NULL::timestamptz AS document_at,
  pr.synced_at
FROM public.stg_bina_purchase_request_lines pr
UNION ALL
SELECT
  gr.bina_id,
  'goods_receipt'::text,
  gr.goods_receipt_no::text,
  gr.work_order_id,
  gr.supplier_code,
  gr.supplier_name,
  NULL::text,
  gr.status_text,
  NULL::numeric,
  NULL::numeric,
  gr.total_amount,
  NULL::text,
  gr.receipt_at,
  gr.synced_at
FROM public.stg_bina_goods_receipts gr;

CREATE OR REPLACE VIEW public.mart_bina_sales_status AS
SELECT
  h.bina_id,
  h.invoice_no,
  h.work_year,
  h.customer_code,
  h.customer_name,
  h.invoice_at,
  h.due_at,
  h.work_order_id,
  h.delivery_no,
  h.subtotal,
  h.vat,
  h.total_amount,
  h.salesperson,
  h.paid_flag,
  h.synced_at
FROM public.stg_bina_customer_invoice_headers h;

CREATE OR REPLACE VIEW public.mart_bina_delivery_status AS
SELECT
  d.bina_id,
  d.delivery_no,
  d.work_year,
  d.customer_code,
  d.customer_name,
  d.delivery_at,
  d.sent_at,
  d.received_flag,
  d.carrier,
  d.tracking_no,
  d.work_order_id,
  d.invoice_no,
  d.total_amount,
  d.synced_at,
  CASE
    WHEN d.received_flag = 1 THEN 'returned_or_received'
    WHEN d.sent_at IS NOT NULL AND d.received_flag IS DISTINCT FROM 1 THEN 'sent_open'
    ELSE 'draft_or_unknown'
  END AS delivery_state
FROM public.stg_bina_deliveries d;

CREATE OR REPLACE VIEW public.mart_bina_finance AS
SELECT
  'customer_invoice'::text AS kind,
  h.bina_id,
  h.invoice_no::text AS document_no,
  h.customer_code AS party_code,
  h.customer_name AS party_name,
  h.invoice_at AS document_at,
  h.due_at,
  h.total_amount,
  NULL::numeric AS balance,
  NULL::text AS currency,
  h.synced_at
FROM public.stg_bina_customer_invoice_headers h
UNION ALL
SELECT
  'supplier_invoice'::text,
  h.bina_id,
  h.supplier_invoice_no::text,
  h.supplier_code,
  h.supplier_name,
  h.invoice_at,
  h.due_at,
  h.total_amount,
  NULL::numeric,
  h.currency,
  h.synced_at
FROM public.stg_bina_supplier_invoice_headers h
UNION ALL
SELECT
  'debt'::text,
  d.bina_id,
  d.reference_no,
  d.supplier_code,
  d.supplier_name,
  d.registered_at,
  d.due_at,
  d.amount,
  d.balance,
  d.currency,
  d.synced_at
FROM public.stg_bina_debts d;

CREATE OR REPLACE VIEW public.mart_bina_sync_health AS
WITH table_stats AS (
  SELECT 'DFHazmRashi'::text AS source_table, 'bina_dfhazmrashi'::text AS storage_table, COUNT(*)::bigint AS row_count, MAX(synced_at) AS last_row_synced_at FROM public.bina_dfhazmrashi
  UNION ALL SELECT 'DFHazmMontage','bina_dfhazmmontage',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_dfhazmmontage
  UNION ALL SELECT 'DFHazmNigrar','bina_dfhazmnigrar',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_dfhazmnigrar
  UNION ALL SELECT 'DFHazmGimur','bina_dfhazmgimur',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_dfhazmgimur
  UNION ALL SELECT 'DFHazmGrafika','bina_dfhazmgrafika',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_dfhazmgrafika
  UNION ALL SELECT 'DFHazmKirkia','bina_dfhazmkirkia',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_dfhazmkirkia
  UNION ALL SELECT 'DFHazmKedam','bina_dfhazmkedam',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_dfhazmkedam
  UNION ALL SELECT 'DFHazmGlyonot','bina_dfhazmglyonot',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_dfhazmglyonot
  UNION ALL SELECT 'DFMlay','bina_dfmlay',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_dfmlay
  UNION ALL SELECT 'TnuotMlay','bina_tnuotmlay',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_tnuotmlay
  UNION ALL SELECT 'Mismahim','bina_mismahim',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_mismahim
  UNION ALL SELECT 'HeshSapakRashi','bina_heshsapakrashi',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_heshsapakrashi
  UNION ALL SELECT 'HeshSapakNigrar','bina_heshsapaknigrar',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_heshsapaknigrar
  UNION ALL SELECT 'TMSapakNigrar','bina_tmsapaknigrar',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_tmsapaknigrar
  UNION ALL SELECT 'BakashaNigrar','bina_bakashanigrar',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_bakashanigrar
  UNION ALL SELECT 'Hovot','bina_hovot',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_hovot
  UNION ALL SELECT 'DFShelita','bina_dfshelita',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_dfshelita
  UNION ALL SELECT 'HeshbonitRashi','bina_heshbonitrashi',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_heshbonitrashi
  UNION ALL SELECT 'HeshbonitNigrar','bina_heshbonitnigrar',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_heshbonitnigrar
  UNION ALL SELECT 'MishloahRashi','bina_mishloahrashi',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_mishloahrashi
  UNION ALL SELECT 'MishloahNigrar','bina_mishloahnigrar',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_mishloahnigrar
  UNION ALL SELECT 'TovinRashi','bina_tovinrashi',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_tovinrashi
  UNION ALL SELECT 'TovinNigrar','bina_tovinnigrar',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_tovinnigrar
  UNION ALL SELECT 'SqlLogins','bina_sqllogins',COUNT(*)::bigint,MAX(synced_at) FROM public.bina_sqllogins
)
SELECT
  ts.*,
  EXTRACT(EPOCH FROM (now() - ts.last_row_synced_at))::integer AS age_seconds,
  CASE
    WHEN ts.last_row_synced_at IS NULL THEN 'empty'
    WHEN ts.last_row_synced_at < now() - interval '6 hours' THEN 'stale'
    ELSE 'ok'
  END AS freshness_status
FROM table_stats ts;

CREATE OR REPLACE VIEW public.mart_bina_overview_kpis AS
WITH sync AS (
  SELECT
    MAX(last_row_synced_at) AS last_synced_at,
    COUNT(*) FILTER (WHERE freshness_status = 'stale')::integer AS stale_tables,
    COUNT(*) FILTER (WHERE freshness_status = 'empty')::integer AS empty_tables,
    COUNT(*)::integer AS table_count
  FROM public.mart_bina_sync_health
),
work_orders AS (
  SELECT
    COUNT(*)::integer AS total,
    COUNT(*) FILTER (WHERE link_status = 'not_imported')::integer AS not_imported,
    COUNT(*) FILTER (WHERE link_status = 'at_risk')::integer AS at_risk,
    COUNT(*) FILTER (WHERE link_status = 'quantity_mismatch')::integer AS quantity_mismatch
  FROM public.mart_bina_work_order_status
),
purchasing AS (
  SELECT
    COUNT(*) FILTER (WHERE flow_type = 'purchase_request' AND COALESCE(remaining_quantity, 0) > 0)::integer AS open_request_lines,
    COALESCE(SUM(total_amount) FILTER (WHERE flow_type = 'purchase_request' AND COALESCE(remaining_quantity, 0) > 0), 0)::numeric AS open_request_amount
  FROM public.mart_bina_purchase_flow
),
suppliers AS (
  SELECT
    COUNT(DISTINCT supplier_code)::integer AS supplier_count,
    COALESCE(SUM(open_balance), 0)::numeric AS open_balance,
    COALESCE(SUM(overdue_balance), 0)::numeric AS overdue_balance
  FROM public.mart_bina_supplier_aging
),
sales AS (
  SELECT
    COUNT(*)::integer AS invoice_count,
    COALESCE(SUM(total_amount), 0)::numeric AS total_amount
  FROM public.mart_bina_sales_status
),
deliveries AS (
  SELECT
    COUNT(*)::integer AS total,
    COUNT(*) FILTER (WHERE delivery_state = 'sent_open')::integer AS sent_open
  FROM public.mart_bina_delivery_status
)
SELECT
  sync.last_synced_at,
  sync.stale_tables,
  sync.empty_tables,
  sync.table_count,
  work_orders.total AS work_order_total,
  work_orders.not_imported AS work_order_not_imported,
  work_orders.at_risk AS work_order_at_risk,
  work_orders.quantity_mismatch AS work_order_quantity_mismatch,
  purchasing.open_request_lines,
  purchasing.open_request_amount,
  suppliers.supplier_count,
  suppliers.open_balance AS supplier_open_balance,
  suppliers.overdue_balance AS supplier_overdue_balance,
  sales.invoice_count AS sales_invoice_count,
  sales.total_amount AS sales_total_amount,
  deliveries.total AS delivery_total,
  deliveries.sent_open AS delivery_sent_open
FROM sync
CROSS JOIN work_orders
CROSS JOIN purchasing
CROSS JOIN suppliers
CROSS JOIN sales
CROSS JOIN deliveries;

CREATE INDEX IF NOT EXISTS idx_bina_links_bina ON public.bina_gestelit_links (bina_table, bina_id);
CREATE INDEX IF NOT EXISTS idx_bina_links_gestelit ON public.bina_gestelit_links (gestelit_entity_type, gestelit_entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session ON public.ai_chat_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_session ON public.ai_tool_calls (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_security_events_session ON public.ai_security_events (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_bina_dfhazmrashi_work_order_expr ON public.bina_dfhazmrashi ((public.bina_json_int(data->>'MisparDFHazmana')));
CREATE INDEX IF NOT EXISTS idx_bina_dfshelita_work_order_expr ON public.bina_dfshelita ((public.bina_json_int(data->>'MisparRashi')));
CREATE INDEX IF NOT EXISTS idx_bina_dfhazmglyonot_work_order_expr ON public.bina_dfhazmglyonot ((public.bina_json_int(data->>'MisparRashi')));
CREATE INDEX IF NOT EXISTS idx_bina_heshsapakrashi_supplier_expr ON public.bina_heshsapakrashi ((public.bina_json_int(data->>'KodSapak')));
CREATE INDEX IF NOT EXISTS idx_bina_bakashanigrar_item_expr ON public.bina_bakashanigrar ((data->>'KodParit'));
CREATE INDEX IF NOT EXISTS idx_bina_bakashanigrar_supplier_expr ON public.bina_bakashanigrar ((public.bina_json_int(data->>'KodSapak')));
CREATE INDEX IF NOT EXISTS idx_bina_tovinrashi_supplier_expr ON public.bina_tovinrashi ((public.bina_json_int(data->>'KodSapak')));
CREATE INDEX IF NOT EXISTS idx_bina_heshbonitrashi_customer_expr ON public.bina_heshbonitrashi ((public.bina_json_int(data->>'KodLako')));
CREATE INDEX IF NOT EXISTS idx_bina_hovot_supplier_expr ON public.bina_hovot ((public.bina_json_int(data->>'KodSapak')));
CREATE INDEX IF NOT EXISTS idx_bina_mishloahrashi_work_order_expr ON public.bina_mishloahrashi ((public.bina_json_int(data->>'MisparHazmana')));
