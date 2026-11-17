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
    WHEN 'work_orders' THEN view_name := 'mart_bina_work_order_status'; allowed := ARRAY['work_order_id','customer_name','customer_code','title','status_text','bina_quantity','created_at','due_at','synced_at','link_status','gestelit_planned_quantity','gestelit_completed_good']; numeric_fields := ARRAY['bina_quantity','gestelit_planned_quantity','gestelit_completed_good'];
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
