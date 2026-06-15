-- Bound the production cockpit RPC to a recent operational sample for fast dashboard loads.
-- Rich cross-domain relationship joins remain available in the work-order drawer.

CREATE OR REPLACE FUNCTION public.rpc_bina_production_dashboard(filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH config AS (
  SELECT LEAST(GREATEST(COALESCE((filters->>'limit')::integer, 1000), 100), 5000)::integer AS limit_rows
),
wo AS MATERIALIZED (
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
    bina_production_row_count,
    link_status,
    CASE
      WHEN gestelit_job_id IS NULL THEN 'missing_import'
      WHEN link_status = 'quantity_mismatch' THEN 'quantity_mismatch'
      WHEN link_status = 'at_risk' THEN 'late_or_unfinished'
      WHEN COALESCE(bina_production_row_count, 0) = 0 THEN 'missing_route_rows'
      ELSE 'ready_or_linked'
    END AS blocker_type,
    CASE
      WHEN gestelit_job_id IS NULL THEN 'לא יובא לגסטליט'
      WHEN link_status = 'quantity_mismatch' THEN 'פער כמות בין BINA לגסטליט'
      WHEN link_status = 'at_risk' THEN 'תאריך אספקה עבר והייצור לא הושלם'
      WHEN COALESCE(bina_production_row_count, 0) = 0 THEN 'אין שורות מסלול/ייצור מ-BINA'
      ELSE 'נראה מוכן או מקושר, בכפוף לאמון הנתונים'
    END AS next_action_reason,
    CASE
      WHEN gestelit_job_id IS NULL THEN 75
      WHEN link_status = 'quantity_mismatch' THEN 90
      WHEN link_status = 'at_risk' THEN 70
      WHEN COALESCE(bina_production_row_count, 0) = 0 THEN 40
      ELSE 10
    END AS priority_score
  FROM (
    SELECT *
    FROM public.mart_bina_work_order_status
    ORDER BY work_order_id DESC NULLS LAST
    LIMIT (SELECT limit_rows FROM config)
  ) src
),
purchase_blockers AS MATERIALIZED (
  SELECT
    work_order_id,
    COUNT(*) FILTER (WHERE flow_type = 'purchase_request')::integer AS purchase_request_count,
    COUNT(*) FILTER (WHERE flow_type = 'goods_receipt')::integer AS goods_receipt_count,
    COALESCE(SUM(remaining_quantity) FILTER (WHERE flow_type = 'purchase_request'), 0)::numeric AS open_purchase_quantity,
    COALESCE(SUM(total_amount) FILTER (WHERE flow_type = 'purchase_request'), 0)::numeric AS open_purchase_amount,
    MAX(synced_at) AS evidence_synced_at
  FROM public.mart_bina_purchase_flow
  WHERE work_order_id IS NOT NULL
  GROUP BY work_order_id
),
delivery_blockers AS MATERIALIZED (
  SELECT
    work_order_id,
    COUNT(*)::integer AS delivery_count,
    COUNT(*) FILTER (WHERE delivery_state = 'sent_open')::integer AS sent_open_delivery_count,
    MAX(sent_at) AS last_sent_at,
    MAX(synced_at) AS evidence_synced_at
  FROM public.mart_bina_delivery_status
  WHERE work_order_id IS NOT NULL
  GROUP BY work_order_id
),
dashboard_rows AS MATERIALIZED (
  SELECT
    wo.bina_id,
    wo.work_order_id,
    wo.customer_name,
    wo.customer_code,
    wo.title,
    wo.status_text,
    wo.bina_quantity,
    wo.due_at,
    wo.synced_at,
    wo.gestelit_job_id,
    wo.gestelit_job_number,
    wo.gestelit_planned_quantity,
    wo.gestelit_completed_good,
    wo.link_status,
    wo.blocker_type,
    wo.next_action_reason,
    'production'::text AS owner_role,
    wo.priority_score,
    CASE WHEN wo.gestelit_job_id IS NOT NULL THEN 'exact' ELSE 'inferred' END AS relationship_confidence,
    0::integer AS route_machine_count,
    0::integer AS purchase_request_count,
    0::integer AS delivery_count,
    0::integer AS finance_document_count,
    wo.synced_at AS evidence_synced_at
  FROM wo
  UNION ALL
  SELECT
    wo.bina_id,
    wo.work_order_id,
    wo.customer_name,
    wo.customer_code,
    wo.title,
    wo.status_text,
    wo.bina_quantity,
    wo.due_at,
    wo.synced_at,
    wo.gestelit_job_id,
    wo.gestelit_job_number,
    wo.gestelit_planned_quantity,
    wo.gestelit_completed_good,
    wo.link_status,
    'material_or_purchase_open'::text,
    'יש רכש/כמות פתוחה שיכולה לחסום שיגור'::text,
    'purchasing'::text,
    65::integer,
    CASE WHEN wo.gestelit_job_id IS NOT NULL THEN 'exact' ELSE 'inferred' END,
    0::integer,
    purchase_blockers.purchase_request_count,
    0::integer,
    0::integer,
    GREATEST(wo.synced_at, purchase_blockers.evidence_synced_at)
  FROM wo
  JOIN purchase_blockers ON purchase_blockers.work_order_id = wo.work_order_id
  WHERE purchase_blockers.open_purchase_quantity > 0
  UNION ALL
  SELECT
    wo.bina_id,
    wo.work_order_id,
    wo.customer_name,
    wo.customer_code,
    wo.title,
    wo.status_text,
    wo.bina_quantity,
    wo.due_at,
    wo.synced_at,
    wo.gestelit_job_id,
    wo.gestelit_job_number,
    wo.gestelit_planned_quantity,
    wo.gestelit_completed_good,
    wo.link_status,
    'sent_open_delivery'::text,
    'משלוח יצא ועדיין פתוח'::text,
    'logistics'::text,
    55::integer,
    CASE WHEN wo.gestelit_job_id IS NOT NULL THEN 'exact' ELSE 'inferred' END,
    0::integer,
    0::integer,
    delivery_blockers.delivery_count,
    0::integer,
    GREATEST(wo.synced_at, delivery_blockers.evidence_synced_at)
  FROM wo
  JOIN delivery_blockers ON delivery_blockers.work_order_id = wo.work_order_id
  WHERE delivery_blockers.sent_open_delivery_count > 0
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
    (SELECT COUNT(*)::integer FROM wo) AS work_order_count,
    (SELECT COUNT(*)::integer FROM wo WHERE gestelit_job_id IS NULL) AS not_imported_count,
    (SELECT COUNT(*)::integer FROM wo WHERE link_status = 'quantity_mismatch') AS quantity_mismatch_count,
    (SELECT COUNT(*)::integer FROM wo WHERE link_status = 'at_risk') AS at_risk_count,
    (SELECT COUNT(*)::integer FROM purchase_blockers WHERE open_purchase_quantity > 0) AS material_blocked_count,
    (SELECT COUNT(*)::integer FROM delivery_blockers WHERE sent_open_delivery_count > 0) AS sent_open_delivery_count,
    (SELECT COUNT(*)::integer FROM wo WHERE blocker_type = 'ready_or_linked' AND gestelit_job_id IS NOT NULL) AS ready_or_linked_count,
    (SELECT COUNT(*)::integer FROM wo WHERE COALESCE(bina_production_row_count, 0) = 0) AS missing_route_count,
    (SELECT MAX(synced_at) FROM wo) AS last_evidence_synced_at,
    (SELECT limit_rows FROM config) AS dashboard_sample_limit,
    'recent_work_orders'::text AS dashboard_scope
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
    WHEN coverage.partial_tables > 0 OR metrics.work_order_count >= metrics.dashboard_sample_limit THEN 'partial_sample'
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
