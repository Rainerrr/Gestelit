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
 'forecast',COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM (SELECT * FROM forecast ORDER BY purchased_quantity DESC NULLS LAST LIMIT 500) f),'[]'::jsonb),
 'forecastTruncated',(SELECT count(*)>500 FROM forecast),
 'coverage',jsonb_build_object('unknownUnitLines',(SELECT count(*) FROM source WHERE unit IS NULL),'unknownCurrencyLines',(SELECT count(*) FROM source WHERE currency='UNKNOWN'),
 'source','supplier_invoice_lines_joined_by_invoice_year_supplier',
 'forecastMeaning','positive_purchase_quantity_per_day_times_91.3125_not_demand_or_order_recommendation',
 'comparisonRule','same_item_code_description_unit_currency_only; unknown unit/currency not comparable'));
$$;
REVOKE ALL ON FUNCTION public.get_procurement_analysis(date,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_procurement_analysis(date,date,text) TO service_role;
CREATE VIEW public.operations_supplier_directory AS
 SELECT DISTINCT ON (reporting_supplier_code) reporting_supplier_code AS supplier_code,reporting_supplier_name AS supplier_name
 FROM public.bina_heshsapakrashi WHERE reporting_supplier_code IS NOT NULL
 ORDER BY reporting_supplier_code,reporting_invoice_at DESC NULLS LAST,synced_at DESC;
REVOKE ALL ON public.operations_supplier_directory FROM anon,authenticated;
GRANT SELECT ON public.operations_supplier_directory TO service_role;
NOTIFY pgrst,'reload schema';
