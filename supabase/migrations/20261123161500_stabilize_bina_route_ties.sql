-- Source rows can share a work-line number or start timestamp. Keep inferred
-- station suggestions stable across equivalent query plans.
SET lock_timeout='3s';
CREATE OR REPLACE VIEW public.mart_bina_route_suggestions AS
WITH route_rows AS (
  SELECT
    p.work_order_id,
    p.bina_id,
    p.source_table,
    p.work_line_no,
    p.machine_name,
    COALESCE(NULLIF(p.machine_name, ''), p.source_table) AS operation_key,
    p.started_at,
    p.ended_at,
    p.synced_at
  FROM public.stg_bina_production_rows p
  WHERE p.work_order_id IS NOT NULL
),
mapped AS (
  SELECT
    r.*,
    m.station_id AS mapped_station_id,
    s.name AS mapped_station_name,
    s.code AS mapped_station_code,
    m.confidence AS mapping_confidence
  FROM route_rows r
  LEFT JOIN public.bina_station_mappings m
    ON m.operation_key = r.operation_key
   AND m.is_active = true
  LEFT JOIN public.stations s
    ON s.id = m.station_id
   AND s.is_active = true
)
SELECT
  work_order_id,
  COUNT(*)::integer AS route_row_count,
  COUNT(DISTINCT source_table)::integer AS source_table_count,
  COUNT(DISTINCT NULLIF(machine_name, ''))::integer AS machine_count,
  COUNT(*) FILTER (WHERE mapped_station_id IS NOT NULL)::integer AS mapped_step_count,
  COUNT(*) FILTER (WHERE mapped_station_id IS NULL)::integer AS unmapped_step_count,
  ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(source_table, '')), NULL) AS source_tables,
  ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(machine_name, '')), NULL) AS machine_names,
  ARRAY_REMOVE(ARRAY_AGG(DISTINCT mapped_station_name), NULL) AS mapped_station_names,
  MIN(started_at) AS first_started_at,
  MAX(ended_at) AS last_ended_at,
  MAX(synced_at) AS synced_at,
  CASE
    WHEN COUNT(*) = 0 THEN 'missing_data'
    WHEN COUNT(*) FILTER (WHERE mapped_station_id IS NULL) > 0 THEN 'inferred'
    ELSE 'exact'
  END AS route_confidence,
  (
    ARRAY_AGG(COALESCE(mapped_station_name, machine_name, source_table) ORDER BY started_at DESC NULLS LAST, source_table, bina_id)
      FILTER (WHERE ended_at IS NULL AND started_at IS NOT NULL)
  )[1] AS current_station_label,
  (
    ARRAY_AGG(COALESCE(mapped_station_name, machine_name, source_table) ORDER BY work_line_no ASC NULLS LAST, source_table, bina_id)
      FILTER (WHERE started_at IS NULL)
  )[1] AS next_station_label
FROM mapped
GROUP BY work_order_id;
CREATE OR REPLACE VIEW public.mart_bina_material_readiness AS
WITH requirements AS (
  SELECT
    p.work_order_id,
    NULLIF(p.item_code, '') AS item_code,
    MAX(NULLIF(p.item_name, '')) AS item_name,
    COALESCE(SUM(p.planned_quantity), 0)::numeric AS required_quantity,
    MAX(p.synced_at) AS synced_at
  FROM public.stg_bina_production_rows p
  WHERE p.work_order_id IS NOT NULL
  GROUP BY p.work_order_id, NULLIF(p.item_code, '')
),
inventory AS (
  SELECT
    item_code,
    COALESCE(SUM(stock_quantity), 0)::numeric AS stock_quantity,
    MAX(synced_at) AS synced_at
  FROM public.stg_bina_inventory_items
  WHERE item_code IS NOT NULL
  GROUP BY item_code
),
purchases AS (
  SELECT
    item_code,
    COUNT(*) FILTER (WHERE flow_type = 'purchase_request')::integer AS purchase_request_count,
    COALESCE(SUM(remaining_quantity) FILTER (WHERE flow_type = 'purchase_request'), 0)::numeric AS open_purchase_quantity,
    MAX(synced_at) AS synced_at
  FROM public.mart_bina_purchase_flow
  WHERE item_code IS NOT NULL
  GROUP BY item_code
),
line_readiness AS (
  SELECT
    r.work_order_id,
    r.item_code,
    r.item_name,
    r.required_quantity,
    COALESCE(i.stock_quantity, 0)::numeric AS stock_quantity,
    COALESCE(p.open_purchase_quantity, 0)::numeric AS open_purchase_quantity,
    COALESCE(p.purchase_request_count, 0)::integer AS purchase_request_count,
    GREATEST(r.synced_at, i.synced_at, p.synced_at) AS synced_at,
    CASE
      WHEN r.item_code IS NULL THEN 'unknown'
      WHEN r.required_quantity <= 0 THEN 'unknown'
      WHEN COALESCE(i.stock_quantity, 0) >= r.required_quantity THEN 'ready_inferred_inventory'
      ELSE 'short_or_unknown'
    END AS readiness_state
  FROM requirements r
  LEFT JOIN inventory i ON i.item_code = r.item_code
  LEFT JOIN purchases p ON p.item_code = r.item_code
)
SELECT
  work_order_id,
  COUNT(*)::integer AS required_item_count,
  COUNT(*) FILTER (WHERE readiness_state = 'ready_inferred_inventory')::integer AS ready_item_count,
  COUNT(*) FILTER (WHERE open_purchase_quantity > 0)::integer AS purchase_requested_item_count,
  COUNT(*) FILTER (WHERE readiness_state IN ('short_or_unknown','unknown'))::integer AS short_or_unknown_item_count,
  COALESCE(SUM(required_quantity), 0)::numeric AS required_quantity,
  COALESCE(SUM(stock_quantity), 0)::numeric AS matched_stock_quantity,
  COALESCE(SUM(open_purchase_quantity), 0)::numeric AS open_purchase_quantity,
  MAX(synced_at) AS synced_at,
  CASE
    WHEN COUNT(*) = 0 THEN 'unknown'
    WHEN COUNT(*) FILTER (WHERE readiness_state IN ('short_or_unknown','unknown')) > 0 THEN 'short_or_unknown'
    WHEN COUNT(*) FILTER (WHERE readiness_state = 'ready_inferred_inventory') = COUNT(*) THEN 'ready_inferred_inventory'
    ELSE 'unknown'
  END AS material_state,
  CASE
    WHEN COUNT(*) = 0 THEN 'missing_data'
    ELSE 'inferred'
  END AS material_confidence,
  'Inferred item-stock signal: DFMlay stock and purchase requests are joined by item_code only; This calculation does not allocate TnuotMlay movements to jobs, so it is not exact allocated material readiness.'::text AS trust_note,
  COALESCE(jsonb_agg(to_jsonb(line_readiness) ORDER BY item_code) FILTER (WHERE item_code IS NOT NULL), '[]'::jsonb) AS evidence_lines
FROM line_readiness
GROUP BY work_order_id;
RESET lock_timeout;
