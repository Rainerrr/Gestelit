-- Full-history reconciliation exposed sequential JSON date/relation scans.
-- BINA ISO dates have always been read under the database UTC timezone.
-- Pin that timezone so expression indexes and sessions use identical instants.
SET lock_timeout = '3s';
SET statement_timeout = '120s';
CREATE OR REPLACE FUNCTION public.bina_json_timestamptz(value text)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET TimeZone = 'UTC' SET DateStyle = 'ISO, YMD' AS $$
BEGIN
  IF value IS NULL OR btrim(value) = '' THEN RETURN NULL; END IF;
  IF btrim(value) !~ '^\d{4}-\d{2}-\d{2}' THEN RETURN NULL; END IF;
  RETURN value::timestamptz;
EXCEPTION WHEN others THEN RETURN NULL;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_bina_orders_receipt_text ON public.bina_dfhazmrashi ((data->>'TarikKabala'), bina_id);
CREATE INDEX IF NOT EXISTS idx_bina_control_work_order_text ON public.bina_dfshelita ((data->>'MisparRashi'), bina_id);
CREATE INDEX IF NOT EXISTS idx_bina_tovinrashi_document_date ON public.bina_tovinrashi (public.bina_json_timestamptz(data->>'TarikTovin'), bina_id);
CREATE INDEX IF NOT EXISTS idx_bina_heshbonitrashi_document_date ON public.bina_heshbonitrashi (public.bina_json_timestamptz(data->>'TarikHeshbonit'), bina_id);
CREATE INDEX IF NOT EXISTS idx_bina_heshsapakrashi_document_date ON public.bina_heshsapakrashi (public.bina_json_timestamptz(data->>'Tarik'), bina_id);
CREATE INDEX IF NOT EXISTS idx_bina_hovot_document_date ON public.bina_hovot (public.bina_json_timestamptz(data->>'TarikRishum'), bina_id);
CREATE INDEX IF NOT EXISTS idx_bina_dfhazmmontage_work_order_history ON public.bina_dfhazmmontage (public.bina_json_int(data->>'MisparRashi'));
CREATE INDEX IF NOT EXISTS idx_bina_dfhazmgimur_work_order_history ON public.bina_dfhazmgimur (public.bina_json_int(data->>'MisparRashi'));
CREATE INDEX IF NOT EXISTS idx_bina_dfhazmgrafika_work_order_history ON public.bina_dfhazmgrafika (public.bina_json_int(data->>'MisparRashi'));
CREATE INDEX IF NOT EXISTS idx_bina_dfhazmkirkia_work_order_history ON public.bina_dfhazmkirkia (public.bina_json_int(data->>'MisparRashi'));
CREATE INDEX IF NOT EXISTS idx_bina_dfhazmkedam_work_order_history ON public.bina_dfhazmkedam (public.bina_json_int(data->>'MisparRashi'));
CREATE INDEX IF NOT EXISTS idx_bina_dfhazmnigrar_work_order_history ON public.bina_dfhazmnigrar (public.bina_json_int(data->>'MisparRashi'));
CREATE INDEX IF NOT EXISTS idx_bina_dfmlay_work_order_history ON public.bina_dfmlay (public.bina_json_int(data->>'MisparRashi'));
CREATE INDEX IF NOT EXISTS idx_bina_tovinrashi_order_history ON public.bina_tovinrashi (public.bina_json_int(data->>'MisparHazmana'));
CREATE INDEX IF NOT EXISTS idx_bina_mishloahrashi_order_history ON public.bina_mishloahrashi (public.bina_json_int(data->>'MisparHazmana'));
ANALYZE public.bina_dfhazmrashi;
ANALYZE public.bina_dfshelita;
ANALYZE public.bina_dfhazmglyonot;
ANALYZE public.bina_tovinrashi;
ANALYZE public.bina_heshbonitrashi;
ANALYZE public.bina_heshsapakrashi;
ANALYZE public.bina_hovot;
ANALYZE public.bina_mishloahrashi;
ANALYZE public.bina_dfhazmmontage;
ANALYZE public.bina_dfhazmgimur;
ANALYZE public.bina_dfhazmgrafika;
ANALYZE public.bina_dfhazmkirkia;
ANALYZE public.bina_dfhazmkedam;
ANALYZE public.bina_dfhazmnigrar;
ANALYZE public.bina_dfmlay;
RESET lock_timeout;
RESET statement_timeout;
