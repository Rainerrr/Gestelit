-- Upgrade production cockpit RPC to use aggregate material readiness, route
-- suggestions, and metric trust instead of rebuilding these facts in the app.

CREATE OR REPLACE FUNCTION public.rpc_bina_production_dashboard(filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH config AS (
  SELECT LEAST(GREATEST(COALESCE((filters->>'limit')::integer, 1000), 100), 5000)::integer AS limit_rows
),
wo AS MATERIALIZED (
  SELECT *
  FROM public.mart_bina_work_order_status
  ORDER BY work_order_id DESC NULLS LAST
  LIMIT (SELECT limit_rows FROM config)
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
joined AS MATERIALIZED (
  SELECT
    wo.*,
    COALESCE(route.route_row_count, wo.bina_production_row_count, 0)::integer AS route_row_count,
    COALESCE(route.source_table_count, 0)::integer AS route_source_table_count,
    COALESCE(route.machine_count, 0)::integer AS route_machine_count,
    COALESCE(route.mapped_step_count, 0)::integer AS mapped_step_count,
    COALESCE(route.unmapped_step_count, 0)::integer AS unmapped_step_count,
    COALESCE(route.source_tables, ARRAY[]::text[]) AS route_source_tables,
    COALESCE(route.machine_names, ARRAY[]::text[]) AS route_machine_names,
    COALESCE(route.mapped_station_names, ARRAY[]::text[]) AS mapped_station_names,
    route.current_station_label,
    route.next_station_label,
    COALESCE(route.route_confidence, 'missing_data') AS route_confidence,
    COALESCE(material.material_state, 'unknown') AS material_state,
    COALESCE(material.material_confidence, 'missing_data') AS material_confidence,
    material.required_item_count,
    material.ready_item_count,
    material.purchase_requested_item_count,
    material.short_or_unknown_item_count,
    material.open_purchase_quantity AS material_open_purchase_quantity,
    material.trust_note AS material_trust_note,
    purchase_blockers.purchase_request_count,
    purchase_blockers.goods_receipt_count,
    purchase_blockers.open_purchase_quantity,
    purchase_blockers.open_purchase_amount,
    purchase_blockers.evidence_synced_at AS purchase_synced_at,
    delivery_blockers.delivery_count,
    delivery_blockers.sent_open_delivery_count,
    delivery_blockers.last_sent_at,
    delivery_blockers.evidence_synced_at AS delivery_synced_at
  FROM wo
  LEFT JOIN public.mart_bina_route_suggestions route ON route.work_order_id = wo.work_order_id
  LEFT JOIN public.mart_bina_material_readiness material ON material.work_order_id = wo.work_order_id
  LEFT JOIN purchase_blockers ON purchase_blockers.work_order_id = wo.work_order_id
  LEFT JOIN delivery_blockers ON delivery_blockers.work_order_id = wo.work_order_id
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
    CASE
      WHEN gestelit_job_id IS NULL THEN 'missing_import'
      WHEN link_status = 'quantity_mismatch' THEN 'quantity_mismatch'
      WHEN link_status = 'at_risk' THEN 'late_or_unfinished'
      WHEN route_row_count = 0 THEN 'missing_route_rows'
      ELSE 'ready_or_linked'
    END AS blocker_type,
    CASE
      WHEN gestelit_job_id IS NULL THEN 'לא יובא לגסטליט'
      WHEN link_status = 'quantity_mismatch' THEN 'פער כמות בין BINA לגסטליט'
      WHEN link_status = 'at_risk' THEN 'תאריך אספקה עבר והייצור לא הושלם'
      WHEN route_row_count = 0 THEN 'אין שורות מסלול/ייצור מ-BINA'
      ELSE 'נראה מוכן או מקושר, בכפוף לאמון הנתונים'
    END AS next_action_reason,
    'production'::text AS owner_role,
    CASE
      WHEN link_status = 'quantity_mismatch' THEN 90
      WHEN gestelit_job_id IS NULL THEN 75
      WHEN link_status = 'at_risk' THEN 70
      WHEN route_row_count = 0 THEN 40
      ELSE 10
    END AS priority_score,
    CASE WHEN gestelit_job_id IS NOT NULL THEN 'exact' ELSE 'inferred' END AS relationship_confidence,
    route_row_count,
    route_source_table_count,
    route_machine_count,
    mapped_step_count,
    unmapped_step_count,
    route_source_tables,
    route_machine_names,
    mapped_station_names,
    current_station_label,
    next_station_label,
    route_confidence,
    material_state,
    material_confidence,
    required_item_count,
    ready_item_count,
    purchase_requested_item_count,
    short_or_unknown_item_count,
    material_open_purchase_quantity,
    material_trust_note,
    COALESCE(purchase_request_count, 0)::integer AS purchase_request_count,
    COALESCE(goods_receipt_count, 0)::integer AS goods_receipt_count,
    COALESCE(delivery_count, 0)::integer AS delivery_count,
    GREATEST(synced_at, purchase_synced_at, delivery_synced_at) AS evidence_synced_at
  FROM joined
  UNION ALL
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
    'material_or_purchase_open'::text,
    CASE
      WHEN material_state = 'short_or_unknown' THEN 'חומר חסר או לא ניתן לאימות מלא'
      WHEN material_state = 'purchase_requested' THEN 'יש בקשת רכש פתוחה לפריטים בעבודה'
      ELSE 'יש רכש/כמות פתוחה שיכולה לחסום שיגור'
    END,
    'purchasing'::text,
    CASE WHEN material_state = 'short_or_unknown' THEN 78 ELSE 65 END,
    CASE WHEN gestelit_job_id IS NOT NULL THEN 'exact' ELSE 'inferred' END,
    route_row_count,
    route_source_table_count,
    route_machine_count,
    mapped_step_count,
    unmapped_step_count,
    route_source_tables,
    route_machine_names,
    mapped_station_names,
    current_station_label,
    next_station_label,
    route_confidence,
    material_state,
    material_confidence,
    required_item_count,
    ready_item_count,
    purchase_requested_item_count,
    short_or_unknown_item_count,
    material_open_purchase_quantity,
    material_trust_note,
    COALESCE(purchase_request_count, 0)::integer,
    COALESCE(goods_receipt_count, 0)::integer,
    0::integer,
    GREATEST(synced_at, purchase_synced_at)
  FROM joined
  WHERE material_state IN ('short_or_unknown','purchase_requested')
     OR COALESCE(open_purchase_quantity, 0) > 0
  UNION ALL
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
    'sent_open_delivery'::text,
    'משלוח יצא ועדיין פתוח'::text,
    'logistics'::text,
    55::integer,
    CASE WHEN gestelit_job_id IS NOT NULL THEN 'exact' ELSE 'inferred' END,
    route_row_count,
    route_source_table_count,
    route_machine_count,
    mapped_step_count,
    unmapped_step_count,
    route_source_tables,
    route_machine_names,
    mapped_station_names,
    current_station_label,
    next_station_label,
    route_confidence,
    material_state,
    material_confidence,
    required_item_count,
    ready_item_count,
    purchase_requested_item_count,
    short_or_unknown_item_count,
    material_open_purchase_quantity,
    material_trust_note,
    0::integer,
    0::integer,
    COALESCE(delivery_count, 0)::integer,
    GREATEST(synced_at, delivery_synced_at)
  FROM joined
  WHERE COALESCE(sent_open_delivery_count, 0) > 0
),
coverage AS (
  SELECT
    COUNT(*)::integer AS table_count,
    COUNT(*) FILTER (WHERE coverage_status LIKE '%partial%')::integer AS partial_tables,
    COUNT(*) FILTER (WHERE freshness_status = 'stale')::integer AS stale_tables,
    COUNT(*) FILTER (WHERE freshness_status = 'empty')::integer AS empty_tables,
    MAX(last_table_sync_at) AS last_synced_at,
    bool_and(is_executive_truth) AS all_complete
  FROM public.mart_bina_metric_trust
  WHERE source_table IN ('DFHazmRashi','DFShelita','DFHazmMontage','DFHazmNigrar','DFHazmGimur','DFHazmGrafika','DFHazmKirkia','DFHazmKedam','DFHazmGlyonot','BakashaNigrar','TovinRashi','TovinNigrar','DFMlay','TnuotMlay','MishloahRashi','HeshbonitRashi')
),
metrics AS (
  SELECT
    (SELECT COUNT(*)::integer FROM joined) AS work_order_count,
    (SELECT COUNT(*)::integer FROM joined WHERE gestelit_job_id IS NULL) AS not_imported_count,
    (SELECT COUNT(*)::integer FROM joined WHERE link_status = 'quantity_mismatch') AS quantity_mismatch_count,
    (SELECT COUNT(*)::integer FROM joined WHERE link_status = 'at_risk') AS at_risk_count,
    (SELECT COUNT(*)::integer FROM joined WHERE material_state IN ('short_or_unknown','purchase_requested') OR COALESCE(open_purchase_quantity, 0) > 0) AS material_blocked_count,
    (SELECT COUNT(*)::integer FROM joined WHERE COALESCE(sent_open_delivery_count, 0) > 0) AS sent_open_delivery_count,
    (SELECT COUNT(*)::integer FROM joined WHERE link_status = 'linked' AND gestelit_job_id IS NOT NULL) AS ready_or_linked_count,
    (SELECT COUNT(*)::integer FROM joined WHERE route_row_count = 0) AS missing_route_count,
    (SELECT COUNT(*)::integer FROM joined WHERE unmapped_step_count > 0) AS unmapped_route_count,
    (SELECT COUNT(*)::integer FROM joined WHERE material_state = 'ready_inferred_inventory') AS material_ready_inferred_count,
    (SELECT MAX(evidence_synced_at) FROM dashboard_rows) AS last_evidence_synced_at,
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
    WHEN coverage.partial_tables > 0 THEN 'partial_sample'
    WHEN coverage.empty_tables > 0 THEN 'empty'
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
