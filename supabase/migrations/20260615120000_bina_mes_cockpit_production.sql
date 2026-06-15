-- BINA -> Gestelit MES cockpit production layer.
-- Additive read-only views/RPCs for dispatch and work-order control tower.

CREATE OR REPLACE VIEW public.mart_bina_work_order_decision_facts AS
WITH production AS (
  SELECT
    work_order_id,
    COUNT(*)::integer AS production_row_count,
    COUNT(DISTINCT source_table)::integer AS source_table_count,
    COUNT(DISTINCT NULLIF(machine_name, ''))::integer AS machine_count,
    MIN(started_at) AS first_started_at,
    MAX(ended_at) AS last_ended_at,
    MAX(synced_at) AS production_synced_at,
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(source_table, '')), NULL) AS source_tables,
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(machine_name, '')), NULL) AS machine_names
  FROM public.stg_bina_production_rows
  WHERE work_order_id IS NOT NULL
  GROUP BY work_order_id
),
purchasing AS (
  SELECT
    work_order_id,
    COUNT(*) FILTER (WHERE flow_type = 'purchase_request')::integer AS purchase_request_count,
    COUNT(*) FILTER (WHERE flow_type = 'goods_receipt')::integer AS goods_receipt_count,
    COALESCE(SUM(remaining_quantity) FILTER (WHERE flow_type = 'purchase_request'), 0)::numeric AS open_purchase_quantity,
    COALESCE(SUM(total_amount) FILTER (WHERE flow_type = 'purchase_request'), 0)::numeric AS open_purchase_amount,
    MAX(synced_at) AS purchase_synced_at
  FROM public.mart_bina_purchase_flow
  WHERE work_order_id IS NOT NULL
  GROUP BY work_order_id
),
deliveries AS (
  SELECT
    work_order_id,
    COUNT(*)::integer AS delivery_count,
    COUNT(*) FILTER (WHERE delivery_state = 'sent_open')::integer AS sent_open_delivery_count,
    MAX(sent_at) AS last_sent_at,
    MAX(synced_at) AS delivery_synced_at
  FROM public.mart_bina_delivery_status
  WHERE work_order_id IS NOT NULL
  GROUP BY work_order_id
),
finance AS (
  SELECT
    related_work_order_id AS work_order_id,
    COUNT(*)::integer AS finance_document_count,
    COALESCE(SUM(open_amount) FILTER (WHERE finance_direction = 'receivable'), 0)::numeric AS receivable_open,
    COALESCE(SUM(open_amount) FILTER (WHERE finance_direction = 'payable'), 0)::numeric AS payable_open,
    COUNT(*) FILTER (WHERE paid_status = 'overdue')::integer AS overdue_finance_count,
    MAX(synced_at) AS finance_synced_at
  FROM public.mart_bina_finance_transactions
  WHERE related_work_order_id IS NOT NULL
  GROUP BY related_work_order_id
),
sales AS (
  SELECT
    work_order_id,
    COUNT(*)::integer AS invoice_count,
    COALESCE(SUM(total_amount), 0)::numeric AS sales_amount,
    COUNT(*) FILTER (WHERE paid_flag::text IS DISTINCT FROM '1')::integer AS unpaid_or_unknown_invoice_count,
    MAX(synced_at) AS sales_synced_at
  FROM public.mart_bina_sales_status
  WHERE work_order_id IS NOT NULL
  GROUP BY work_order_id
)
SELECT
  wo.bina_id,
  wo.work_order_id,
  wo.customer_name,
  wo.customer_code,
  wo.title,
  wo.status_code,
  wo.status_text,
  wo.bina_quantity,
  wo.created_at,
  wo.due_at,
  wo.synced_at,
  wo.gestelit_job_id,
  wo.gestelit_job_number,
  wo.gestelit_due_date,
  wo.gestelit_item_count,
  wo.gestelit_planned_quantity,
  wo.gestelit_completed_good,
  wo.bina_production_row_count,
  wo.link_status,
  COALESCE(production.production_row_count, 0) AS route_row_count,
  COALESCE(production.source_table_count, 0) AS route_source_table_count,
  COALESCE(production.machine_count, 0) AS route_machine_count,
  COALESCE(production.source_tables, ARRAY[]::text[]) AS route_source_tables,
  COALESCE(production.machine_names, ARRAY[]::text[]) AS route_machine_names,
  production.first_started_at,
  production.last_ended_at,
  COALESCE(purchasing.purchase_request_count, 0) AS purchase_request_count,
  COALESCE(purchasing.goods_receipt_count, 0) AS goods_receipt_count,
  COALESCE(purchasing.open_purchase_quantity, 0) AS open_purchase_quantity,
  COALESCE(purchasing.open_purchase_amount, 0) AS open_purchase_amount,
  COALESCE(deliveries.delivery_count, 0) AS delivery_count,
  COALESCE(deliveries.sent_open_delivery_count, 0) AS sent_open_delivery_count,
  deliveries.last_sent_at,
  COALESCE(finance.finance_document_count, 0) AS finance_document_count,
  COALESCE(finance.receivable_open, 0) AS receivable_open,
  COALESCE(finance.payable_open, 0) AS payable_open,
  COALESCE(finance.overdue_finance_count, 0) AS overdue_finance_count,
  COALESCE(sales.invoice_count, 0) AS invoice_count,
  COALESCE(sales.sales_amount, 0) AS sales_amount,
  COALESCE(sales.unpaid_or_unknown_invoice_count, 0) AS unpaid_or_unknown_invoice_count,
  GREATEST(
    wo.synced_at,
    production.production_synced_at,
    purchasing.purchase_synced_at,
    deliveries.delivery_synced_at,
    finance.finance_synced_at,
    sales.sales_synced_at
  ) AS evidence_synced_at,
  CASE
    WHEN wo.gestelit_job_id IS NULL THEN 'missing_import'
    WHEN wo.link_status = 'quantity_mismatch' THEN 'quantity_mismatch'
    WHEN wo.due_at IS NOT NULL AND wo.due_at < now() AND COALESCE(wo.gestelit_completed_good, 0) < COALESCE(NULLIF(wo.gestelit_planned_quantity, 0), wo.bina_quantity, 1) THEN 'late_or_unfinished'
    WHEN COALESCE(purchasing.open_purchase_quantity, 0) > 0 THEN 'material_or_purchase_open'
    WHEN COALESCE(deliveries.sent_open_delivery_count, 0) > 0 THEN 'sent_open_delivery'
    WHEN COALESCE(finance.overdue_finance_count, 0) > 0 THEN 'finance_attention'
    WHEN COALESCE(production.production_row_count, 0) = 0 THEN 'missing_route_rows'
    ELSE 'ready_or_linked'
  END AS blocker_type,
  CASE
    WHEN wo.gestelit_job_id IS NULL THEN 'לא יובא לגסטליט'
    WHEN wo.link_status = 'quantity_mismatch' THEN 'פער כמות בין BINA לגסטליט'
    WHEN wo.due_at IS NOT NULL AND wo.due_at < now() AND COALESCE(wo.gestelit_completed_good, 0) < COALESCE(NULLIF(wo.gestelit_planned_quantity, 0), wo.bina_quantity, 1) THEN 'תאריך אספקה עבר והייצור לא הושלם'
    WHEN COALESCE(purchasing.open_purchase_quantity, 0) > 0 THEN 'יש רכש/כמות פתוחה שיכולה לחסום שיגור'
    WHEN COALESCE(deliveries.sent_open_delivery_count, 0) > 0 THEN 'משלוח יצא ועדיין פתוח'
    WHEN COALESCE(finance.overdue_finance_count, 0) > 0 THEN 'קיים מסמך כספי באיחור שדורש תשומת לב'
    WHEN COALESCE(production.production_row_count, 0) = 0 THEN 'אין שורות מסלול/ייצור מ-BINA'
    ELSE 'נראה מוכן או מקושר, בכפוף לאמון הנתונים'
  END AS next_action_reason,
  CASE
    WHEN wo.gestelit_job_id IS NULL THEN 'production'
    WHEN wo.link_status = 'quantity_mismatch' THEN 'production'
    WHEN COALESCE(purchasing.open_purchase_quantity, 0) > 0 THEN 'purchasing'
    WHEN COALESCE(deliveries.sent_open_delivery_count, 0) > 0 THEN 'logistics'
    WHEN COALESCE(finance.overdue_finance_count, 0) > 0 THEN 'finance'
    WHEN COALESCE(production.production_row_count, 0) = 0 THEN 'system'
    ELSE 'production'
  END AS owner_role,
  CASE
    WHEN wo.link_status IN ('at_risk', 'quantity_mismatch') THEN 90
    WHEN wo.gestelit_job_id IS NULL THEN 75
    WHEN wo.due_at IS NOT NULL AND wo.due_at < now() THEN 70
    WHEN COALESCE(purchasing.open_purchase_quantity, 0) > 0 THEN 65
    WHEN COALESCE(deliveries.sent_open_delivery_count, 0) > 0 THEN 55
    WHEN COALESCE(finance.overdue_finance_count, 0) > 0 THEN 45
    WHEN COALESCE(production.production_row_count, 0) = 0 THEN 40
    ELSE 10
  END AS priority_score,
  CASE
    WHEN wo.gestelit_job_id IS NOT NULL THEN 'exact'
    WHEN wo.work_order_id IS NOT NULL THEN 'inferred'
    ELSE 'missing_data'
  END AS relationship_confidence
FROM public.mart_bina_work_order_status wo
LEFT JOIN production ON production.work_order_id = wo.work_order_id
LEFT JOIN purchasing ON purchasing.work_order_id = wo.work_order_id
LEFT JOIN deliveries ON deliveries.work_order_id = wo.work_order_id
LEFT JOIN finance ON finance.work_order_id = wo.work_order_id
LEFT JOIN sales ON sales.work_order_id = wo.work_order_id;

CREATE OR REPLACE VIEW public.mart_bina_unmapped_operations AS
SELECT
  COALESCE(NULLIF(machine_name, ''), source_table) AS operation_key,
  source_table,
  machine_name,
  COUNT(*)::integer AS row_count,
  COUNT(DISTINCT work_order_id)::integer AS work_order_count,
  MAX(synced_at) AS last_synced_at,
  'needs_mapping'::text AS mapping_status
FROM public.stg_bina_production_rows
WHERE COALESCE(NULLIF(machine_name, ''), source_table) IS NOT NULL
GROUP BY source_table, machine_name;

CREATE OR REPLACE FUNCTION public.rpc_bina_production_dashboard(filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH facts AS MATERIALIZED (
  SELECT *
  FROM public.mart_bina_work_order_decision_facts
),
dashboard_rows AS MATERIALIZED (
  SELECT
    bina_id,
    work_order_id,
    customer_name,
    customer_code,
    title,
    status_text,
    bina_quantity,
    due_at,
    synced_at,
    gestelit_job_id,
    gestelit_job_number,
    gestelit_planned_quantity,
    gestelit_completed_good,
    link_status,
    blocker_type,
    next_action_reason,
    owner_role,
    priority_score,
    relationship_confidence,
    route_machine_count,
    purchase_request_count,
    delivery_count,
    finance_document_count,
    evidence_synced_at
  FROM facts
),
coverage AS (
  SELECT
    COUNT(*)::integer AS table_count,
    COUNT(*) FILTER (WHERE sample_limited)::integer AS partial_tables,
    COUNT(*) FILTER (WHERE freshness_status = 'stale')::integer AS stale_tables,
    MAX(last_row_synced_at) AS last_synced_at,
    bool_and(is_complete_snapshot) AS all_complete
  FROM public.mart_bina_sync_coverage
  WHERE source_table IN ('DFHazmRashi','DFShelita','DFHazmMontage','DFHazmNigrar','DFHazmGimur','DFHazmGrafika','DFHazmKirkia','DFHazmKedam','DFHazmGlyonot','BakashaNigrar','TovinRashi','MishloahRashi','HeshbonitRashi')
),
metrics AS (
  SELECT
    COUNT(*)::integer AS work_order_count,
    COUNT(*) FILTER (WHERE gestelit_job_id IS NULL)::integer AS not_imported_count,
    COUNT(*) FILTER (WHERE link_status = 'quantity_mismatch')::integer AS quantity_mismatch_count,
    COUNT(*) FILTER (WHERE link_status = 'at_risk' OR blocker_type = 'late_or_unfinished')::integer AS at_risk_count,
    COUNT(*) FILTER (WHERE blocker_type = 'material_or_purchase_open')::integer AS material_blocked_count,
    COUNT(*) FILTER (WHERE blocker_type = 'sent_open_delivery')::integer AS sent_open_delivery_count,
    COUNT(*) FILTER (WHERE blocker_type = 'ready_or_linked' AND gestelit_job_id IS NOT NULL)::integer AS ready_or_linked_count,
    COUNT(*) FILTER (WHERE route_row_count = 0)::integer AS missing_route_count,
    MAX(evidence_synced_at) AS last_evidence_synced_at
  FROM facts
),
lanes AS (
  SELECT jsonb_build_object(
    'missing_import', COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY priority_score DESC, due_at ASC NULLS LAST) FROM (SELECT * FROM dashboard_rows WHERE blocker_type = 'missing_import' ORDER BY priority_score DESC, due_at ASC NULLS LAST LIMIT 8) row), '[]'::jsonb),
    'quantity_mismatch', COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY priority_score DESC, due_at ASC NULLS LAST) FROM (SELECT * FROM dashboard_rows WHERE blocker_type = 'quantity_mismatch' ORDER BY priority_score DESC, due_at ASC NULLS LAST LIMIT 8) row), '[]'::jsonb),
    'late_or_unfinished', COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY priority_score DESC, due_at ASC NULLS LAST) FROM (SELECT * FROM dashboard_rows WHERE blocker_type = 'late_or_unfinished' ORDER BY priority_score DESC, due_at ASC NULLS LAST LIMIT 8) row), '[]'::jsonb),
    'material_or_purchase_open', COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY priority_score DESC, due_at ASC NULLS LAST) FROM (SELECT * FROM dashboard_rows WHERE blocker_type = 'material_or_purchase_open' ORDER BY priority_score DESC, due_at ASC NULLS LAST LIMIT 8) row), '[]'::jsonb),
    'sent_open_delivery', COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY priority_score DESC, due_at ASC NULLS LAST) FROM (SELECT * FROM dashboard_rows WHERE blocker_type = 'sent_open_delivery' ORDER BY priority_score DESC, due_at ASC NULLS LAST LIMIT 8) row), '[]'::jsonb),
    'ready_or_linked', COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY due_at ASC NULLS LAST) FROM (SELECT * FROM dashboard_rows WHERE blocker_type = 'ready_or_linked' ORDER BY due_at ASC NULLS LAST LIMIT 8) row), '[]'::jsonb)
  ) AS data
),
top_risks AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY priority_score DESC, due_at ASC NULLS LAST), '[]'::jsonb) AS rows
  FROM (
    SELECT *
    FROM dashboard_rows
    WHERE priority_score >= 40
    ORDER BY priority_score DESC, due_at ASC NULLS LAST
    LIMIT 12
  ) row
),
unmapped AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row_count DESC), '[]'::jsonb) AS rows
  FROM (
    SELECT *
    FROM public.mart_bina_unmapped_operations
    ORDER BY row_count DESC
    LIMIT 12
  ) row
)
SELECT jsonb_build_object(
  'coverage', to_jsonb(coverage),
  'coverageStatus', CASE
    WHEN coverage.partial_tables > 0 THEN 'partial_sample'
    WHEN coverage.stale_tables > 0 THEN 'stale'
    ELSE 'complete'
  END,
  'metrics', to_jsonb(metrics),
  'lanes', lanes.data,
  'risks', top_risks.rows,
  'unmappedOperations', unmapped.rows
)
FROM coverage, metrics, lanes, top_risks, unmapped;
$$;
