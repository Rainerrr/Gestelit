-- Preserve live data and result semantics while enabling bounded indexed detail reads.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';
CREATE INDEX IF NOT EXISTS idx_bina_dfshelita_reporting_order ON public.bina_dfshelita(reporting_work_order_id);
CREATE INDEX IF NOT EXISTS idx_bina_sheets_reporting_order ON public.bina_dfhazmglyonot(reporting_work_order_id);
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
  r.synced_at,
  public.bina_json_timestamptz(r.data->>'TarikKabala') AS received_at
FROM public.bina_dfhazmrashi r;

CREATE OR REPLACE VIEW public.stg_bina_production_rows AS
SELECT
  'DFShelita'::text AS source_table,
  s.bina_id,
  s.reporting_work_order_id AS work_order_id,
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
  g.reporting_work_order_id,
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
  END AS link_status,
  wo.received_at
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
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS production_row_count
  FROM public.stg_bina_production_rows p
  WHERE p.work_order_id = wo.work_order_id
) pr ON true;

CREATE OR REPLACE VIEW public.mart_bina_work_order_decision_facts AS
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
  END AS relationship_confidence,
  wo.received_at
FROM public.mart_bina_work_order_status wo
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::integer AS production_row_count,
    COUNT(DISTINCT source_table)::integer AS source_table_count,
    COUNT(DISTINCT NULLIF(machine_name, ''))::integer AS machine_count,
    MIN(started_at) AS first_started_at,
    MAX(ended_at) AS last_ended_at,
    MAX(synced_at) AS production_synced_at,
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(source_table, '')), NULL) AS source_tables,
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(machine_name, '')), NULL) AS machine_names
  FROM public.stg_bina_production_rows
  WHERE work_order_id = wo.work_order_id

) production ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE flow_type = 'purchase_request')::integer AS purchase_request_count,
    COUNT(*) FILTER (WHERE flow_type = 'goods_receipt')::integer AS goods_receipt_count,
    COALESCE(SUM(remaining_quantity) FILTER (WHERE flow_type = 'purchase_request'), 0)::numeric AS open_purchase_quantity,
    COALESCE(SUM(total_amount) FILTER (WHERE flow_type = 'purchase_request'), 0)::numeric AS open_purchase_amount,
    MAX(synced_at) AS purchase_synced_at
  FROM public.mart_bina_purchase_flow
  WHERE work_order_id = wo.work_order_id

) purchasing ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::integer AS delivery_count,
    COUNT(*) FILTER (WHERE delivery_state = 'sent_open')::integer AS sent_open_delivery_count,
    MAX(sent_at) AS last_sent_at,
    MAX(synced_at) AS delivery_synced_at
  FROM public.mart_bina_delivery_status
  WHERE work_order_id = wo.work_order_id

) deliveries ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::integer AS finance_document_count,
    COALESCE(SUM(open_amount) FILTER (WHERE finance_direction = 'receivable'), 0)::numeric AS receivable_open,
    COALESCE(SUM(open_amount) FILTER (WHERE finance_direction = 'payable'), 0)::numeric AS payable_open,
    COUNT(*) FILTER (WHERE paid_status = 'overdue')::integer AS overdue_finance_count,
    MAX(synced_at) AS finance_synced_at
  FROM public.mart_bina_finance_transactions
  WHERE related_work_order_id = wo.work_order_id

) finance ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::integer AS invoice_count,
    COALESCE(SUM(total_amount), 0)::numeric AS sales_amount,
    COUNT(*) FILTER (WHERE paid_flag::text IS DISTINCT FROM '1')::integer AS unpaid_or_unknown_invoice_count,
    MAX(synced_at) AS sales_synced_at
  FROM public.mart_bina_sales_status
  WHERE work_order_id = wo.work_order_id

) sales ON true;

-- Avoid materializing every joined mart column for a narrow query.
-- Historical compiler migration remains unchanged. Same scopes, allowlists,
-- 5-second PostgREST-hoisted timeout and row caps; no timeout increase.
CREATE OR REPLACE FUNCTION public.ai_query_analytics(plan jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
SET statement_timeout = '5s'
SET lock_timeout = '500ms'
AS $$
DECLARE
  dataset text := plan->>'dataset';
  view_name text;
  allowed text[];
  numeric_fields text[];
  cols text[] := ARRAY[]::text[];
  groups text[] := ARRAY[]::text[];
  outputs text[] := ARRAY[]::text[];
  selects text[] := ARRAY[]::text[];
  predicates text[] := ARRAY[]::text[];
  item jsonb;
  field text;
  operation text;
  operator_sql text;
  direction text;
  query_sql text;
  selected_sql text;
  source_projection text;
  required_fields text[] := ARRAY[]::text[];
  grouping_sql text := '';
  ordering_sql text := '';
  where_sql text := '';
  n integer := 0;
  row_limit integer := 100;
  result jsonb;
BEGIN
  IF jsonb_typeof(plan) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(plan) k WHERE k <> ALL(ARRAY['dataset','columns','groupBy','measures','filters','orderBy','limit'])) THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
  CASE dataset
    WHEN 'work_orders' THEN view_name := 'mart_bina_work_order_status'; allowed := ARRAY['work_order_id','customer_name','customer_code','title','status_text','bina_quantity','created_at','received_at','due_at','synced_at','link_status','gestelit_planned_quantity','gestelit_completed_good']; numeric_fields := ARRAY['bina_quantity','gestelit_planned_quantity','gestelit_completed_good'];
    WHEN 'purchasing' THEN view_name := 'mart_bina_purchase_flow'; allowed := ARRAY['flow_type','document_no','work_order_id','supplier_code','supplier_name','item_code','item_name','quantity','remaining_quantity','currency','document_at','synced_at']; numeric_fields := ARRAY['quantity','remaining_quantity'];
    WHEN 'deliveries' THEN view_name := 'mart_bina_delivery_status'; allowed := ARRAY['delivery_no','customer_name','customer_code','delivery_at','sent_at','work_order_id','invoice_no','delivery_state','synced_at']; numeric_fields := ARRAY[]::text[];
    WHEN 'finance' THEN view_name := 'mart_bina_finance_transactions'; allowed := ARRAY['kind','finance_direction','party_type','document_no','party_name','document_at','due_at','total_amount','open_amount','currency','paid_status','balance_confidence','related_work_order_id','synced_at']; numeric_fields := ARRAY['total_amount','open_amount'];
    ELSE RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID';
  END CASE;
  FOREACH field IN ARRAY ARRAY['columns','groupBy','measures','filters'] LOOP
    IF plan ? field AND (jsonb_typeof(plan->field) <> 'array' OR jsonb_array_length(plan->field) > CASE WHEN field = 'measures' THEN 4 ELSE 8 END) THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
  END LOOP;
  IF plan ? 'columns' AND plan ? 'measures' OR plan ? 'groupBy' AND NOT plan ? 'measures' THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
  IF plan ? 'columns' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(plan->'columns') LOOP
      field := item#>>'{}'; IF jsonb_typeof(item) <> 'string' OR field <> ALL(allowed) THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
      cols := array_append(cols, field);
    END LOOP;
  ELSE cols := allowed;
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(plan->'groupBy', '[]')) LOOP
    field := item#>>'{}'; IF jsonb_typeof(item) <> 'string' OR field <> ALL(allowed) THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
    groups := array_append(groups, field);
  END LOOP;
  IF plan ? 'measures' THEN
    IF jsonb_array_length(plan->'measures') = 0 THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
    FOREACH field IN ARRAY groups LOOP selects := array_append(selects, format('%I', field)); END LOOP;
    outputs := groups;
    FOR item IN SELECT * FROM jsonb_array_elements(plan->'measures') LOOP
      IF jsonb_typeof(item) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(item) k WHERE k <> ALL(ARRAY['op','column'])) THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
      operation := item->>'op'; field := item->>'column';
      IF operation = 'count' AND NOT item ? 'column' THEN selected_sql := 'count(*)';
      ELSIF operation = ANY(ARRAY['sum','avg','min','max']) AND field = ANY(numeric_fields) THEN
        IF dataset = 'finance' AND NOT ARRAY['currency','kind','balance_confidence'] <@ groups THEN RAISE EXCEPTION 'AI_QUERY_CURRENCY_SCOPE_REQUIRED'; END IF;
        selected_sql := format('%s(%I)', operation, field);
      ELSE RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
      IF field IS NOT NULL THEN required_fields := array_append(required_fields, field); END IF;
      selects := array_append(selects, format('%s AS %I', selected_sql, 'm' || n)); outputs := array_append(outputs, 'm' || n); n := n+1;
    END LOOP;
    IF cardinality(groups)>0 THEN SELECT ' GROUP BY ' || string_agg(format('%I',g), ',') INTO grouping_sql FROM unnest(groups) g; END IF;
  ELSE
    IF cardinality(cols)=0 THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
    FOREACH field IN ARRAY cols LOOP selects := array_append(selects, format('%I', field)); END LOOP;
    outputs := cols;
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(plan->'filters', '[]')) LOOP
    IF jsonb_typeof(item) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(item) k WHERE k <> ALL(ARRAY['column','op','value'])) THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
    field := item->>'column'; operation := item->>'op';
    IF field IS NULL OR field <> ALL(allowed) THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
    IF operation = 'is_null' AND NOT item ? 'value' THEN predicates := array_append(predicates, format('%I IS NULL', field));
    ELSE
      IF jsonb_typeof(item->'value') IS NULL OR jsonb_typeof(item->'value') <> ALL(ARRAY['string','number','boolean']) OR length(item->>'value')>300 THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
      IF operation = 'contains' THEN predicates := array_append(predicates, format('strpos(%I::text,%L)>0', field,item->>'value'));
      ELSE
        operator_sql := CASE operation WHEN 'eq' THEN '=' WHEN 'neq' THEN '<>' WHEN 'gt' THEN '>' WHEN 'gte' THEN '>=' WHEN 'lt' THEN '<' WHEN 'lte' THEN '<=' ELSE NULL END;
        IF operator_sql IS NULL THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
        predicates := array_append(predicates,format('%I %s %L',field,operator_sql,item->>'value'));
      END IF;
    END IF;
  END LOOP;
  IF cardinality(predicates)>0 THEN where_sql := ' WHERE ' || array_to_string(predicates, ' AND '); END IF;
  IF plan ? 'limit' THEN
    IF jsonb_typeof(plan->'limit') <> 'number' OR (plan->>'limit') !~ '^[0-9]{1,3}$' THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
    row_limit := (plan->>'limit')::integer;
    IF row_limit<1 OR row_limit>200 THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
  END IF;
  IF plan ? 'orderBy' THEN
    item := plan->'orderBy'; field := item->>'column'; direction := item->>'direction';
    IF jsonb_typeof(item) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(item) k WHERE k <> ALL(ARRAY['column','direction'])) OR field IS NULL OR field <> ALL(outputs) OR direction IS NULL OR direction <> ALL(ARRAY['asc','desc']) THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
    ordering_sql := format(' ORDER BY %I %s NULLS LAST',field,direction);
  END IF;
  -- Only fields required by the selected expressions plus the freshness field
  -- enter the bounded materialization. PostgreSQL can prune unused mart joins.
  -- The source cap is a sample, never a company-wide or ranked full-cache total.
  required_fields := required_fields || CASE WHEN plan ? 'measures' THEN groups ELSE cols END;
  required_fields := array_append(required_fields, 'synced_at');
  SELECT string_agg(format('%I', f), ',') INTO source_projection
  FROM (SELECT DISTINCT unnest(required_fields) AS f) projected;
  query_sql := format('WITH source AS MATERIALIZED (SELECT %s FROM public.%I%s LIMIT 20001), bounded AS MATERIALIZED (SELECT * FROM source LIMIT 20000), result AS (SELECT %s FROM bounded%s%s LIMIT %s) SELECT jsonb_build_object(''rows'',COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT * FROM result LIMIT %s) r),''[]''::jsonb),''scannedRows'',(SELECT count(*) FROM bounded),''sourceTruncated'',(SELECT count(*)>20000 FROM source),''outputTruncated'',(SELECT count(*)>%s FROM result),''freshness'',(SELECT min(synced_at) FROM bounded),''latestSync'',(SELECT max(synced_at) FROM bounded))', source_projection,view_name,where_sql,array_to_string(selects,','),grouping_sql,ordering_sql,row_limit+1,row_limit,row_limit);
  EXECUTE query_sql INTO result;
  RETURN result || jsonb_build_object('source',view_name,'coverage','synced_cache_only','limit',row_limit,'sourceSampling','unranked_bounded_sample');
END;
$$;
REVOKE ALL ON FUNCTION public.ai_query_analytics(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_query_analytics(jsonb) TO service_role;
COMMENT ON FUNCTION public.ai_query_analytics(jsonb) IS 'Admin AI closed query-plan compiler: fixed views/fields/aggregates/operators, no SQL input, bounded source/results. Service only; admin authorization is required at application boundary.';



-- Separate sales endpoint. viewer_id and requested_scope MUST come from the
-- authenticated server session, never model arguments or browser identity.
CREATE OR REPLACE FUNCTION public.ai_query_sales_analytics(plan jsonb, viewer_id uuid, requested_scope text DEFAULT 'personal')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
SET statement_timeout = '5s'
SET lock_timeout = '500ms'
AS $$
DECLARE
  dataset text := plan->>'dataset';
  view_name text;
  scope_sql text;
  allowed text[];
  numeric_fields text[];
  cols text[] := ARRAY[]::text[];
  groups text[] := ARRAY[]::text[];
  outputs text[] := ARRAY[]::text[];
  selects text[] := ARRAY[]::text[];
  predicates text[] := ARRAY[]::text[];
  item jsonb;
  field text;
  operation text;
  operator_sql text;
  direction text;
  query_sql text;
  selected_sql text;
  source_projection text;
  required_fields text[] := ARRAY[]::text[];
  grouping_sql text := '';
  ordering_sql text := '';
  where_sql text := '';
  n integer := 0;
  row_limit integer := 100;
  result jsonb;
BEGIN
  IF jsonb_typeof(plan) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(plan) k WHERE k <> ALL(ARRAY['dataset','columns','groupBy','measures','filters','orderBy','limit'])) THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
  IF NOT public.sales_user_has_scope(viewer_id, 'sales_ai_query') THEN RAISE EXCEPTION 'AI_QUERY_SCOPE_FORBIDDEN'; END IF;
  IF requested_scope = 'team' THEN
    IF NOT public.sales_user_has_scope(viewer_id, 'sales_team_view') THEN RAISE EXCEPTION 'AI_QUERY_SCOPE_FORBIDDEN'; END IF;
    scope_sql := 'true';
  ELSIF requested_scope = 'personal' AND public.sales_user_has_scope(viewer_id, 'sales_personal_view') THEN scope_sql := format('sales_user_id = %L::uuid', viewer_id);
  ELSE RAISE EXCEPTION 'AI_QUERY_SCOPE_FORBIDDEN'; END IF;
  IF dataset <> 'sales_activity' OR dataset IS NULL THEN RAISE EXCEPTION 'AI_QUERY_SCOPE_FORBIDDEN'; END IF;
  view_name := 'mart_sales_activity_scoped';
  allowed := ARRAY['id','event_type','event_at','salesperson','customer_name','customer_code','next_action_date','estimated_revenue','actual_revenue','currency','status','customer_group','area','account_manager','dormancy_bucket','coverage_scope','is_complete_contact_history','updated_at'];
  numeric_fields := ARRAY['estimated_revenue','actual_revenue'];
  FOREACH field IN ARRAY ARRAY['columns','groupBy','measures','filters'] LOOP
    IF plan ? field AND (jsonb_typeof(plan->field) <> 'array' OR jsonb_array_length(plan->field) > CASE WHEN field = 'measures' THEN 4 ELSE 8 END) THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
  END LOOP;
  IF plan ? 'columns' AND plan ? 'measures' OR plan ? 'groupBy' AND NOT plan ? 'measures' THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
  IF plan ? 'columns' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(plan->'columns') LOOP
      field := item#>>'{}'; IF jsonb_typeof(item) <> 'string' OR field <> ALL(allowed) THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
      cols := array_append(cols, field);
    END LOOP;
  ELSE cols := allowed;
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(plan->'groupBy', '[]')) LOOP
    field := item#>>'{}'; IF jsonb_typeof(item) <> 'string' OR field <> ALL(allowed) THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
    groups := array_append(groups, field);
  END LOOP;
  IF plan ? 'measures' THEN
    IF jsonb_array_length(plan->'measures') = 0 THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
    FOREACH field IN ARRAY groups LOOP selects := array_append(selects, format('%I', field)); END LOOP;
    outputs := groups;
    FOR item IN SELECT * FROM jsonb_array_elements(plan->'measures') LOOP
      IF jsonb_typeof(item) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(item) k WHERE k <> ALL(ARRAY['op','column'])) THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
      operation := item->>'op'; field := item->>'column';
      IF operation = 'count' AND NOT item ? 'column' THEN selected_sql := 'count(*)';
      ELSIF operation = ANY(ARRAY['sum','avg','min','max']) AND field = ANY(numeric_fields) THEN
        IF NOT ARRAY['currency'] <@ groups THEN RAISE EXCEPTION 'AI_QUERY_CURRENCY_SCOPE_REQUIRED'; END IF;
        selected_sql := format('%s(%I)', operation, field);
      ELSE RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
      IF field IS NOT NULL THEN required_fields := array_append(required_fields, field); END IF;
      selects := array_append(selects, format('%s AS %I', selected_sql, 'm' || n)); outputs := array_append(outputs, 'm' || n); n := n+1;
    END LOOP;
    IF cardinality(groups)>0 THEN SELECT ' GROUP BY ' || string_agg(format('%I',g), ',') INTO grouping_sql FROM unnest(groups) g; END IF;
  ELSE
    IF cardinality(cols)=0 THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
    FOREACH field IN ARRAY cols LOOP selects := array_append(selects, format('%I', field)); END LOOP;
    outputs := cols;
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(plan->'filters', '[]')) LOOP
    IF jsonb_typeof(item) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(item) k WHERE k <> ALL(ARRAY['column','op','value'])) THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
    field := item->>'column'; operation := item->>'op';
    IF field IS NULL OR field <> ALL(allowed) THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
    IF operation = 'is_null' AND NOT item ? 'value' THEN predicates := array_append(predicates, format('%I IS NULL', field));
    ELSE
      IF jsonb_typeof(item->'value') IS NULL OR jsonb_typeof(item->'value') <> ALL(ARRAY['string','number','boolean']) OR length(item->>'value')>300 THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
      IF operation = 'contains' THEN predicates := array_append(predicates, format('strpos(%I::text,%L)>0', field,item->>'value'));
      ELSE
        operator_sql := CASE operation WHEN 'eq' THEN '=' WHEN 'neq' THEN '<>' WHEN 'gt' THEN '>' WHEN 'gte' THEN '>=' WHEN 'lt' THEN '<' WHEN 'lte' THEN '<=' ELSE NULL END;
        IF operator_sql IS NULL THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
        predicates := array_append(predicates,format('%I %s %L',field,operator_sql,item->>'value'));
      END IF;
    END IF;
  END LOOP;
  where_sql := ' WHERE (' || scope_sql || ')';
  IF cardinality(predicates)>0 THEN where_sql := where_sql || ' AND ' || array_to_string(predicates, ' AND '); END IF;
  IF plan ? 'limit' THEN
    IF jsonb_typeof(plan->'limit') <> 'number' OR (plan->>'limit') !~ '^[0-9]{1,3}$' THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
    row_limit := (plan->>'limit')::integer;
    IF row_limit<1 OR row_limit>200 THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
  END IF;
  IF plan ? 'orderBy' THEN
    item := plan->'orderBy'; field := item->>'column'; direction := item->>'direction';
    IF jsonb_typeof(item) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(item) k WHERE k <> ALL(ARRAY['column','direction'])) OR field IS NULL OR field <> ALL(outputs) OR direction IS NULL OR direction <> ALL(ARRAY['asc','desc']) THEN RAISE EXCEPTION 'AI_QUERY_PLAN_INVALID'; END IF;
    ordering_sql := format(' ORDER BY %I %s NULLS LAST',field,direction);
  END IF;
  -- Project only the selected fields and preserve mandatory authorization
  -- predicates before the source cap. No ordering of the source sample is implied.
  required_fields := required_fields || CASE WHEN plan ? 'measures' THEN groups ELSE cols END;
  required_fields := array_append(required_fields, 'updated_at');
  SELECT string_agg(format('%I', f), ',') INTO source_projection
  FROM (SELECT DISTINCT unnest(required_fields) AS f) projected;
  query_sql := format('WITH source AS MATERIALIZED (SELECT %s FROM public.%I%s LIMIT 20001), bounded AS MATERIALIZED (SELECT * FROM source LIMIT 20000), result AS (SELECT %s FROM bounded%s%s LIMIT %s) SELECT jsonb_build_object(''rows'',COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT * FROM result LIMIT %s) r),''[]''::jsonb),''scannedRows'',(SELECT count(*) FROM bounded),''sourceTruncated'',(SELECT count(*)>20000 FROM source),''outputTruncated'',(SELECT count(*)>%s FROM result),''freshness'',(SELECT min(updated_at) FROM bounded),''latestSync'',(SELECT max(updated_at) FROM bounded))', source_projection,view_name,where_sql,array_to_string(selects,','),grouping_sql,ordering_sql,row_limit+1,row_limit,row_limit);
  EXECUTE query_sql INTO result;
  RETURN result || jsonb_build_object('source',view_name,'coverage','gestelit_activity_only','limit',row_limit,'sourceSampling','unranked_bounded_sample');
END;
$$;
REVOKE ALL ON FUNCTION public.ai_query_sales_analytics(jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_query_sales_analytics(jsonb, uuid, text) TO service_role;
COMMENT ON FUNCTION public.ai_query_sales_analytics(jsonb, uuid, text) IS 'Scoped sales AI query compiler. DB rechecks current sales_ai_query + personal/team permission and injects mandatory personal sales_user_id predicate before model filters.';
NOTIFY pgrst, 'reload schema';

NOTIFY pgrst, 'reload schema';
COMMIT;
