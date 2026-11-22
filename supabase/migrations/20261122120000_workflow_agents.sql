BEGIN;
ALTER TABLE public.pipeline_preset_steps ADD COLUMN IF NOT EXISTS agent_config jsonb;
ALTER TABLE public.job_item_steps ADD COLUMN IF NOT EXISTS agent_config jsonb;

-- A transaction protects the existing route if any replacement row is invalid.
-- NULL agent map preserves configurations for legacy editor calls; {} removes them.
CREATE OR REPLACE FUNCTION public.save_workflow_preset(
 p_id uuid, p_name text, p_station_ids uuid[], p_flags jsonb DEFAULT '{}'::jsonb, p_agents jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id uuid; old_agents jsonb;
BEGIN
 IF cardinality(p_station_ids) > 30 OR cardinality(p_station_ids) <> (SELECT count(DISTINCT x) FROM unnest(p_station_ids) x) THEN RAISE EXCEPTION 'INVALID_STATIONS'; END IF;
 IF EXISTS (SELECT 1 FROM unnest(p_station_ids) x LEFT JOIN stations s ON s.id=x WHERE s.id IS NULL OR NOT s.is_active) THEN RAISE EXCEPTION 'INACTIVE_OR_UNKNOWN_STATION'; END IF;
 IF p_id IS NULL THEN
   IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'INVALID_NAME'; END IF;
   INSERT INTO pipeline_presets(name) VALUES(btrim(p_name)) RETURNING id INTO v_id;
 ELSE
   SELECT id INTO v_id FROM pipeline_presets WHERE id=p_id FOR UPDATE;
   IF v_id IS NULL THEN RAISE EXCEPTION 'PRESET_NOT_FOUND'; END IF;
   IF p_name IS NOT NULL THEN
     IF length(btrim(p_name)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'INVALID_NAME'; END IF;
     UPDATE pipeline_presets SET name=btrim(p_name),updated_at=now() WHERE id=v_id;
   END IF;
 END IF;
 SELECT coalesce(jsonb_object_agg(station_id::text,agent_config) FILTER(WHERE agent_config IS NOT NULL),'{}'::jsonb) INTO old_agents FROM pipeline_preset_steps WHERE pipeline_preset_id=v_id;
 DELETE FROM pipeline_preset_steps WHERE pipeline_preset_id=v_id;
 INSERT INTO pipeline_preset_steps(pipeline_preset_id,station_id,position,requires_first_product_approval,agent_config)
 SELECT v_id,x,ord,coalesce((p_flags->>x::text)::boolean,false),coalesce(p_agents,old_agents)->x::text FROM unnest(p_station_ids) WITH ORDINALITY t(x,ord);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.save_workflow_preset(uuid,text,uuid[],jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_workflow_preset(uuid,text,uuid[],jsonb,jsonb) TO service_role;

-- Preset-only creation also snapshots agent settings. Existing jobs are untouched.
CREATE OR REPLACE FUNCTION public.snapshot_workflow_agent() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.agent_config IS NULL THEN
   SELECT ps.agent_config INTO NEW.agent_config FROM pipeline_preset_steps ps JOIN job_items ji ON ji.pipeline_preset_id=ps.pipeline_preset_id WHERE ji.id=NEW.job_item_id AND ps.station_id=NEW.station_id;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS snapshot_workflow_agent ON public.job_item_steps;
CREATE TRIGGER snapshot_workflow_agent BEFORE INSERT ON public.job_item_steps FOR EACH ROW EXECUTE FUNCTION public.snapshot_workflow_agent();

CREATE TABLE IF NOT EXISTS public.workflow_agent_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE,
 job_item_step_id uuid NOT NULL REFERENCES public.job_item_steps(id) ON DELETE CASCADE,
 agent_config jsonb NOT NULL,
 input_snapshot jsonb NOT NULL,
 result jsonb,
 status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','pending_review','approved','rejected','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS workflow_agent_runs_step_created ON public.workflow_agent_runs(job_item_step_id,created_at DESC);
ALTER TABLE public.workflow_agent_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workflow_agent_runs FROM anon, authenticated;
GRANT ALL ON public.workflow_agent_runs TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
