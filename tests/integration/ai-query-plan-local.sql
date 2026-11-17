-- MANUAL LOCAL FIXTURE ONLY: this script refuses every other port/database.
-- Requires Aug12 foundation/scoped-reporting plus the Nov17 query migration.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_setting('port') <> '55437' OR current_database() <> 'gestelit_sales_preflight' OR inet_server_addr() IS NOT NULL THEN RAISE EXCEPTION 'LOCAL_FIXTURE_ONLY'; END IF;
END $$;
INSERT INTO public.sales_users(id,full_name,is_active) VALUES
  ('10000000-0000-0000-0000-000000000001','FixtureRepOne',true),
  ('10000000-0000-0000-0000-000000000002','FixtureRepTwo',true),
  ('10000000-0000-0000-0000-000000000003','FixtureManager',true);
INSERT INTO public.sales_user_roles(sales_user_id,role_key,reason) VALUES ('10000000-0000-0000-0000-000000000003','sales_manager','local fixture');
INSERT INTO public.sales_activity_logs(id,sales_user_id,event_type,event_at,salesperson,customer_name,actual_revenue,currency,status,source,created_at,updated_at) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','meeting',now(),'FixtureRepOne','FixtureCustomerOne',100,'ILS','won','manual',now(),now()),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','call',now(),'FixtureRepTwo','FixtureCustomerTwo',999,'USD','won','manual',now(),now());
SET LOCAL ROLE service_role;
SET LOCAL statement_timeout = '5s';
DO $$
DECLARE result jsonb; invalid jsonb; rejected integer := 0;
BEGIN
 result := public.ai_query_sales_analytics('{"dataset":"sales_activity","columns":["customer_name","actual_revenue"]}', '10000000-0000-0000-0000-000000000001','personal');
 ASSERT jsonb_array_length(result->'rows')=1, 'personal query leaked another rep';
 ASSERT result->'rows'->0->>'customer_name' = 'FixtureCustomerOne', 'personal ownership changed';
 result := public.ai_query_sales_analytics('{"dataset":"sales_activity","groupBy":["currency"],"measures":[{"op":"sum","column":"actual_revenue"}]}', '10000000-0000-0000-0000-000000000003','team');
 ASSERT jsonb_array_length(result->'rows')=2, 'team currency grouping lost';
 BEGIN
  PERFORM public.ai_query_sales_analytics('{"dataset":"sales_activity"}', '10000000-0000-0000-0000-000000000001','team');
  RAISE EXCEPTION 'rep bypassed team permission';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'AI_QUERY_SCOPE_FORBIDDEN' THEN RAISE; END IF; END;
 FOR invalid IN SELECT value FROM jsonb_array_elements('[
  {"dataset":"work_orders"},
  {"dataset":"sales_activity","sql":"SELECT * FROM sales_users"},
  {"dataset":"sales_activity","viewer_id":"10000000-0000-0000-0000-000000000002"},
  {"dataset":"sales_activity","columns":["password_hash"]},
  {"dataset":"sales_activity","columns":["customer_name) FROM sales_users--"]},
  {"dataset":"sales_activity","measures":[{"op":"pg_sleep","column":"actual_revenue"}]},
  {"dataset":"sales_activity","measures":[{"op":"sum","column":"actual_revenue"}]},
  {"dataset":"sales_activity","filters":[{"column":"customer_name","op":"eq;DROP TABLE jobs","value":"x"}]},
  {"dataset":"sales_activity","limit":201}
 ]') LOOP
  BEGIN
    PERFORM public.ai_query_sales_analytics(invalid,'10000000-0000-0000-0000-000000000001','personal');
    RAISE EXCEPTION 'unsafe plan accepted: %', invalid;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT IN ('AI_QUERY_PLAN_INVALID','AI_QUERY_SCOPE_FORBIDDEN','AI_QUERY_CURRENCY_SCOPE_REQUIRED') THEN RAISE; END IF;
    rejected := rejected+1;
  END;
 END LOOP;
 ASSERT rejected=9, 'missing adversarial cases';
 result := public.ai_query_sales_analytics('{"dataset":"sales_activity","filters":[{"column":"customer_name","op":"contains","value":"'');DROP TABLE sales_users;--"}]}','10000000-0000-0000-0000-000000000001','personal');
 ASSERT jsonb_array_length(result->'rows')=0, 'literal injection was evaluated';
 ASSERT NOT has_function_privilege('anon','public.ai_query_sales_analytics(jsonb,uuid,text)','EXECUTE'), 'anon can invoke sales query';
 ASSERT NOT has_function_privilege('authenticated','public.ai_query_analytics(jsonb)','EXECUTE'), 'authenticated can invoke admin query';
 RAISE NOTICE 'PASS: personal isolation, manager team scope, currencies, nine adversarial plans, literal injection, RPC grants';
END $$;
RESET ROLE;
UPDATE public.sales_user_roles SET valid_to=now()+interval '1 microsecond' WHERE sales_user_id='10000000-0000-0000-0000-000000000003' AND role_key='sales_manager';
-- Explicit revocation/inactive-user check must re-evaluate authorization per query.
UPDATE public.sales_users SET is_active=false WHERE id='10000000-0000-0000-0000-000000000003';
SET LOCAL ROLE service_role;
DO $$ BEGIN
 BEGIN
  PERFORM public.ai_query_sales_analytics('{"dataset":"sales_activity"}','10000000-0000-0000-0000-000000000003','team');
  RAISE EXCEPTION 'inactive manager bypass';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'AI_QUERY_SCOPE_FORBIDDEN' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS: inactive manager blocked';
END $$;
ROLLBACK;
