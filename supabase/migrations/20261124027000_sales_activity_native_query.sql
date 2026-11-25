BEGIN;
SET LOCAL lock_timeout='3s';
CREATE OR REPLACE VIEW public.mart_sales_activity_core AS
SELECT id,sales_user_id,event_type,event_at,salesperson,customer_name,customer_code,
 raw_note,ai_summary,ai_next_action,next_action_date,estimated_revenue,actual_revenue,
 currency,status,updated_at,'gestelit_only'::text AS coverage_scope,false AS is_complete_contact_history
FROM public.sales_activity_logs;
REVOKE ALL ON public.mart_sales_activity_core FROM anon,authenticated;
GRANT SELECT ON public.mart_sales_activity_core TO service_role;
CREATE INDEX IF NOT EXISTS idx_sales_activity_viewer_event ON public.sales_activity_logs(sales_user_id,event_at DESC);
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
  allowed := ARRAY['id','event_type','event_at','salesperson','customer_name','customer_code','raw_note','ai_summary','ai_next_action','next_action_date','estimated_revenue','actual_revenue','currency','status','customer_group','area','account_manager','dormancy_bucket','coverage_scope','is_complete_contact_history','updated_at'];
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
  ELSE cols := ARRAY['id','event_at','customer_name','raw_note','ai_next_action','next_action_date','status','updated_at'];
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
    required_fields := array_append(required_fields, field);
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
  -- Native activity questions must not compute the entire customer-profile and
  -- dormancy graph. Scope is still injected from the authenticated server user.
  IF NOT required_fields && ARRAY['customer_group','area','account_manager','dormancy_bucket'] THEN
    view_name := 'mart_sales_activity_core';
  END IF;
  SELECT string_agg(format('%I', f), ',') INTO source_projection
  FROM (SELECT DISTINCT unnest(required_fields) AS f) projected;
  query_sql := format('WITH source AS MATERIALIZED (SELECT %s FROM public.%I%s LIMIT 20001), bounded AS MATERIALIZED (SELECT * FROM source LIMIT 20000), result AS (SELECT %s FROM bounded%s%s LIMIT %s) SELECT jsonb_build_object(''rows'',COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT * FROM result LIMIT %s) r),''[]''::jsonb),''scannedRows'',(SELECT count(*) FROM bounded),''sourceTruncated'',(SELECT count(*)>20000 FROM source),''outputTruncated'',(SELECT count(*)>%s FROM result),''freshness'',(SELECT min(updated_at) FROM bounded),''latestSync'',(SELECT max(updated_at) FROM bounded))', source_projection,view_name,where_sql,array_to_string(selects,','),grouping_sql,ordering_sql,row_limit+1,row_limit,row_limit);
  EXECUTE query_sql INTO result;
  RETURN result || jsonb_build_object('source','mart_sales_activity_scoped','executionView',view_name,'coverage','gestelit_activity_only','limit',row_limit,'sourceSampling','unranked_bounded_sample');
END;
$$;
REVOKE ALL ON FUNCTION public.ai_query_sales_analytics(jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_query_sales_analytics(jsonb, uuid, text) TO service_role;
COMMENT ON FUNCTION public.ai_query_sales_analytics(jsonb, uuid, text) IS 'Scoped sales AI query compiler. DB rechecks current sales_ai_query + personal/team permission and injects mandatory personal sales_user_id predicate before model filters.';

NOTIFY pgrst,'reload schema';

COMMIT; NOTIFY pgrst,'reload schema';
