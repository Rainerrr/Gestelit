-- Administrator-reviewed import of ONE finished product at header quantity.
-- BINA operation/sheet quantities are route evidence, never separate products.
CREATE TABLE IF NOT EXISTS public.bina_import_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 bina_id text NOT NULL,
 job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
 preview_hash text NOT NULL,
 source_snapshot jsonb NOT NULL,
 route_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bina_import_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bina_import_audit FROM anon, authenticated;
GRANT ALL ON public.bina_import_audit TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_prepare_bina_job(
 p_bina_id text,
 p_station_ids uuid[] DEFAULT '{}',
 p_preset_id uuid DEFAULT NULL,
 p_approval_flags jsonb DEFAULT '{}',
 p_preview_hash text DEFAULT NULL,
 p_commit boolean DEFAULT false,
 p_readiness_confirmed boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
SET statement_timeout = '8s'
SET lock_timeout = '3s'
AS $$
DECLARE
 src public.bina_dfhazmrashi%ROWTYPE;
 wo public.stg_bina_work_orders%ROWTYPE;
 route jsonb;
 route_ids uuid[];
 fingerprint text;
 preview jsonb;
 j public.jobs%ROWTYPE;
 it public.job_items%ROWTYPE;
 step_id uuid;
 step jsonb;
 existing_job uuid;
 existing_item uuid;
 blockers text[] := '{}';
BEGIN
 -- All import writers for this source serialize; idempotent retry never duplicates.
 PERFORM pg_advisory_xact_lock(hashtextextended('bina-import:' || p_bina_id,0));
 SELECT * INTO src FROM public.bina_dfhazmrashi WHERE bina_id = p_bina_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BINA_WORK_ORDER_NOT_FOUND'; END IF;
 SELECT * INTO wo FROM public.stg_bina_work_orders WHERE bina_id = p_bina_id;
 IF wo.work_order_id IS NULL OR wo.work_order_id <= 0 THEN RAISE EXCEPTION 'BINA_WORK_ORDER_INVALID'; END IF;
 IF wo.quantity IS NULL OR wo.quantity <= 0 OR trunc(wo.quantity) <> wo.quantity OR wo.quantity > 2147483647 THEN
  blockers := array_append(blockers,'חסרה כמות מוצר מוגמר תקינה בכותרת BINA');
 END IF;
 IF nullif(btrim(wo.customer_name),'') IS NULL OR nullif(btrim(wo.title),'') IS NULL THEN
  blockers := array_append(blockers,'חסרים שם לקוח או תיאור עבודה');
 END IF;
 IF coalesce(wo.customer_name,'') ~ '\?{3,}|�' OR coalesce(wo.title,'') ~ '\?{3,}|�' THEN
  blockers := array_append(blockers,'שם הלקוח או התיאור פגומים במקור ודורשים תיקון');
 END IF;
 IF coalesce(wo.status_text,'') ~ 'נשלח|נשלחה|הושלם|הושלמה|בוטל|בוטלה|סגור|סגורה' THEN
  blockers := array_append(blockers,'סטטוס BINA מציין עבודה שנשלחה, הושלמה או בוטלה');
 END IF;
 IF coalesce(wo.status_text,'') LIKE '%אין קבצים%' THEN
  blockers := array_append(blockers,'סטטוס BINA מציין שחסרים קבצים');
 END IF;
 IF p_preset_id IS NOT NULL THEN
  PERFORM 1 FROM public.pipeline_presets WHERE id=p_preset_id AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRESET_NOT_FOUND'; END IF;
  SELECT jsonb_agg(jsonb_build_object('station_id',station_id,'position',position,
    'requires_first_product_approval',requires_first_product_approval,'agent_config',agent_config) ORDER BY position)
   INTO route FROM public.pipeline_preset_steps WHERE pipeline_preset_id=p_preset_id;
 ELSE
  SELECT jsonb_agg(jsonb_build_object('station_id',id,'position',ord,
    'requires_first_product_approval',coalesce((p_approval_flags->>id::text)::boolean,false),'agent_config',NULL) ORDER BY ord)
   INTO route FROM unnest(p_station_ids) WITH ORDINALITY t(id,ord);
 END IF;
 IF route IS NULL OR jsonb_array_length(route)=0 OR jsonb_array_length(route)>50 THEN RAISE EXCEPTION 'PIPELINE_REQUIRED'; END IF;
 SELECT array_agg((v->>'station_id')::uuid) INTO route_ids FROM jsonb_array_elements(route) v;
 IF cardinality(route_ids) <> (SELECT count(DISTINCT x) FROM unnest(route_ids) x) THEN RAISE EXCEPTION 'DUPLICATE_STATION'; END IF;
 PERFORM 1 FROM public.stations WHERE id=ANY(route_ids) AND is_active FOR SHARE;
 IF (SELECT count(*) FROM public.stations WHERE id=ANY(route_ids) AND is_active) <> cardinality(route_ids) THEN RAISE EXCEPTION 'INACTIVE_STATION'; END IF;
 -- Stable fingerprint ignores sync timestamps, but binds raw source and complete reviewed route.
 fingerprint := md5(src.data::text || route::text || coalesce(p_preset_id::text,''));
 SELECT gestelit_entity_id INTO existing_job FROM public.bina_gestelit_links
  WHERE bina_table='DFHazmRashi' AND bina_id=p_bina_id AND gestelit_entity_type='job';
 SELECT gestelit_entity_id INTO existing_item FROM public.bina_gestelit_links
  WHERE bina_table='DFHazmRashi' AND bina_id=p_bina_id AND gestelit_entity_type='job_item';
 preview := jsonb_build_object('dryRun',true,'previewHash',fingerprint,'workOrder',to_jsonb(wo),
  'itemCount',1,'plannedQuantity',wo.quantity,'quantityBasis','BINA header finished-product quantity; operation/sheet quantities are excluded',
  'route',route,'blockers',to_jsonb(blockers),'canImport',cardinality(blockers)=0,
  'warnings',jsonb_build_array('יש לאמת קבצים, חומרים ותחנות לפני שחרור העבודה לעובד.','נוצר מוצר מוגמר אחד בכמות כותרת הפק״ע. לעבודה מרובת מוצרים נדרשת חלוקה ידנית.'),
  'existingJobId',existing_job);
 IF NOT p_commit THEN RETURN preview; END IF;
 IF existing_job IS NOT NULL AND existing_item IS NOT NULL THEN
  SELECT * INTO j FROM public.jobs WHERE id=existing_job;
  SELECT * INTO it FROM public.job_items WHERE id=existing_item AND job_id=existing_job;
  IF j.id IS NULL OR it.id IS NULL THEN RAISE EXCEPTION 'BINA_LINK_REQUIRES_REPAIR'; END IF;
  RETURN jsonb_build_object('job',to_jsonb(j),'items',jsonb_build_array(to_jsonb(it)),'linkedExistingJob',true);
 END IF;
 IF existing_job IS NOT NULL OR existing_item IS NOT NULL THEN RAISE EXCEPTION 'BINA_PARTIAL_IMPORT_REQUIRES_REPAIR'; END IF;
 IF p_preview_hash IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'BINA_PREVIEW_CHANGED'; END IF;
 IF cardinality(blockers)>0 THEN RAISE EXCEPTION 'BINA_PREPARATION_BLOCKED'; END IF;
 IF NOT p_readiness_confirmed THEN RAISE EXCEPTION 'BINA_READINESS_CONFIRMATION_REQUIRED'; END IF;
 IF EXISTS (SELECT 1 FROM public.jobs WHERE job_number=wo.work_order_id::text) THEN RAISE EXCEPTION 'BINA_EXISTING_JOB_REQUIRES_REVIEW'; END IF;
 INSERT INTO public.jobs(job_number,customer_name,description,due_date)
 VALUES (wo.work_order_id::text,wo.customer_name,wo.title,wo.due_at) RETURNING * INTO j;
 INSERT INTO public.job_items(job_id,name,pipeline_preset_id,planned_quantity,is_active)
 VALUES(j.id,wo.title,p_preset_id,wo.quantity::integer,true) RETURNING * INTO it;
 FOR step IN SELECT value FROM jsonb_array_elements(route) LOOP
  INSERT INTO public.job_item_steps(job_item_id,station_id,position,is_terminal,requires_first_product_approval,agent_config)
  VALUES(it.id,(step->>'station_id')::uuid,(step->>'position')::integer,
    (step->>'position')::integer=(SELECT max((x->>'position')::integer) FROM jsonb_array_elements(route) x),
    (step->>'requires_first_product_approval')::boolean,nullif(step->'agent_config','null'::jsonb)) RETURNING id INTO step_id;
  INSERT INTO public.wip_balances(job_item_id,job_item_step_id,good_reported,scrap_reported) VALUES(it.id,step_id,0,0);
 END LOOP;
 INSERT INTO public.job_item_progress(job_item_id,completed_good,completed_scrap) VALUES(it.id,0,0);
 INSERT INTO public.bina_gestelit_links(bina_table,bina_id,gestelit_entity_type,gestelit_entity_id,created_by,metadata)
 VALUES ('DFHazmRashi',p_bina_id,'job',j.id,'admin-reviewed-import',jsonb_build_object('work_order_id',wo.work_order_id,'preview_hash',fingerprint)),
 ('DFHazmRashi',p_bina_id,'job_item',it.id,'admin-reviewed-import',jsonb_build_object('quantity_basis','header_finished_product','preview_hash',fingerprint));
 INSERT INTO public.bina_import_audit(bina_id,job_id,preview_hash,source_snapshot,route_snapshot)
 VALUES(p_bina_id,j.id,fingerprint,to_jsonb(wo),route);
 RETURN jsonb_build_object('job',to_jsonb(j),'items',jsonb_build_array(to_jsonb(it)),'linkedExistingJob',false);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_prepare_bina_job(text,uuid[],uuid,jsonb,text,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_prepare_bina_job(text,uuid[],uuid,jsonb,text,boolean,boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
