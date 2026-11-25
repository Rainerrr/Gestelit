BEGIN; SET LOCAL lock_timeout='3s';
CREATE OR REPLACE VIEW public.mart_procurement_invoice_lines AS
SELECT l.bina_id,l.data->>'KodParit' AS item_code,l.data->>'TeorParit' AS item_name,
 NULLIF(NULLIF(btrim(l.data->>'Yehida'),''),'0') AS unit,
 public.bina_json_numeric(l.data->>'Kamut') AS quantity,
 public.bina_json_numeric(l.data->>'Mhir') AS unit_price,
 public.bina_json_numeric(l.data->>'Sahacol') AS line_amount,
 COALESCE(NULLIF(NULLIF(btrim(l.data->>'Matbea'),''),'0'),NULLIF(NULLIF(btrim(h.data->>'MatbeaMatah'),''),'0'),'UNKNOWN') AS currency,
 h.reporting_supplier_code AS supplier_code,h.reporting_supplier_name AS supplier_name,
 h.reporting_supplier_invoice_no AS invoice_no,h.reporting_work_year AS work_year,
 h.reporting_invoice_at AS invoice_at,
 date_trunc('quarter',h.reporting_invoice_at AT TIME ZONE 'Asia/Jerusalem')::date AS quarter,
 LEAST(l.synced_at,h.synced_at) AS synced_at
FROM public.bina_heshsapaknigrar l
JOIN public.bina_heshsapakrashi h ON h.data->>'MisparHeshSapak'=l.data->>'KodSug'
 AND h.data->>'ShnatAvoda'=l.data->>'ShnatAvoda' AND h.data->>'KodSapak'=l.data->>'KodSapak'
WHERE NOT EXISTS (SELECT 1 FROM public.bina_heshsapakrashi duplicate
 WHERE duplicate.bina_id<>h.bina_id AND duplicate.data->>'MisparHeshSapak'=l.data->>'KodSug'
 AND duplicate.data->>'ShnatAvoda'=l.data->>'ShnatAvoda' AND duplicate.data->>'KodSapak'=l.data->>'KodSapak');

CREATE OR REPLACE FUNCTION public.get_procurement_analysis(date_from date,date_to date,search_text text DEFAULT '')
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_catalog SET statement_timeout='15s' AS $$
WITH source AS MATERIALIZED (
 SELECT * FROM public.mart_procurement_invoice_lines
 WHERE invoice_at>=date_from AND invoice_at<date_to+1
 AND date_from<=date_to AND date_to-date_from<=3660
 AND (search_text='' OR strpos(lower(COALESCE(item_code,'')||' '||COALESCE(item_name,'')||' '||COALESCE(supplier_name,'')),lower(search_text))>0)
), grouped AS (
 SELECT quarter,item_code,item_name,unit,currency,supplier_code,max(supplier_name) supplier_name,
 count(*) line_count,sum(quantity) quantity,sum(line_amount) line_amount,
 min(unit_price) FILTER(WHERE quantity>0 AND unit_price>0) min_unit_price,
 max(unit_price) FILTER(WHERE quantity>0 AND unit_price>0) max_unit_price,
 sum(unit_price*quantity) FILTER(WHERE quantity>0 AND unit_price>0)/nullif(sum(quantity) FILTER(WHERE quantity>0 AND unit_price>0),0) weighted_unit_price,
 min(synced_at) oldest_sync
 FROM source GROUP BY quarter,item_code,item_name,unit,currency,supplier_code
), suppliers AS (
 SELECT supplier_code,max(supplier_name) supplier_name,currency,count(DISTINCT (invoice_no,work_year)) invoice_count,sum(line_amount) line_amount FROM source GROUP BY supplier_code,currency
), forecast AS (
 SELECT item_code,item_name,unit,currency,sum(quantity) FILTER(WHERE quantity>0) purchased_quantity,
 sum(quantity) FILTER(WHERE quantity>0)*91.3125/nullif(date_to-date_from+1,0) quarterly_baseline,
 count(*) FILTER(WHERE quantity<0) return_lines,count(DISTINCT supplier_code) supplier_count
 FROM source GROUP BY item_code,item_name,unit,currency
)
SELECT jsonb_build_object('from',date_from,'to',date_to,'sourceRows',(SELECT count(*) FROM source),
 'freshness',(SELECT min(synced_at) FROM source),'latestSync',(SELECT max(synced_at) FROM source),
 'quarters',COALESCE((SELECT jsonb_agg(to_jsonb(g)) FROM (SELECT * FROM grouped ORDER BY quarter DESC,item_code,supplier_code LIMIT 1000) g),'[]'::jsonb),
 'quartersTruncated',(SELECT count(*)>1000 FROM grouped),
 'suppliers',COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT * FROM suppliers ORDER BY line_amount DESC NULLS LAST LIMIT 500) s),'[]'::jsonb),
 'suppliersTruncated',(SELECT count(*)>500 FROM suppliers),
 'forecast',COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM (SELECT * FROM forecast ORDER BY purchased_quantity DESC NULLS LAST LIMIT 500) f),'[]'::jsonb),
 'forecastTruncated',(SELECT count(*)>500 FROM forecast),
 'coverage',jsonb_build_object('unknownUnitLines',(SELECT count(*) FROM source WHERE unit IS NULL),'unknownCurrencyLines',(SELECT count(*) FROM source WHERE currency='UNKNOWN'),
 'source','supplier_invoice_lines_joined_by_invoice_year_supplier',
 'forecastMeaning','positive_purchase_quantity_per_day_times_91.3125_not_demand_or_order_recommendation',
 'comparisonRule','same_item_code_description_unit_currency_only; unknown unit/currency not comparable'));
$$;
REVOKE ALL ON FUNCTION public.get_procurement_analysis(date,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_procurement_analysis(date,date,text) TO service_role;
COMMIT; NOTIFY pgrst,'reload schema';
