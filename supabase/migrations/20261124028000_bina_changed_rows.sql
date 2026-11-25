-- Skip unchanged source payloads without rewriting raw JSON, reporting projections,
-- indexes or WAL. Row synced_at is the last content write; sync run logs continue
-- to record every successful check, including batches with zero changes.
BEGIN;
SET LOCAL lock_timeout = '3s';
CREATE OR REPLACE FUNCTION public.sync_bina_changed_rows(p_table text, p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE changed integer; accepted integer;
BEGIN
  IF p_table IS NULL OR NOT (p_table = ANY(ARRAY[
    'bina_dfhazmrashi',
    'bina_dfhazmmontage',
    'bina_dfhazmnigrar',
    'bina_dfhazmgimur',
    'bina_dfhazmgrafika',
    'bina_dfhazmkirkia',
    'bina_dfhazmkedam',
    'bina_dfhazmglyonot',
    'bina_dfmlay',
    'bina_tnuotmlay',
    'bina_mismahim',
    'bina_heshsapakrashi',
    'bina_heshsapaknigrar',
    'bina_tmsapaknigrar',
    'bina_bakashanigrar',
    'bina_hovot',
    'bina_dfshelita',
    'bina_heshbonitrashi',
    'bina_heshbonitnigrar',
    'bina_mishloahrashi',
    'bina_mishloahnigrar',
    'bina_tovinrashi',
    'bina_tovinnigrar',
    'bina_sqllogins'
  ])) THEN RAISE EXCEPTION 'INVALID_BINA_TABLE'; END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'INVALID_BINA_ROWS'; END IF;
  accepted := jsonb_array_length(p_rows);
  IF accepted > 100 THEN RAISE EXCEPTION 'BINA_BATCH_TOO_LARGE'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE
    jsonb_typeof(r) <> 'object' OR jsonb_typeof(r->'bina_id') IS DISTINCT FROM 'string'
    OR nullif(trim(r->>'bina_id'),'') IS NULL OR jsonb_typeof(r->'data') IS DISTINCT FROM 'object')
  THEN RAISE EXCEPTION 'INVALID_BINA_ROW'; END IF;
  IF (SELECT count(DISTINCT r->>'bina_id') FROM jsonb_array_elements(p_rows) r) <> accepted
  THEN RAISE EXCEPTION 'DUPLICATE_BINA_ID'; END IF;
  EXECUTE format($sql$
    INSERT INTO public.%I AS target (bina_id,data,source_updated_at,synced_at)
    SELECT bina_id,data,source_updated_at,coalesce(synced_at,now())
    FROM jsonb_to_recordset($1) AS r(bina_id text,data jsonb,source_updated_at timestamptz,synced_at timestamptz)
    ON CONFLICT (bina_id) DO UPDATE SET data=excluded.data,
      source_updated_at=CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements($1) item WHERE item->>'bina_id'=excluded.bina_id AND item ? 'source_updated_at') THEN excluded.source_updated_at ELSE target.source_updated_at END,synced_at=excluded.synced_at
    WHERE target.data IS DISTINCT FROM excluded.data
       OR (target.source_updated_at IS DISTINCT FROM excluded.source_updated_at AND EXISTS
         (SELECT 1 FROM jsonb_array_elements($1) item WHERE item->>'bina_id'=excluded.bina_id AND item ? 'source_updated_at'))
  $sql$,p_table) USING p_rows;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN jsonb_build_object('accepted',accepted,'changed',changed,'unchanged',accepted-changed);
END $fn$;
REVOKE ALL ON FUNCTION public.sync_bina_changed_rows(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_bina_changed_rows(text,jsonb) TO service_role;
COMMENT ON FUNCTION public.sync_bina_changed_rows(text,jsonb) IS 'Service-only bounded sync. Unchanged includes timestamp-only rechecks. Freshness comes from bina_sync_table_runs, not row write timestamps.';
COMMIT;
