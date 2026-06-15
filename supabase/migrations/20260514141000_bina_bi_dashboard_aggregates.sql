-- BINA BI dashboard aggregate and data-trust layer.
-- Additive only: raw bina_* landing tables remain sync-owned and read-only for app usage.

CREATE OR REPLACE VIEW public.mart_bina_sync_coverage AS
SELECT
  h.source_table,
  h.storage_table,
  h.row_count,
  h.last_row_synced_at,
  h.age_seconds,
  h.freshness_status,
  'recent_window'::text AS sync_scope,
  NULL::bigint AS source_row_count,
  NULL::text AS source_min_id,
  NULL::text AS source_max_id,
  NULL::timestamptz AS source_min_date,
  h.last_row_synced_at AS source_max_date,
  false AS is_complete_snapshot,
  true AS sample_limited,
  CASE
    WHEN h.freshness_status = 'empty' THEN 'empty'
    WHEN h.freshness_status = 'stale' THEN 'stale_partial'
    ELSE 'partial_sample'
  END AS coverage_status,
  'PowerShell sync currently sends recent TOP windows unless a future full snapshot marks this table complete.'::text AS coverage_note
FROM public.mart_bina_sync_health h;

CREATE OR REPLACE VIEW public.mart_bina_data_quality AS
SELECT
  'sync'::text AS domain,
  source_table AS source_name,
  freshness_status AS issue_type,
  CASE freshness_status
    WHEN 'empty' THEN 'טבלת BINA ריקה או לא סונכרנה'
    WHEN 'stale' THEN 'טבלת BINA מיושנת'
    ELSE 'טבלת BINA תקינה'
  END AS issue_label_he,
  row_count::bigint AS affected_count,
  last_row_synced_at AS latest_synced_at,
  CASE freshness_status
    WHEN 'empty' THEN 'high'
    WHEN 'stale' THEN 'medium'
    ELSE 'low'
  END AS severity
FROM public.mart_bina_sync_health
WHERE freshness_status <> 'ok'

UNION ALL

SELECT
  'finance'::text,
  'mart_bina_finance_transactions'::text,
  date_quality,
  CASE date_quality
    WHEN 'suspicious' THEN 'תאריכים חשודים הוצאו מחישובי גיל חוב'
    WHEN 'missing' THEN 'חסרים תאריכים למסמכים כספיים'
    ELSE 'איכות תאריך תקינה'
  END,
  COUNT(*)::bigint,
  MAX(synced_at),
  CASE date_quality
    WHEN 'suspicious' THEN 'high'
    WHEN 'missing' THEN 'medium'
    ELSE 'low'
  END
FROM public.mart_bina_finance_transactions
WHERE date_quality <> 'valid'
GROUP BY date_quality

UNION ALL

SELECT
  'finance'::text,
  'mart_bina_finance_transactions'::text,
  'bad_encoding'::text,
  'שמות לקוח/ספק מוצגים עם סימני שאלה ודורשים סנכרון UTF-8 נקי',
  COUNT(*)::bigint,
  MAX(synced_at),
  'medium'::text
FROM public.mart_bina_finance_transactions
WHERE party_name LIKE '%???%'
HAVING COUNT(*) > 0

UNION ALL

SELECT
  'finance'::text,
  'mart_bina_finance_transactions'::text,
  'missing_currency'::text,
  'מטבע חסר במסמכים כספיים ולכן מוצג כ-ILS רק אם זו הנחת ברירת מחדל',
  COUNT(*)::bigint,
  MAX(synced_at),
  'medium'::text
FROM public.mart_bina_finance_transactions
WHERE currency IS NULL
  AND kind <> 'customer_invoice'
HAVING COUNT(*) > 0;

CREATE OR REPLACE VIEW public.mart_bina_finance_summary_by_currency_confidence AS
SELECT
  currency_group AS currency_code,
  finance_direction,
  party_type,
  balance_confidence,
  date_quality,
  COUNT(*)::integer AS document_count,
  COALESCE(SUM(total_amount), 0)::numeric AS total_amount,
  COALESCE(SUM(open_amount), 0)::numeric AS open_amount,
  COALESCE(SUM(open_amount) FILTER (
    WHERE date_quality = 'valid'
      AND COALESCE(open_amount, 0) > 0
      AND due_at < now()
  ), 0)::numeric AS overdue_amount,
  MAX(synced_at) AS last_synced_at
FROM public.mart_bina_finance_transactions
GROUP BY currency_group, finance_direction, party_type, balance_confidence, date_quality;

CREATE OR REPLACE VIEW public.mart_bina_work_order_metrics_daily AS
SELECT
  COALESCE(date_trunc('day', due_at), date_trunc('day', synced_at))::date AS metric_date,
  COUNT(*)::integer AS work_order_count,
  COUNT(*) FILTER (WHERE link_status = 'not_imported')::integer AS not_imported_count,
  COUNT(*) FILTER (WHERE link_status = 'quantity_mismatch')::integer AS quantity_mismatch_count,
  COUNT(*) FILTER (WHERE link_status = 'at_risk')::integer AS at_risk_count,
  COUNT(*) FILTER (WHERE due_at IS NOT NULL AND due_at < now())::integer AS overdue_count,
  MAX(synced_at) AS last_synced_at
FROM public.mart_bina_work_order_status
GROUP BY COALESCE(date_trunc('day', due_at), date_trunc('day', synced_at))::date;

CREATE OR REPLACE VIEW public.mart_bina_purchase_metrics AS
SELECT
  COALESCE(currency, 'ILS') AS currency_code,
  COUNT(*) FILTER (WHERE flow_type = 'purchase_request')::integer AS purchase_request_lines,
  COUNT(*) FILTER (WHERE flow_type = 'goods_receipt')::integer AS goods_receipt_lines,
  COUNT(*) FILTER (WHERE flow_type = 'purchase_request' AND COALESCE(remaining_quantity, 0) > 0)::integer AS open_request_lines,
  COALESCE(SUM(remaining_quantity) FILTER (WHERE flow_type = 'purchase_request'), 0)::numeric AS open_quantity,
  COALESCE(SUM(total_amount) FILTER (WHERE flow_type = 'purchase_request' AND COALESCE(remaining_quantity, 0) > 0), 0)::numeric AS open_amount,
  COUNT(DISTINCT supplier_code) FILTER (WHERE supplier_code IS NOT NULL)::integer AS supplier_count,
  MAX(synced_at) AS last_synced_at
FROM public.mart_bina_purchase_flow
GROUP BY COALESCE(currency, 'ILS');

CREATE OR REPLACE VIEW public.mart_bina_supplier_aging_buckets AS
SELECT
  supplier_code,
  supplier_name,
  COALESCE(currency, 'ILS') AS currency_code,
  CASE
    WHEN oldest_due_at IS NULL THEN 'unknown'
    WHEN oldest_due_at >= now() THEN 'current'
    WHEN oldest_due_at >= now() - interval '30 days' THEN '1-30'
    WHEN oldest_due_at >= now() - interval '60 days' THEN '31-60'
    WHEN oldest_due_at >= now() - interval '90 days' THEN '61-90'
    ELSE '90+'
  END AS aging_bucket,
  open_balance,
  overdue_balance,
  open_items,
  oldest_due_at,
  synced_at
FROM public.mart_bina_supplier_aging;

CREATE OR REPLACE VIEW public.mart_bina_sales_metrics_daily AS
SELECT
  COALESCE(date_trunc('day', invoice_at), date_trunc('day', synced_at))::date AS metric_date,
  COUNT(*)::integer AS invoice_count,
  COUNT(DISTINCT customer_code) FILTER (WHERE customer_code IS NOT NULL)::integer AS customer_count,
  COALESCE(SUM(total_amount), 0)::numeric AS total_amount,
  COUNT(*) FILTER (WHERE paid_flag::text NOT IN ('1', 'true', 'TRUE'))::integer AS unpaid_or_unknown_count,
  MAX(synced_at) AS last_synced_at
FROM public.mart_bina_sales_status
GROUP BY COALESCE(date_trunc('day', invoice_at), date_trunc('day', synced_at))::date;

CREATE OR REPLACE VIEW public.mart_bina_delivery_metrics AS
SELECT
  delivery_state,
  COUNT(*)::integer AS delivery_count,
  COUNT(*) FILTER (WHERE sent_at IS NOT NULL AND sent_at < now() - interval '7 days' AND delivery_state = 'sent_open')::integer AS old_sent_open_count,
  COUNT(DISTINCT carrier) FILTER (WHERE carrier IS NOT NULL)::integer AS carrier_count,
  MAX(synced_at) AS last_synced_at
FROM public.mart_bina_delivery_status
GROUP BY delivery_state;

CREATE OR REPLACE VIEW public.mart_bina_finance_metrics_daily AS
SELECT
  COALESCE(date_trunc('day', due_at), date_trunc('day', document_at), date_trunc('day', synced_at))::date AS metric_date,
  currency_group AS currency_code,
  balance_confidence,
  COUNT(*)::integer AS document_count,
  COALESCE(SUM(open_amount) FILTER (WHERE finance_direction = 'receivable' AND date_quality = 'valid'), 0)::numeric AS receivable_open,
  COALESCE(SUM(open_amount) FILTER (WHERE finance_direction = 'payable' AND date_quality = 'valid'), 0)::numeric AS payable_open,
  COALESCE(SUM(open_amount) FILTER (WHERE date_quality = 'valid' AND COALESCE(open_amount, 0) > 0 AND due_at < now()), 0)::numeric AS overdue_open,
  COUNT(*) FILTER (WHERE date_quality <> 'valid')::integer AS suspicious_or_missing_dates,
  MAX(synced_at) AS last_synced_at
FROM public.mart_bina_finance_transactions
GROUP BY
  COALESCE(date_trunc('day', due_at), date_trunc('day', document_at), date_trunc('day', synced_at))::date,
  currency_group,
  balance_confidence;

CREATE OR REPLACE VIEW public.mart_bina_finance_party_aging AS
SELECT
  party_type,
  party_code,
  party_name,
  currency_group AS currency_code,
  balance_confidence,
  aging_bucket,
  COUNT(*)::integer AS document_count,
  COALESCE(SUM(open_amount), 0)::numeric AS open_amount,
  COALESCE(SUM(open_amount) FILTER (WHERE due_at < now() AND date_quality = 'valid'), 0)::numeric AS overdue_amount,
  MIN(due_at) FILTER (WHERE COALESCE(open_amount, 0) > 0 AND date_quality = 'valid') AS oldest_due_at,
  MAX(synced_at) AS last_synced_at
FROM public.mart_bina_finance_transactions
WHERE COALESCE(open_amount, 0) > 0
GROUP BY party_type, party_code, party_name, currency_group, balance_confidence, aging_bucket;

CREATE OR REPLACE VIEW public.mart_bina_cross_domain_risk AS
SELECT
  ('work_order:' || bina_id)::text AS risk_id,
  'production'::text AS domain,
  CASE link_status
    WHEN 'at_risk' THEN 'high'
    WHEN 'quantity_mismatch' THEN 'high'
    WHEN 'not_imported' THEN 'medium'
    ELSE 'low'
  END AS severity,
  'work_order'::text AS entity_type,
  bina_id,
  work_order_id::text AS entity_key,
  COALESCE(customer_name, title, work_order_id::text) AS entity_label,
  CASE link_status
    WHEN 'at_risk' THEN 'פק״ע בסיכון איחור לפי תאריך אספקה והתקדמות'
    WHEN 'quantity_mismatch' THEN 'פער כמות בין BINA לגסטליט'
    WHEN 'not_imported' THEN 'פק״ע קיימת ב-BINA ועדיין לא יובאה לגסטליט'
    ELSE 'למעקב'
  END AS risk_reason,
  'mart_bina_work_order_status'::text AS source_view,
  synced_at,
  CASE WHEN gestelit_job_id IS NOT NULL THEN 'exact' ELSE 'inferred' END AS confidence,
  CASE link_status
    WHEN 'at_risk' THEN 90
    WHEN 'quantity_mismatch' THEN 85
    WHEN 'not_imported' THEN 60
    ELSE 10
  END AS risk_score
FROM public.mart_bina_work_order_status
WHERE link_status <> 'linked'

UNION ALL

SELECT
  ('purchase:' || bina_id)::text,
  'purchasing'::text,
  CASE WHEN COALESCE(remaining_quantity, 0) > 0 THEN 'medium' ELSE 'low' END,
  'purchase_line'::text,
  bina_id,
  document_no,
  COALESCE(supplier_name, item_name, document_no),
  CASE
    WHEN COALESCE(remaining_quantity, 0) > 0 THEN 'שורת רכש פתוחה עם כמות שנותרה'
    ELSE 'שורת רכש למעקב'
  END,
  'mart_bina_purchase_flow'::text,
  synced_at,
  CASE WHEN work_order_id IS NOT NULL THEN 'exact' ELSE 'inferred' END,
  CASE WHEN COALESCE(remaining_quantity, 0) > 0 THEN 55 ELSE 20 END
FROM public.mart_bina_purchase_flow
WHERE flow_type = 'purchase_request'
  AND (COALESCE(remaining_quantity, 0) > 0 OR work_order_id IS NOT NULL)

UNION ALL

SELECT
  ('supplier:' || supplier_code || ':' || COALESCE(currency, 'ILS'))::text,
  'suppliers'::text,
  CASE WHEN COALESCE(overdue_balance, 0) > 0 THEN 'high' ELSE 'medium' END,
  'supplier'::text,
  supplier_code::text,
  supplier_code::text,
  supplier_name,
  CASE
    WHEN COALESCE(overdue_balance, 0) > 0 THEN 'יתרת ספק באיחור'
    ELSE 'יתרת ספק פתוחה'
  END,
  'mart_bina_supplier_aging'::text,
  synced_at,
  'exact'::text,
  CASE WHEN COALESCE(overdue_balance, 0) > 0 THEN 75 ELSE 45 END
FROM public.mart_bina_supplier_aging
WHERE COALESCE(open_balance, 0) > 0

UNION ALL

SELECT
  ('finance:' || kind || ':' || bina_id)::text,
  'finance'::text,
  CASE
    WHEN date_quality <> 'valid' THEN 'high'
    WHEN paid_status = 'overdue' THEN 'high'
    WHEN balance_confidence <> 'exact' THEN 'medium'
    ELSE 'low'
  END,
  'finance_document'::text,
  bina_id,
  document_no,
  COALESCE(party_name, document_no),
  risk_reason,
  'mart_bina_finance_transactions'::text,
  synced_at,
  balance_confidence,
  risk_score
FROM public.mart_bina_finance_transactions
WHERE risk_score >= 45

UNION ALL

SELECT
  ('delivery:' || bina_id)::text,
  'deliveries'::text,
  CASE
    WHEN delivery_state = 'sent_open' AND sent_at < now() - interval '7 days' THEN 'high'
    WHEN delivery_state = 'sent_open' THEN 'medium'
    ELSE 'low'
  END,
  'delivery'::text,
  bina_id,
  delivery_no::text,
  COALESCE(customer_name, delivery_no::text),
  CASE
    WHEN delivery_state = 'sent_open' AND sent_at < now() - interval '7 days' THEN 'משלוח יצא ופתוח מעל שבוע'
    WHEN delivery_state = 'sent_open' THEN 'משלוח יצא ועדיין פתוח'
    ELSE 'משלוח למעקב'
  END,
  'mart_bina_delivery_status'::text,
  synced_at,
  CASE WHEN work_order_id IS NOT NULL OR invoice_no IS NOT NULL THEN 'exact' ELSE 'inferred' END,
  CASE
    WHEN delivery_state = 'sent_open' AND sent_at < now() - interval '7 days' THEN 70
    WHEN delivery_state = 'sent_open' THEN 50
    ELSE 15
  END
FROM public.mart_bina_delivery_status
WHERE delivery_state = 'sent_open';

CREATE OR REPLACE FUNCTION public.rpc_bina_dashboard_summary(
  date_from date DEFAULT NULL,
  date_to date DEFAULT NULL,
  currency_code text DEFAULT NULL,
  require_complete_snapshot boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH coverage AS (
  SELECT
    COUNT(*)::integer AS table_count,
    COUNT(*) FILTER (WHERE is_complete_snapshot)::integer AS complete_tables,
    COUNT(*) FILTER (WHERE sample_limited)::integer AS partial_tables,
    COUNT(*) FILTER (WHERE coverage_status = 'empty')::integer AS empty_tables,
    COUNT(*) FILTER (WHERE coverage_status LIKE 'stale%')::integer AS stale_tables,
    MAX(last_row_synced_at) AS last_synced_at,
    bool_and(is_complete_snapshot) AS all_complete
  FROM public.mart_bina_sync_coverage
),
overview AS (
  SELECT * FROM public.mart_bina_overview_kpis
),
risks AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.risk_score DESC, r.synced_at DESC), '[]'::jsonb) AS rows
  FROM (
    SELECT *
    FROM public.mart_bina_cross_domain_risk
    ORDER BY risk_score DESC, synced_at DESC NULLS LAST
    LIMIT 12
  ) r
),
quality AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.severity DESC, q.affected_count DESC), '[]'::jsonb) AS rows
  FROM public.mart_bina_data_quality q
),
finance_confidence AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.currency_code, f.finance_direction, f.balance_confidence), '[]'::jsonb) AS rows
  FROM public.mart_bina_finance_summary_by_currency_confidence f
  WHERE rpc_bina_dashboard_summary.currency_code IS NULL
     OR f.currency_code = rpc_bina_dashboard_summary.currency_code
),
purchase_metrics AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.open_amount DESC), '[]'::jsonb) AS rows
  FROM public.mart_bina_purchase_metrics p
),
delivery_metrics AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.delivery_state), '[]'::jsonb) AS rows
  FROM public.mart_bina_delivery_metrics d
)
SELECT jsonb_build_object(
  'coverage', to_jsonb(coverage),
  'coverageStatus', CASE
    WHEN require_complete_snapshot AND NOT coverage.all_complete THEN 'blocked_partial_sample'
    WHEN coverage.partial_tables > 0 THEN 'partial_sample'
    WHEN coverage.stale_tables > 0 THEN 'stale'
    ELSE 'complete'
  END,
  'overview', to_jsonb(overview),
  'risks', risks.rows,
  'dataQuality', quality.rows,
  'financeByConfidence', finance_confidence.rows,
  'purchaseMetrics', purchase_metrics.rows,
  'deliveryMetrics', delivery_metrics.rows
)
FROM coverage, overview, risks, quality, finance_confidence, purchase_metrics, delivery_metrics;
$$;

INSERT INTO public.semantic_bina_metrics (id, domain, label_he, definition_he, source_views, grain, aliases_he)
VALUES
  ('bina_dashboard_summary', 'overview', 'סיכום BI תפעולי', 'סיכום הנהלה מאוגד עם כיסוי סנכרון, סיכונים, איכות נתונים, רכש, כספים ומשלוחים.', ARRAY['rpc_bina_dashboard_summary','mart_bina_cross_domain_risk','mart_bina_sync_coverage'], 'dashboard', ARRAY['דשבורד','סקירה','BI','תמונה כוללת']),
  ('bina_data_quality', 'sync', 'איכות נתוני BINA', 'חריגות איכות נתונים כגון סנכרון חלקי, תאריכים חשודים, קידוד לא תקין ומטבע חסר.', ARRAY['mart_bina_data_quality','mart_bina_sync_coverage'], 'issue_type', ARRAY['איכות נתונים','תאריכים חשודים','קידוד','partial sample']),
  ('finance_confidence', 'finance', 'אמינות יתרות כספיות', 'הפרדה בין יתרות מדויקות, משוערות וחסרות לפי מטבע וסוג גורם.', ARRAY['mart_bina_finance_summary_by_currency_confidence'], 'currency_confidence', ARRAY['יתרות משוערות','חוב מדויק','מטבע'])
ON CONFLICT (id) DO UPDATE
SET domain = EXCLUDED.domain,
    label_he = EXCLUDED.label_he,
    definition_he = EXCLUDED.definition_he,
    source_views = EXCLUDED.source_views,
    grain = EXCLUDED.grain,
    aliases_he = EXCLUDED.aliases_he,
    is_active = true,
    updated_at = now();
