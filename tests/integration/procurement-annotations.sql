-- Run after migration 20261124031000; Supabase copy only, always rolled back.
BEGIN;
-- Disposable fixtures in the Supabase copy only; entire transaction rolls back.
INSERT INTO public.bina_heshsapaknigrar(bina_id,data,synced_at)
SELECT 'qa-procurement-20261124-'||x.n, base.data || jsonb_build_object(
 'RecordID',-990000-x.n,'TeorParit','QA procurement 20261124 fixture '||x.n,
 'KodParit',x.code,'Kamut',x.qty,'Mhir',x.price,'Sahacol',x.amount),now()
FROM public.bina_heshsapaknigrar base
CROSS JOIN (VALUES
 (1,''::text,0::numeric,0::numeric,0::numeric),
 (2,' ',NULL,NULL,NULL),
 (3,'coded-zero',0,0,0),
 (4,'',2,5,10),
 (5,'return-item',-1,5,-5),
 (6,'',0,0,10),
 (7,'_',0,0,0)
) AS x(n,code,qty,price,amount) WHERE base.bina_id='48202';
CREATE TEMP TABLE qa_procurement_result AS SELECT public.get_procurement_analysis('2024-11-01','2026-12-31','QA procurement 20261124 fixture') AS result;
DO $test$ DECLARE r jsonb; BEGIN
 SELECT result INTO r FROM qa_procurement_result;
 IF (r->>'sourceRows')::int<>4 OR (r#>>'{coverage,excludedNonFinancialLines}')::int<>3 OR (r#>>'{coverage,matchedInvoiceLines}')::int<>7 THEN
  RAISE EXCEPTION 'Classification failed: %',r;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'quarters') row WHERE row->>'item_name'='QA procurement 20261124 fixture 4' AND (row->>'quantity')::numeric=2 AND (row->>'weighted_unit_price')::numeric=5) THEN RAISE EXCEPTION 'Lost uncoded financial line'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'forecast') row WHERE row->>'item_code'='return-item' AND (row->>'return_lines')::int=1) THEN RAISE EXCEPTION 'Lost return'; END IF;
 IF has_function_privilege('anon','public.get_procurement_analysis(date,date,text)','EXECUTE') OR has_function_privilege('authenticated','public.get_procurement_analysis(date,date,text)','EXECUTE') THEN RAISE EXCEPTION 'Unexpected public execution'; END IF;
END $test$;
SELECT 'PASS: notes excluded, quantities/prices/returns/charges/coded-zero retained, permissions unchanged' AS result, result->>'sourceRows' AS purchase_lines, result#>>'{coverage,excludedNonFinancialLines}' AS excluded_notes FROM qa_procurement_result;
ROLLBACK;
