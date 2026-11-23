-- Keep the global unmapped-operation census exact without detoasting large
-- raw control records for every dashboard request. Generated columns refresh
-- atomically with every existing raw-data upsert; no separate cache or scheduler.
SET lock_timeout = '3s';
SET statement_timeout = '120s';
ALTER TABLE public.bina_dfshelita
 ADD COLUMN IF NOT EXISTS reporting_work_order_id integer GENERATED ALWAYS AS (public.bina_json_int(data->>'MisparRashi')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_machine_name text GENERATED ALWAYS AS (data->>'Mekona') STORED;
ANALYZE public.bina_dfshelita;
ALTER TABLE public.bina_dfhazmglyonot
 ADD COLUMN IF NOT EXISTS reporting_work_order_id integer GENERATED ALWAYS AS (public.bina_json_int(data->>'MisparRashi')) STORED,
 ADD COLUMN IF NOT EXISTS reporting_machine_name text GENERATED ALWAYS AS (data->>'Mekona') STORED;
ANALYZE public.bina_dfhazmglyonot;
DO $verify$
DECLARE prior jsonb; revised jsonb;
BEGIN
 SELECT jsonb_agg(to_jsonb(v) ORDER BY source_table, machine_name NULLS FIRST) INTO prior
 FROM public.mart_bina_unmapped_operations v;
 EXECUTE $view$CREATE OR REPLACE VIEW public.mart_bina_unmapped_operations AS
SELECT
  COALESCE(NULLIF(p.machine_name, ''), p.source_table) AS operation_key,
  p.source_table,
  p.machine_name,
  COUNT(*)::integer AS row_count,
  COUNT(DISTINCT p.work_order_id)::integer AS work_order_count,
  MAX(p.synced_at) AS last_synced_at,
  'needs_mapping'::text AS mapping_status
FROM (
 SELECT 'DFShelita'::text AS source_table, reporting_work_order_id AS work_order_id,
        reporting_machine_name AS machine_name, synced_at FROM public.bina_dfshelita
 UNION ALL
 SELECT 'DFHazmGlyonot'::text, reporting_work_order_id, reporting_machine_name, synced_at
 FROM public.bina_dfhazmglyonot
) p
LEFT JOIN public.bina_station_mappings m
  ON m.operation_key = COALESCE(NULLIF(p.machine_name, ''), p.source_table)
 AND m.is_active = true
 AND m.station_id IS NOT NULL
WHERE COALESCE(NULLIF(p.machine_name, ''), p.source_table) IS NOT NULL
  AND m.id IS NULL
GROUP BY p.source_table, p.machine_name$view$;
 SELECT jsonb_agg(to_jsonb(v) ORDER BY source_table, machine_name NULLS FIRST) INTO revised
 FROM public.mart_bina_unmapped_operations v;
 IF prior IS DISTINCT FROM revised THEN RAISE EXCEPTION 'Unmapped-operation census changed'; END IF;
END;
$verify$;
SELECT 'Unmapped-operation census preserved exactly' AS validation;
RESET lock_timeout;
RESET statement_timeout;
