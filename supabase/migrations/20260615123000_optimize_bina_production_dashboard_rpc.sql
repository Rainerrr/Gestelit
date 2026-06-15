-- Optimize production cockpit RPC to avoid repeated full decision-view scans.

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
