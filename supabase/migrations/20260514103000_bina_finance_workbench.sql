-- BINA finance operational workbench.
-- Builds typed read-only finance transactions, summary, aging, and exception
-- views over the existing BINA staging layer.

CREATE OR REPLACE VIEW public.mart_bina_finance_transactions AS
WITH customer_invoices AS (
  SELECT
    'customer_invoice'::text AS kind,
    'receivable'::text AS finance_direction,
    'customer'::text AS party_type,
    'חשבונית לקוח'::text AS document_type_label,
    h.bina_id,
    h.invoice_no::text AS document_no,
    h.customer_code AS party_code,
    h.customer_name AS party_name,
    h.invoice_at AS document_at,
    h.due_at,
    h.total_amount,
    CASE
      WHEN h.paid_flag::text IN ('1', 'true', 'TRUE') THEN 0::numeric
      WHEN h.total_amount IS NOT NULL THEN h.total_amount
      ELSE NULL::numeric
    END AS open_amount,
    NULLIF(btrim(NULL::text), '') AS currency,
    CASE
      WHEN h.paid_flag::text IN ('1', 'true', 'TRUE') THEN 'paid'
      WHEN h.total_amount IS NOT NULL THEN 'open_inferred'
      ELSE 'unknown'
    END AS paid_status,
    CASE
      WHEN h.paid_flag::text IN ('1', 'true', 'TRUE') THEN 'exact'
      WHEN h.total_amount IS NOT NULL THEN 'inferred'
      ELSE 'missing_data'
    END AS balance_confidence,
    h.work_order_id AS related_work_order_id,
    h.delivery_no AS related_delivery_no,
    h.salesperson,
    NULL::integer AS related_goods_receipt_no,
    h.synced_at
  FROM public.stg_bina_customer_invoice_headers h
),
supplier_invoices AS (
  SELECT
    'supplier_invoice'::text AS kind,
    'payable'::text AS finance_direction,
    'supplier'::text AS party_type,
    'חשבונית ספק'::text AS document_type_label,
    h.bina_id,
    h.supplier_invoice_no::text AS document_no,
    h.supplier_code AS party_code,
    h.supplier_name AS party_name,
    h.invoice_at AS document_at,
    h.due_at,
    h.total_amount,
    NULL::numeric AS open_amount,
    NULLIF(btrim(h.currency), '') AS currency,
    'unknown'::text AS paid_status,
    'missing_data'::text AS balance_confidence,
    NULL::integer AS related_work_order_id,
    NULL::integer AS related_delivery_no,
    NULL::text AS salesperson,
    NULL::integer AS related_goods_receipt_no,
    h.synced_at
  FROM public.stg_bina_supplier_invoice_headers h
),
debts AS (
  SELECT
    'debt'::text AS kind,
    'payable'::text AS finance_direction,
    'supplier'::text AS party_type,
    'חוב פתוח'::text AS document_type_label,
    d.bina_id,
    d.reference_no AS document_no,
    d.supplier_code AS party_code,
    d.supplier_name AS party_name,
    d.registered_at AS document_at,
    d.due_at,
    d.amount AS total_amount,
    d.balance AS open_amount,
    NULLIF(btrim(d.currency), '') AS currency,
    CASE
      WHEN COALESCE(d.balance, 0) <= 0 THEN 'paid'
      WHEN d.due_at IS NOT NULL AND d.due_at < now() THEN 'overdue'
      ELSE 'open'
    END AS paid_status,
    'exact'::text AS balance_confidence,
    NULL::integer AS related_work_order_id,
    NULL::integer AS related_delivery_no,
    NULL::text AS salesperson,
    NULL::integer AS related_goods_receipt_no,
    d.synced_at
  FROM public.stg_bina_debts d
),
combined AS (
  SELECT * FROM customer_invoices
  UNION ALL
  SELECT * FROM supplier_invoices
  UNION ALL
  SELECT * FROM debts
),
classified AS (
  SELECT
    c.*,
    COALESCE(NULLIF(c.currency, ''), 'ILS') AS currency_group,
    CASE
      WHEN c.document_at IS NULL AND c.due_at IS NULL THEN 'missing'
      WHEN (c.document_at IS NOT NULL AND (EXTRACT(YEAR FROM c.document_at) < 2000 OR EXTRACT(YEAR FROM c.document_at) > 2035))
        OR (c.due_at IS NOT NULL AND (EXTRACT(YEAR FROM c.due_at) < 2000 OR EXTRACT(YEAR FROM c.due_at) > 2035))
        THEN 'suspicious'
      ELSE 'valid'
    END AS date_quality
  FROM combined c
)
SELECT
  classified.*,
  CASE
    WHEN date_quality <> 'valid' THEN 'לא תקין'
    WHEN due_at IS NULL OR COALESCE(open_amount, 0) <= 0 THEN 'לא רלוונטי'
    WHEN due_at >= now() THEN 'שוטף'
    WHEN due_at >= now() - interval '30 days' THEN '1-30'
    WHEN due_at >= now() - interval '60 days' THEN '31-60'
    WHEN due_at >= now() - interval '90 days' THEN '61-90'
    ELSE '90+'
  END AS aging_bucket,
  CASE
    WHEN date_quality <> 'valid' OR due_at IS NULL OR COALESCE(open_amount, 0) <= 0 THEN NULL::integer
    ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - due_at)) / 86400)::integer)
  END AS overdue_days,
  CASE
    WHEN date_quality <> 'valid' THEN 90
    WHEN due_at IS NOT NULL AND COALESCE(open_amount, 0) > 0 AND due_at < now() - interval '90 days' THEN 80
    WHEN due_at IS NOT NULL AND COALESCE(open_amount, 0) > 0 AND due_at < now() THEN 70
    WHEN due_at IS NOT NULL AND COALESCE(open_amount, 0) > 0 AND due_at <= now() + interval '7 days' THEN 45
    WHEN balance_confidence = 'missing_data' THEN 25
    ELSE 10
  END AS risk_score,
  CASE
    WHEN date_quality = 'suspicious' THEN 'תאריך מסמך או פירעון חשוד ולכן לא נכנס לחישובי גיל חוב'
    WHEN date_quality = 'missing' THEN 'חסרים תאריכי מסמך ופירעון'
    WHEN due_at IS NOT NULL AND COALESCE(open_amount, 0) > 0 AND due_at < now() THEN 'יתרה פתוחה עברה את תאריך הפירעון'
    WHEN due_at IS NOT NULL AND COALESCE(open_amount, 0) > 0 AND due_at <= now() + interval '7 days' THEN 'יתרה פתוחה לפירעון בשבוע הקרוב'
    WHEN balance_confidence = 'missing_data' THEN 'אין נתון יתרה אמין למסמך הזה'
    WHEN related_work_order_id IS NULL AND finance_direction = 'receivable' THEN 'לא נמצא קישור לפק״ע'
    ELSE 'למעקב'
  END AS risk_reason
FROM classified;

CREATE OR REPLACE VIEW public.mart_bina_finance_summary AS
SELECT
  currency_group,
  COUNT(*)::integer AS document_count,
  COUNT(*) FILTER (WHERE kind = 'customer_invoice')::integer AS customer_invoice_count,
  COUNT(*) FILTER (WHERE kind = 'supplier_invoice')::integer AS supplier_invoice_count,
  COUNT(*) FILTER (WHERE kind = 'debt')::integer AS debt_count,
  COUNT(*) FILTER (WHERE date_quality <> 'valid')::integer AS suspicious_date_count,
  COALESCE(SUM(total_amount) FILTER (WHERE finance_direction = 'receivable' AND date_quality = 'valid'), 0)::numeric AS receivable_total,
  COALESCE(SUM(open_amount) FILTER (WHERE finance_direction = 'receivable' AND date_quality = 'valid'), 0)::numeric AS receivable_open,
  COALESCE(SUM(open_amount) FILTER (WHERE finance_direction = 'receivable' AND date_quality = 'valid' AND due_at < now()), 0)::numeric AS receivable_overdue,
  COALESCE(SUM(total_amount) FILTER (WHERE kind = 'supplier_invoice' AND date_quality = 'valid'), 0)::numeric AS supplier_invoice_total,
  COALESCE(SUM(open_amount) FILTER (WHERE finance_direction = 'payable' AND date_quality = 'valid'), 0)::numeric AS payable_open,
  COALESCE(SUM(open_amount) FILTER (WHERE finance_direction = 'payable' AND date_quality = 'valid' AND due_at < now()), 0)::numeric AS payable_overdue,
  COALESCE(SUM(open_amount) FILTER (
    WHERE date_quality = 'valid'
      AND COALESCE(open_amount, 0) > 0
      AND due_at >= now()
      AND due_at <= now() + interval '7 days'
  ), 0)::numeric AS due_this_week,
  MAX(synced_at) AS last_synced_at
FROM public.mart_bina_finance_transactions
GROUP BY currency_group;

CREATE OR REPLACE VIEW public.mart_bina_finance_aging AS
SELECT
  currency_group,
  finance_direction,
  party_type,
  aging_bucket,
  COUNT(*)::integer AS document_count,
  COALESCE(SUM(open_amount), 0)::numeric AS open_amount,
  MAX(synced_at) AS last_synced_at
FROM public.mart_bina_finance_transactions
WHERE date_quality = 'valid'
  AND COALESCE(open_amount, 0) > 0
GROUP BY currency_group, finance_direction, party_type, aging_bucket;

CREATE OR REPLACE VIEW public.mart_bina_finance_exceptions AS
SELECT *
FROM public.mart_bina_finance_transactions
WHERE date_quality <> 'valid'
   OR (date_quality = 'valid' AND COALESCE(open_amount, 0) > 0 AND due_at < now())
   OR balance_confidence = 'missing_data'
   OR (finance_direction = 'receivable' AND related_work_order_id IS NULL)
ORDER BY risk_score DESC, due_at ASC NULLS LAST, document_at DESC NULLS LAST;

CREATE OR REPLACE VIEW public.mart_bina_finance AS
SELECT
  kind,
  bina_id,
  document_no,
  party_code,
  party_name,
  document_at,
  due_at,
  total_amount,
  open_amount AS balance,
  currency,
  synced_at
FROM public.mart_bina_finance_transactions;
