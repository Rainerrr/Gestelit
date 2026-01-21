


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."checklist_kind" AS ENUM (
    'start',
    'end'
);


ALTER TYPE "public"."checklist_kind" OWNER TO "postgres";


CREATE TYPE "public"."report_status" AS ENUM (
    'new',
    'approved',
    'open',
    'known',
    'solved'
);


ALTER TYPE "public"."report_status" OWNER TO "postgres";


CREATE TYPE "public"."report_type_enum" AS ENUM (
    'malfunction',
    'general',
    'scrap'
);


ALTER TYPE "public"."report_type_enum" OWNER TO "postgres";


CREATE TYPE "public"."session_status" AS ENUM (
    'active',
    'completed',
    'aborted'
);


ALTER TYPE "public"."session_status" OWNER TO "postgres";


CREATE TYPE "public"."session_update_result" AS (
	"success" boolean,
	"error_code" "text",
	"session_id" "uuid",
	"total_good" integer,
	"total_scrap" integer
);


ALTER TYPE "public"."session_update_result" OWNER TO "postgres";


CREATE TYPE "public"."worker_role" AS ENUM (
    'worker',
    'admin'
);


ALTER TYPE "public"."worker_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_session_atomic"("p_worker_id" "uuid", "p_station_id" "uuid", "p_job_id" "uuid", "p_instance_id" "text", "p_job_item_id" "uuid" DEFAULT NULL::"uuid", "p_job_item_step_id" "uuid" DEFAULT NULL::"uuid", "p_initial_status_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_stop_status_id UUID;
  v_session_id UUID;
  v_session JSONB;
  v_timestamp TIMESTAMPTZ := NOW();
  v_old_session_id UUID;
BEGIN
  -- Lock worker's active sessions to prevent race conditions
  FOR v_old_session_id IN
    SELECT id FROM sessions
    WHERE worker_id = p_worker_id
      AND status = 'active'
      AND ended_at IS NULL
    FOR UPDATE
  LOOP
    -- We have the lock, now close these sessions
  END LOOP;

  -- Use provided status ID or fall back to looking up by label
  v_stop_status_id := p_initial_status_id;

  IF v_stop_status_id IS NULL THEN
    -- Fallback: look up stop status by label_he
    SELECT id INTO v_stop_status_id
    FROM status_definitions
    WHERE is_protected = TRUE 
      AND label_he = 'עצירה'
      AND scope = 'global'
    LIMIT 1;
  END IF;

  IF v_stop_status_id IS NULL THEN
    RAISE EXCEPTION 'STOP_STATUS_NOT_FOUND';
  END IF;

  -- Close all active sessions for this worker and create final status events
  WITH closed_sessions AS (
    UPDATE sessions
    SET status = 'completed',
        ended_at = v_timestamp,
        forced_closed_at = v_timestamp
    WHERE worker_id = p_worker_id
      AND status = 'active'
      AND ended_at IS NULL
    RETURNING id
  )
  INSERT INTO status_events (session_id, status_definition_id, started_at, ended_at, note)
  SELECT id, v_stop_status_id, v_timestamp, v_timestamp, 'replaced-by-new-session'
  FROM closed_sessions;

  -- Create new session
  INSERT INTO sessions (
    worker_id,
    station_id,
    job_id,
    started_at,
    active_instance_id,
    status,
    current_status_id,
    job_item_id,
    job_item_step_id
  )
  VALUES (
    p_worker_id,
    p_station_id,
    p_job_id,
    v_timestamp,
    p_instance_id,
    'active',
    v_stop_status_id,
    p_job_item_id,
    p_job_item_step_id
  )
  RETURNING id INTO v_session_id;

  -- Create initial status event for new session
  INSERT INTO status_events (session_id, status_definition_id, started_at)
  VALUES (v_session_id, v_stop_status_id, v_timestamp);

  -- Return the created session as JSONB
  SELECT jsonb_build_object(
    'id', s.id,
    'worker_id', s.worker_id,
    'station_id', s.station_id,
    'job_id', s.job_id,
    'started_at', s.started_at,
    'active_instance_id', s.active_instance_id,
    'status', s.status,
    'current_status_id', s.current_status_id,
    'job_item_id', s.job_item_id,
    'job_item_step_id', s.job_item_step_id,
    'total_good', s.total_good,
    'total_scrap', s.total_scrap
  ) INTO v_session
  FROM sessions s
  WHERE s.id = v_session_id;

  RETURN v_session;
END;
$$;


ALTER FUNCTION "public"."create_session_atomic"("p_worker_id" "uuid", "p_station_id" "uuid", "p_job_id" "uuid", "p_instance_id" "text", "p_job_item_id" "uuid", "p_job_item_step_id" "uuid", "p_initial_status_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_session_atomic"("p_worker_id" "uuid", "p_station_id" "uuid", "p_job_id" "uuid", "p_instance_id" "text", "p_job_item_id" "uuid", "p_job_item_step_id" "uuid", "p_initial_status_id" "uuid") IS 'Atomically creates a session, closing any existing active sessions for the worker. Accepts optional initial status ID.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."status_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "status_definition_id" "uuid" NOT NULL,
    "station_reason_id" "text",
    "note" "text",
    "image_url" "text",
    "report_id" "uuid",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "quantity_good" integer DEFAULT 0,
    "quantity_scrap" integer DEFAULT 0,
    "job_item_id" "uuid",
    "job_item_step_id" "uuid"
);


ALTER TABLE "public"."status_events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."status_events"."quantity_good" IS 'Good units produced during this status event period';



COMMENT ON COLUMN "public"."status_events"."quantity_scrap" IS 'Scrap units during this status event period';



COMMENT ON COLUMN "public"."status_events"."job_item_id" IS 'The job item being worked on during this status event';



COMMENT ON COLUMN "public"."status_events"."job_item_step_id" IS 'The specific pipeline step being worked on';



CREATE OR REPLACE FUNCTION "public"."create_status_event_atomic"("p_session_id" "uuid", "p_status_definition_id" "uuid", "p_station_reason_id" "text" DEFAULT NULL::"text", "p_note" "text" DEFAULT NULL::"text", "p_image_url" "text" DEFAULT NULL::"text", "p_report_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."status_events"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result public.status_events;
  v_session public.sessions%ROWTYPE;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Fetch session to get job_item_id and job_item_step_id
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND';
  END IF;

  -- Close any open status events for this session
  UPDATE public.status_events
  SET ended_at = v_now
  WHERE session_id = p_session_id AND ended_at IS NULL;

  -- Insert new status event WITH job item context from session
  INSERT INTO public.status_events (
    session_id,
    status_definition_id,
    station_reason_id,
    note,
    image_url,
    started_at,
    report_id,
    job_item_id,
    job_item_step_id
  ) VALUES (
    p_session_id,
    p_status_definition_id,
    p_station_reason_id,
    p_note,
    p_image_url,
    v_now,
    p_report_id,
    v_session.job_item_id,
    v_session.job_item_step_id
  ) RETURNING * INTO v_result;

  -- Mirror to sessions table (atomic within same transaction)
  UPDATE public.sessions
  SET
    current_status_id = p_status_definition_id,
    last_status_change_at = v_now
  WHERE id = p_session_id;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."create_status_event_atomic"("p_session_id" "uuid", "p_status_definition_id" "uuid", "p_station_reason_id" "text", "p_note" "text", "p_image_url" "text", "p_report_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_status_event_atomic"("p_session_id" "uuid", "p_status_definition_id" "uuid", "p_station_reason_id" "text", "p_note" "text", "p_image_url" "text", "p_report_id" "uuid") IS 'Atomically creates a status event, closing any open events and mirroring to sessions.
Now also captures job_item_id and job_item_step_id from the session so timeline shows job context immediately.';



CREATE OR REPLACE FUNCTION "public"."end_production_status_atomic"("p_session_id" "uuid", "p_status_event_id" "uuid", "p_quantity_good" integer, "p_quantity_scrap" integer, "p_next_status_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_session sessions%ROWTYPE;
  v_current_event status_events%ROWTYPE;
  v_new_event status_events%ROWTYPE;
  v_wip_result session_update_result;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- 1. Lock and fetch session
  SELECT * INTO v_session
  FROM sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND';
  END IF;

  -- 2. Lock and fetch current status event
  SELECT * INTO v_current_event
  FROM status_events
  WHERE id = p_status_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STATUS_EVENT_NOT_FOUND';
  END IF;

  -- 3. Verify this is the current active event for the session
  IF v_current_event.session_id != p_session_id THEN
    RAISE EXCEPTION 'STATUS_EVENT_SESSION_MISMATCH';
  END IF;

  IF v_current_event.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'STATUS_EVENT_ALREADY_ENDED';
  END IF;

  -- 4. Update the production status event with quantities AND job item context
  UPDATE status_events
  SET
    quantity_good = p_quantity_good,
    quantity_scrap = p_quantity_scrap,
    ended_at = v_now,
    job_item_id = v_session.job_item_id,
    job_item_step_id = v_session.job_item_step_id
  WHERE id = p_status_event_id;

  -- 5. Create new status event for next status WITH job item context
  --    This ensures the timeline shows which job item the worker was working on
  --    even before any quantity is reported for this new status
  INSERT INTO status_events (
    session_id,
    status_definition_id,
    started_at,
    job_item_id,
    job_item_step_id
  ) VALUES (
    p_session_id,
    p_next_status_id,
    v_now,
    v_session.job_item_id,
    v_session.job_item_step_id
  ) RETURNING * INTO v_new_event;

  -- 6. If session has job_item_id, update WIP balances using v4 function
  --    v4 takes DELTAS (increments), not totals
  IF v_session.job_item_id IS NOT NULL AND v_session.job_item_step_id IS NOT NULL THEN
    v_wip_result := update_session_quantities_atomic_v4(
      p_session_id,
      p_quantity_good,   -- Delta (increment)
      p_quantity_scrap   -- Delta (increment)
    );

    -- Check for WIP errors
    IF NOT v_wip_result.success THEN
      RAISE EXCEPTION 'WIP_UPDATE_FAILED: %', v_wip_result.error_code;
    END IF;
  END IF;

  -- 7. Update session status tracking only (no total_good/scrap anymore)
  UPDATE sessions
  SET
    current_status_id = p_next_status_id,
    last_status_change_at = v_now
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'newStatusEvent', jsonb_build_object(
      'id', v_new_event.id,
      'session_id', v_new_event.session_id,
      'status_definition_id', v_new_event.status_definition_id,
      'started_at', v_new_event.started_at
    )
  );
END;
$$;


ALTER FUNCTION "public"."end_production_status_atomic"("p_session_id" "uuid", "p_status_event_id" "uuid", "p_quantity_good" integer, "p_quantity_scrap" integer, "p_next_status_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."end_production_status_atomic"("p_session_id" "uuid", "p_status_event_id" "uuid", "p_quantity_good" integer, "p_quantity_scrap" integer, "p_next_status_id" "uuid") IS 'Atomically ends a production status event with quantities and starts the next status.
v5: Now captures job_item_id on the NEW status event too, so timeline shows job context immediately.
Uses delta-based WIP update (v4 function), no longer updates sessions.total_good/scrap.';



CREATE OR REPLACE FUNCTION "public"."get_jobs_with_stats"() RETURNS TABLE("id" "uuid", "job_number" "text", "customer_name" "text", "description" "text", "due_date" "date", "planned_quantity" bigint, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "total_good" bigint, "total_scrap" bigint, "session_count" bigint, "job_item_count" bigint, "completed_item_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    j.id,
    j.job_number,
    j.customer_name,
    j.description,
    j.due_date,
    -- Derive planned_quantity from SUM of job_items
    COALESCE(item_stats.total_planned, 0) as planned_quantity,
    j.created_at,
    j.updated_at,
    -- Use completed_good from job_item_progress (terminal station completions only)
    COALESCE(item_stats.total_completed_good, 0) as total_good,
    -- Keep scrap from status_events as it's reported at any stage
    COALESCE(se_totals.total_scrap, 0) as total_scrap,
    COALESCE(session_counts.cnt, 0) as session_count,
    -- Job item counts
    COALESCE(item_stats.item_count, 0) as job_item_count,
    COALESCE(item_stats.completed_count, 0) as completed_item_count
  FROM jobs j
  LEFT JOIN (
    -- Aggregate job_items stats including completion status
    SELECT
      ji.job_id,
      SUM(ji.planned_quantity)::bigint as total_planned,
      COUNT(*)::bigint as item_count,
      COUNT(*) FILTER (
        WHERE COALESCE(jip.completed_good, 0) >= ji.planned_quantity
      )::bigint as completed_count,
      -- Sum of completed_good from all job items (terminal station completions)
      SUM(COALESCE(jip.completed_good, 0))::bigint as total_completed_good
    FROM job_items ji
    LEFT JOIN job_item_progress jip ON jip.job_item_id = ji.id
    WHERE ji.is_active = true
    GROUP BY ji.job_id
  ) item_stats ON item_stats.job_id = j.id
  LEFT JOIN (
    -- Aggregate scrap quantities from status_events (via sessions)
    SELECT s.job_id,
           SUM(COALESCE(se.quantity_scrap, 0))::bigint as total_scrap
    FROM sessions s
    JOIN status_events se ON se.session_id = s.id
    WHERE s.job_id IS NOT NULL
    GROUP BY s.job_id
  ) se_totals ON se_totals.job_id = j.id
  LEFT JOIN (
    -- Count sessions per job
    SELECT job_id, COUNT(*)::bigint as cnt
    FROM sessions
    WHERE job_id IS NOT NULL
    GROUP BY job_id
  ) session_counts ON session_counts.job_id = j.id
  ORDER BY j.created_at DESC;
$$;


ALTER FUNCTION "public"."get_jobs_with_stats"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_jobs_with_stats"() IS 'Gets jobs with aggregated statistics. v4: total_good now uses job_item_progress.completed_good (terminal station completions only).';



CREATE OR REPLACE FUNCTION "public"."lock_job_item_pipeline_on_production"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only proceed if this status event has a job_item_id
  IF NEW.job_item_id IS NOT NULL THEN
    -- Check if the status definition is a production status
    IF EXISTS (
      SELECT 1 FROM status_definitions
      WHERE id = NEW.status_definition_id
      AND machine_state = 'production'
    ) THEN
      -- Lock the pipeline if not already locked
      UPDATE job_items
      SET is_pipeline_locked = true
      WHERE id = NEW.job_item_id
      AND is_pipeline_locked = false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."lock_job_item_pipeline_on_production"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."lock_job_item_pipeline_on_production"() IS 'Automatically locks job item pipeline when production status is started';



CREATE OR REPLACE FUNCTION "public"."rebuild_job_item_steps"("p_job_item_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_job_item RECORD;
  v_max_position INTEGER;
  v_jis_id UUID;
BEGIN
  -- Get job item details
  SELECT * INTO v_job_item FROM public.job_items WHERE id = p_job_item_id;

  IF v_job_item IS NULL THEN
    RAISE EXCEPTION 'Job item not found: %', p_job_item_id;
  END IF;

  -- Delete existing job_item_steps (CASCADE will handle wip_balances)
  -- This makes the function idempotent
  DELETE FROM public.job_item_steps WHERE job_item_id = p_job_item_id;

  -- All job items are now pipeline-based
  -- If pipeline_preset_id is set, expand from pipeline_preset_steps
  IF v_job_item.pipeline_preset_id IS NOT NULL THEN
    -- Get max position for determining terminal station
    SELECT MAX(position) INTO v_max_position
    FROM public.pipeline_preset_steps
    WHERE pipeline_preset_id = v_job_item.pipeline_preset_id;

    IF v_max_position IS NULL THEN
      RAISE EXCEPTION 'Pipeline preset % has no steps', v_job_item.pipeline_preset_id;
    END IF;

    -- Insert job_item_steps from pipeline_preset_steps
    -- Mark the last position as terminal
    INSERT INTO public.job_item_steps (job_item_id, station_id, position, is_terminal)
    SELECT
      p_job_item_id,
      pps.station_id,
      pps.position,
      (pps.position = v_max_position)
    FROM public.pipeline_preset_steps pps
    WHERE pps.pipeline_preset_id = v_job_item.pipeline_preset_id
    ORDER BY pps.position;

    -- Create wip_balances for each step
    INSERT INTO public.wip_balances (job_item_id, job_item_step_id)
    SELECT p_job_item_id, jis.id
    FROM public.job_item_steps jis
    WHERE jis.job_item_id = p_job_item_id;
  ELSE
    -- No preset - job_item_steps should already exist from setup_job_item_pipeline
    -- or be manually created. This is a no-op for items with custom pipelines.
    NULL;
  END IF;

  -- Upsert job_item_progress (ensure row exists)
  INSERT INTO public.job_item_progress (job_item_id, completed_good)
  VALUES (p_job_item_id, 0)
  ON CONFLICT (job_item_id) DO NOTHING;

END;
$$;


ALTER FUNCTION "public"."rebuild_job_item_steps"("p_job_item_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rebuild_job_item_steps"("p_job_item_id" "uuid") IS 'Idempotently sets up job_item_steps, wip_balances, and job_item_progress for a job item. Supports station, line, and pipeline kinds.';



CREATE OR REPLACE FUNCTION "public"."set_report_default_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.type = 'malfunction' THEN
    NEW.status = 'open';
  ELSE
    NEW.status = 'new';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_report_default_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."setup_job_item_pipeline"("p_job_item_id" "uuid", "p_station_ids" "uuid"[], "p_preset_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_job_item RECORD;
  v_station_count INTEGER;
  v_position INTEGER;
  v_station_id UUID;
  v_jis_id UUID;
BEGIN
  -- Validate inputs
  IF p_station_ids IS NULL OR array_length(p_station_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Station IDs array cannot be empty';
  END IF;

  v_station_count := array_length(p_station_ids, 1);

  -- Get job item and verify it exists
  SELECT * INTO v_job_item FROM public.job_items WHERE id = p_job_item_id;

  IF v_job_item IS NULL THEN
    RAISE EXCEPTION 'Job item not found: %', p_job_item_id;
  END IF;

  -- Check if pipeline is locked (production already started)
  IF v_job_item.is_pipeline_locked THEN
    RAISE EXCEPTION 'Cannot modify pipeline for job item % - production has already started', p_job_item_id;
  END IF;

  -- Verify all station IDs exist and are active
  IF EXISTS (
    SELECT 1 FROM unnest(p_station_ids) AS sid
    WHERE NOT EXISTS (
      SELECT 1 FROM public.stations WHERE id = sid AND is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'One or more station IDs are invalid or inactive';
  END IF;

  -- Delete existing job_item_steps (CASCADE will handle wip_balances via FK)
  DELETE FROM public.job_item_steps WHERE job_item_id = p_job_item_id;

  -- Insert job_item_steps from station array
  -- Last station in array is marked as terminal
  v_position := 0;
  FOREACH v_station_id IN ARRAY p_station_ids
  LOOP
    v_position := v_position + 1;

    INSERT INTO public.job_item_steps (
      job_item_id,
      station_id,
      position,
      is_terminal
    )
    VALUES (
      p_job_item_id,
      v_station_id,
      v_position,
      (v_position = v_station_count)
    )
    RETURNING id INTO v_jis_id;

    -- Create wip_balance for this step
    INSERT INTO public.wip_balances (job_item_id, job_item_step_id)
    VALUES (p_job_item_id, v_jis_id);
  END LOOP;

  -- Update job_item with preset reference if provided
  IF p_preset_id IS NOT NULL THEN
    UPDATE public.job_items
    SET pipeline_preset_id = p_preset_id
    WHERE id = p_job_item_id;
  END IF;

  -- Upsert job_item_progress (ensure row exists)
  INSERT INTO public.job_item_progress (job_item_id, completed_good)
  VALUES (p_job_item_id, 0)
  ON CONFLICT (job_item_id) DO NOTHING;

END;
$$;


ALTER FUNCTION "public"."setup_job_item_pipeline"("p_job_item_id" "uuid", "p_station_ids" "uuid"[], "p_preset_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."setup_job_item_pipeline"("p_job_item_id" "uuid", "p_station_ids" "uuid"[], "p_preset_id" "uuid") IS 'Sets up job_item_steps, wip_balances, and job_item_progress from a station ID array. Fails if pipeline is locked.';



CREATE OR REPLACE FUNCTION "public"."update_session_quantities_atomic_v3"("p_session_id" "uuid", "p_total_good" integer, "p_total_scrap" integer) RETURNS "public"."session_update_result"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_session RECORD;
  v_step_info RECORD;
  v_upstream_step RECORD;
  v_wip_balance RECORD;
  v_delta_good INTEGER;
  v_delta_scrap INTEGER;
  v_pull_amount INTEGER;
  v_reduce_remaining INTEGER;
  v_originated_before INTEGER;
  v_pulled_total INTEGER;
  v_originated_reduce INTEGER;
  v_pulled_reduce INTEGER;
  v_consumption RECORD;
  v_return_amount INTEGER;
  v_result session_update_result;
  v_lock_key BIGINT;
BEGIN
  v_result.success := false;
  v_result.error_code := NULL;
  v_result.session_id := p_session_id;

  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL THEN
    v_result.error_code := 'SESSION_NOT_FOUND';
    RETURN v_result;
  END IF;

  IF v_session.job_item_id IS NULL THEN
    UPDATE public.sessions
    SET total_good = p_total_good, total_scrap = p_total_scrap
    WHERE id = p_session_id;

    v_result.success := true;
    v_result.total_good := p_total_good;
    v_result.total_scrap := p_total_scrap;
    RETURN v_result;
  END IF;

  SELECT position, is_terminal INTO v_step_info
  FROM public.job_item_steps
  WHERE id = v_session.job_item_step_id;

  IF v_step_info IS NULL THEN
    v_result.error_code := 'JOB_ITEM_STEP_NOT_FOUND';
    RETURN v_result;
  END IF;

  v_lock_key := hashtext(v_session.job_item_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_delta_good := p_total_good - COALESCE(v_session.total_good, 0);
  v_delta_scrap := p_total_scrap - COALESCE(v_session.total_scrap, 0);

  SELECT * INTO v_wip_balance
  FROM public.wip_balances
  WHERE job_item_id = v_session.job_item_id
    AND job_item_step_id = v_session.job_item_step_id
  FOR UPDATE;

  IF v_wip_balance IS NULL THEN
    v_result.error_code := 'WIP_BALANCE_NOT_FOUND';
    RETURN v_result;
  END IF;

  IF v_delta_good > 0 THEN
    IF v_step_info.position > 1 THEN
      SELECT jis.*, wb.id as wip_balance_id, wb.good_available
      INTO v_upstream_step
      FROM public.job_item_steps jis
      JOIN public.wip_balances wb ON wb.job_item_step_id = jis.id
      WHERE jis.job_item_id = v_session.job_item_id
        AND jis.position = v_step_info.position - 1
      FOR UPDATE OF wb;

      IF v_upstream_step IS NOT NULL AND v_upstream_step.good_available > 0 THEN
        v_pull_amount := LEAST(v_delta_good, v_upstream_step.good_available);

        UPDATE public.wip_balances
        SET good_available = good_available - v_pull_amount
        WHERE id = v_upstream_step.wip_balance_id;

        INSERT INTO public.wip_consumptions (
          job_item_id,
          consuming_session_id,
          from_job_item_step_id,
          good_used,
          is_scrap
        ) VALUES (
          v_session.job_item_id,
          p_session_id,
          v_upstream_step.id,
          v_pull_amount,
          FALSE
        );
      END IF;
    END IF;

    UPDATE public.wip_balances
    SET good_available = good_available + v_delta_good
    WHERE id = v_wip_balance.id;

    IF v_step_info.is_terminal THEN
      UPDATE public.job_item_progress
      SET completed_good = completed_good + v_delta_good
      WHERE job_item_id = v_session.job_item_id;
    END IF;

  ELSIF v_delta_good < 0 THEN
    v_reduce_remaining := ABS(v_delta_good);

    IF v_wip_balance.good_available < v_reduce_remaining THEN
      v_result.error_code := 'WIP_DOWNSTREAM_CONSUMED';
      v_result.total_good := v_session.total_good;
      v_result.total_scrap := v_session.total_scrap;
      RETURN v_result;
    END IF;

    SELECT COALESCE(SUM(good_used), 0) INTO v_pulled_total
    FROM public.wip_consumptions
    WHERE consuming_session_id = p_session_id
      AND is_scrap = FALSE;

    v_originated_before := COALESCE(v_session.total_good, 0) - v_pulled_total;

    UPDATE public.wip_balances
    SET good_available = good_available - v_reduce_remaining
    WHERE id = v_wip_balance.id;

    IF v_step_info.is_terminal THEN
      UPDATE public.job_item_progress
      SET completed_good = completed_good - v_reduce_remaining
      WHERE job_item_id = v_session.job_item_id;
    END IF;

    v_originated_reduce := LEAST(v_reduce_remaining, v_originated_before);
    v_pulled_reduce := v_reduce_remaining - v_originated_reduce;

    IF v_pulled_reduce > 0 THEN
      FOR v_consumption IN
        SELECT wc.*, jis.id as upstream_jis_id
        FROM public.wip_consumptions wc
        JOIN public.job_item_steps jis ON jis.id = wc.from_job_item_step_id
        WHERE wc.consuming_session_id = p_session_id
          AND wc.is_scrap = FALSE
        ORDER BY wc.created_at DESC
        FOR UPDATE OF wc
      LOOP
        EXIT WHEN v_pulled_reduce <= 0;

        v_return_amount := LEAST(v_consumption.good_used, v_pulled_reduce);

        UPDATE public.wip_balances
        SET good_available = good_available + v_return_amount
        WHERE job_item_step_id = v_consumption.upstream_jis_id
          AND job_item_id = v_session.job_item_id;

        IF v_return_amount = v_consumption.good_used THEN
          DELETE FROM public.wip_consumptions WHERE id = v_consumption.id;
        ELSE
          UPDATE public.wip_consumptions
          SET good_used = good_used - v_return_amount
          WHERE id = v_consumption.id;
        END IF;

        v_pulled_reduce := v_pulled_reduce - v_return_amount;
      END LOOP;
    END IF;
  END IF;

  IF v_delta_scrap > 0 THEN
    IF v_step_info.position > 1 THEN
      SELECT jis.*, wb.id as wip_balance_id, wb.good_available
      INTO v_upstream_step
      FROM public.job_item_steps jis
      JOIN public.wip_balances wb ON wb.job_item_step_id = jis.id
      WHERE jis.job_item_id = v_session.job_item_id
        AND jis.position = v_step_info.position - 1
      FOR UPDATE OF wb;

      IF v_upstream_step IS NOT NULL AND v_upstream_step.good_available > 0 THEN
        v_pull_amount := LEAST(v_delta_scrap, v_upstream_step.good_available);

        UPDATE public.wip_balances
        SET good_available = good_available - v_pull_amount
        WHERE id = v_upstream_step.wip_balance_id;

        INSERT INTO public.wip_consumptions (
          job_item_id,
          consuming_session_id,
          from_job_item_step_id,
          good_used,
          is_scrap
        ) VALUES (
          v_session.job_item_id,
          p_session_id,
          v_upstream_step.id,
          v_pull_amount,
          TRUE
        );
      END IF;
    END IF;

  ELSIF v_delta_scrap < 0 THEN
    v_reduce_remaining := ABS(v_delta_scrap);

    SELECT COALESCE(SUM(good_used), 0) INTO v_pulled_total
    FROM public.wip_consumptions
    WHERE consuming_session_id = p_session_id
      AND is_scrap = TRUE;

    v_originated_before := COALESCE(v_session.total_scrap, 0) - v_pulled_total;

    v_originated_reduce := LEAST(v_reduce_remaining, v_originated_before);
    v_pulled_reduce := v_reduce_remaining - v_originated_reduce;

    IF v_pulled_reduce > 0 THEN
      FOR v_consumption IN
        SELECT wc.*, jis.id as upstream_jis_id
        FROM public.wip_consumptions wc
        JOIN public.job_item_steps jis ON jis.id = wc.from_job_item_step_id
        WHERE wc.consuming_session_id = p_session_id
          AND wc.is_scrap = TRUE
        ORDER BY wc.created_at DESC
        FOR UPDATE OF wc
      LOOP
        EXIT WHEN v_pulled_reduce <= 0;

        v_return_amount := LEAST(v_consumption.good_used, v_pulled_reduce);

        UPDATE public.wip_balances
        SET good_available = good_available + v_return_amount
        WHERE job_item_step_id = v_consumption.upstream_jis_id
          AND job_item_id = v_session.job_item_id;

        IF v_return_amount = v_consumption.good_used THEN
          DELETE FROM public.wip_consumptions WHERE id = v_consumption.id;
        ELSE
          UPDATE public.wip_consumptions
          SET good_used = good_used - v_return_amount
          WHERE id = v_consumption.id;
        END IF;

        v_pulled_reduce := v_pulled_reduce - v_return_amount;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.sessions
  SET total_good = p_total_good, total_scrap = p_total_scrap
  WHERE id = p_session_id;

  v_result.success := true;
  v_result.total_good := p_total_good;
  v_result.total_scrap := p_total_scrap;
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."update_session_quantities_atomic_v3"("p_session_id" "uuid", "p_total_good" integer, "p_total_scrap" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_session_quantities_atomic_v3"("p_session_id" "uuid", "p_total_good" integer, "p_total_scrap" integer) IS 'Atomically updates session quantities with WIP balance management (v3: uses renamed job_item_steps columns)';



CREATE OR REPLACE FUNCTION "public"."update_session_quantities_atomic_v4"("p_session_id" "uuid", "p_delta_good" integer, "p_delta_scrap" integer) RETURNS "public"."session_update_result"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_session RECORD;
  v_step_info RECORD;
  v_upstream_step RECORD;
  v_wip_balance RECORD;
  v_pull_amount INTEGER;
  v_result session_update_result;
  v_lock_key BIGINT;
BEGIN
  v_result.success := false;
  v_result.error_code := NULL;
  v_result.session_id := p_session_id;

  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL THEN
    v_result.error_code := 'SESSION_NOT_FOUND';
    RETURN v_result;
  END IF;

  IF v_session.job_item_id IS NULL THEN
    v_result.success := true;
    v_result.total_good := p_delta_good;
    v_result.total_scrap := p_delta_scrap;
    RETURN v_result;
  END IF;

  SELECT position, is_terminal INTO v_step_info
  FROM public.job_item_steps
  WHERE id = v_session.job_item_step_id;

  IF v_step_info IS NULL THEN
    v_result.error_code := 'JOB_ITEM_STEP_NOT_FOUND';
    RETURN v_result;
  END IF;

  v_lock_key := hashtext(v_session.job_item_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT * INTO v_wip_balance
  FROM public.wip_balances
  WHERE job_item_id = v_session.job_item_id
    AND job_item_step_id = v_session.job_item_step_id
  FOR UPDATE;

  IF v_wip_balance IS NULL THEN
    v_result.error_code := 'WIP_BALANCE_NOT_FOUND';
    RETURN v_result;
  END IF;

  IF p_delta_good > 0 THEN
    IF v_step_info.position > 1 THEN
      SELECT jis.*, wb.id as wip_balance_id, wb.good_available
      INTO v_upstream_step
      FROM public.job_item_steps jis
      JOIN public.wip_balances wb ON wb.job_item_step_id = jis.id
      WHERE jis.job_item_id = v_session.job_item_id
        AND jis.position = v_step_info.position - 1
      FOR UPDATE OF wb;

      IF v_upstream_step IS NOT NULL AND v_upstream_step.good_available > 0 THEN
        v_pull_amount := LEAST(p_delta_good, v_upstream_step.good_available);

        UPDATE public.wip_balances
        SET good_available = good_available - v_pull_amount
        WHERE id = v_upstream_step.wip_balance_id;

        INSERT INTO public.wip_consumptions (
          job_item_id,
          consuming_session_id,
          from_job_item_step_id,
          good_used,
          is_scrap
        ) VALUES (
          v_session.job_item_id,
          p_session_id,
          v_upstream_step.id,
          v_pull_amount,
          FALSE
        );
      END IF;
    END IF;

    UPDATE public.wip_balances
    SET good_available = good_available + p_delta_good
    WHERE id = v_wip_balance.id;

    IF v_step_info.is_terminal THEN
      UPDATE public.job_item_progress
      SET completed_good = completed_good + p_delta_good
      WHERE job_item_id = v_session.job_item_id;
    END IF;
  END IF;

  IF p_delta_scrap > 0 THEN
    IF v_step_info.position > 1 THEN
      SELECT jis.*, wb.id as wip_balance_id, wb.good_available
      INTO v_upstream_step
      FROM public.job_item_steps jis
      JOIN public.wip_balances wb ON wb.job_item_step_id = jis.id
      WHERE jis.job_item_id = v_session.job_item_id
        AND jis.position = v_step_info.position - 1
      FOR UPDATE OF wb;

      IF v_upstream_step IS NOT NULL AND v_upstream_step.good_available > 0 THEN
        v_pull_amount := LEAST(p_delta_scrap, v_upstream_step.good_available);

        UPDATE public.wip_balances
        SET good_available = good_available - v_pull_amount
        WHERE id = v_upstream_step.wip_balance_id;

        INSERT INTO public.wip_consumptions (
          job_item_id,
          consuming_session_id,
          from_job_item_step_id,
          good_used,
          is_scrap
        ) VALUES (
          v_session.job_item_id,
          p_session_id,
          v_upstream_step.id,
          v_pull_amount,
          TRUE
        );
      END IF;
    END IF;
  END IF;

  v_result.success := true;
  v_result.total_good := p_delta_good;
  v_result.total_scrap := p_delta_scrap;
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."update_session_quantities_atomic_v4"("p_session_id" "uuid", "p_delta_good" integer, "p_delta_scrap" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_session_quantities_atomic_v4"("p_session_id" "uuid", "p_delta_good" integer, "p_delta_scrap" integer) IS 'Simplified WIP update (v4): additive-only, no decrease/correction path, no LIFO reversal. Takes deltas (increments), not totals.';



CREATE OR REPLACE FUNCTION "public"."validate_checklist_jsonb"("data" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
  -- Must be an array
  IF jsonb_typeof(data) != 'array' THEN
    RETURN FALSE;
  END IF;

  -- Empty array is valid
  IF jsonb_array_length(data) = 0 THEN
    RETURN TRUE;
  END IF;

  -- Each item must have required fields: id, label_he, order_index
  RETURN NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(data) AS item
    WHERE NOT (
      item ? 'id' AND
      item ? 'label_he' AND
      item ? 'order_index'
    )
  );
END;
$$;


ALTER FUNCTION "public"."validate_checklist_jsonb"("data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_report_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Skip if status unchanged
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Malfunction reports: open <-> known -> solved, solved -> open (return from archive)
  IF NEW.type = 'malfunction' THEN
    -- From open: can go to known or solved
    IF OLD.status = 'open' AND NEW.status NOT IN ('known', 'solved') THEN
      RAISE EXCEPTION 'Malfunction open can only transition to known or solved';
    END IF;

    -- From known: can only go to solved (no backtrack to open)
    IF OLD.status = 'known' AND NEW.status NOT IN ('solved') THEN
      RAISE EXCEPTION 'Malfunction known can only transition to solved';
    END IF;

    -- From solved: can only go back to open (return from archive)
    IF OLD.status = 'solved' AND NEW.status NOT IN ('open') THEN
      RAISE EXCEPTION 'Malfunction solved can only transition back to open';
    END IF;
  END IF;

  -- General/Scrap reports: new -> approved only (no backtrack)
  IF NEW.type IN ('general', 'scrap') THEN
    -- From new: can only go to approved
    IF OLD.status = 'new' AND NEW.status != 'approved' THEN
      RAISE EXCEPTION 'General/scrap reports can only transition from new to approved';
    END IF;

    -- From approved: cannot transition anywhere
    IF OLD.status = 'approved' THEN
      RAISE EXCEPTION 'Cannot transition from approved status';
    END IF;
  END IF;

  -- Update status_changed_at timestamp
  NEW.status_changed_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_report_transition"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_station_reasons_jsonb"("data" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
  -- Must be an array
  IF jsonb_typeof(data) != 'array' THEN
    RETURN FALSE;
  END IF;

  -- Empty array is valid
  IF jsonb_array_length(data) = 0 THEN
    RETURN TRUE;
  END IF;

  -- Each item must have required fields: id, label_he
  RETURN NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(data) AS item
    WHERE NOT (
      item ? 'id' AND
      item ? 'label_he'
    )
  );
END;
$$;


ALTER FUNCTION "public"."validate_station_reasons_jsonb"("data" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_item_progress" (
    "job_item_id" "uuid" NOT NULL,
    "completed_good" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "job_item_progress_completed_good_check" CHECK (("completed_good" >= 0))
);


ALTER TABLE "public"."job_item_progress" OWNER TO "postgres";


COMMENT ON TABLE "public"."job_item_progress" IS 'Tracks completed GOOD count (terminal station output only)';



CREATE TABLE IF NOT EXISTS "public"."job_item_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_item_id" "uuid" NOT NULL,
    "station_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "is_terminal" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "requires_first_product_approval" boolean DEFAULT false,
    CONSTRAINT "job_item_stations_position_check" CHECK (("position" > 0))
);


ALTER TABLE "public"."job_item_steps" OWNER TO "postgres";


COMMENT ON TABLE "public"."job_item_steps" IS 'Pipeline steps for each job item - frozen snapshot of stations';



COMMENT ON COLUMN "public"."job_item_steps"."position" IS 'Order of step in pipeline (1-indexed)';



COMMENT ON COLUMN "public"."job_item_steps"."is_terminal" IS 'True for the last step - only terminal GOOD counts as completed';



COMMENT ON COLUMN "public"."job_item_steps"."requires_first_product_approval" IS 'When true, workers must submit and get approval for first product report before entering production status';



CREATE TABLE IF NOT EXISTS "public"."job_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "planned_quantity" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "pipeline_preset_id" "uuid",
    "is_pipeline_locked" boolean DEFAULT false NOT NULL,
    CONSTRAINT "job_items_planned_quantity_check" CHECK (("planned_quantity" > 0))
);


ALTER TABLE "public"."job_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."job_items" IS 'Job items represent products with pipeline workflows. Each has job_item_steps defining the station sequence.';



COMMENT ON COLUMN "public"."job_items"."planned_quantity" IS 'Target quantity to produce';



COMMENT ON COLUMN "public"."job_items"."name" IS 'Required custom name for the job item/product';



COMMENT ON COLUMN "public"."job_items"."pipeline_preset_id" IS 'Optional reference to the preset used to create this pipeline (provenance tracking)';



COMMENT ON COLUMN "public"."job_items"."is_pipeline_locked" IS 'True once production has started on this item, preventing pipeline modification';



CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_number" "text" NOT NULL,
    "customer_name" "text",
    "description" "text",
    "planned_quantity" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "due_date" "date"
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipeline_preset_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pipeline_preset_id" "uuid" NOT NULL,
    "station_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "requires_first_product_approval" boolean DEFAULT false,
    CONSTRAINT "pipeline_preset_steps_position_check" CHECK (("position" > 0))
);


ALTER TABLE "public"."pipeline_preset_steps" OWNER TO "postgres";


COMMENT ON TABLE "public"."pipeline_preset_steps" IS 'Ordered stations within a pipeline preset';



COMMENT ON COLUMN "public"."pipeline_preset_steps"."position" IS 'Order of station in pipeline (1-indexed)';



COMMENT ON COLUMN "public"."pipeline_preset_steps"."requires_first_product_approval" IS 'Default value for requires_first_product_approval when creating job items from this preset';



CREATE TABLE IF NOT EXISTS "public"."pipeline_presets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pipeline_presets" OWNER TO "postgres";


COMMENT ON TABLE "public"."pipeline_presets" IS 'Reusable pipeline templates for multi-station job items';



COMMENT ON COLUMN "public"."pipeline_presets"."name" IS 'Display name of the pipeline preset';



COMMENT ON COLUMN "public"."pipeline_presets"."description" IS 'Optional description of the pipeline purpose';



CREATE TABLE IF NOT EXISTS "public"."report_reasons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label_he" "text" NOT NULL,
    "label_ru" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."report_reasons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "public"."report_type_enum" NOT NULL,
    "station_id" "uuid",
    "session_id" "uuid",
    "reported_by_worker_id" "uuid",
    "status_event_id" "uuid",
    "description" "text",
    "image_url" "text",
    "station_reason_id" "text",
    "report_reason_id" "uuid",
    "status" "public"."report_status" DEFAULT 'new'::"public"."report_status" NOT NULL,
    "status_changed_at" timestamp with time zone,
    "status_changed_by" "text",
    "admin_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "job_item_id" "uuid",
    "is_first_product_qa" boolean DEFAULT false
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


COMMENT ON COLUMN "public"."reports"."job_item_id" IS 'Links QA reports to specific job items';



COMMENT ON COLUMN "public"."reports"."is_first_product_qa" IS 'True for first product QA approval requests';



CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid",
    "station_id" "uuid",
    "job_id" "uuid",
    "status" "public"."session_status" DEFAULT 'active'::"public"."session_status" NOT NULL,
    "current_status_id" "uuid" NOT NULL,
    "last_status_change_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "last_seen_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "forced_closed_at" timestamp with time zone,
    "active_instance_id" "text",
    "total_good" integer DEFAULT 0 NOT NULL,
    "total_scrap" integer DEFAULT 0 NOT NULL,
    "start_checklist_completed" boolean DEFAULT false NOT NULL,
    "end_checklist_completed" boolean DEFAULT false NOT NULL,
    "scrap_report_submitted" boolean DEFAULT false NOT NULL,
    "worker_full_name_snapshot" "text",
    "worker_code_snapshot" "text",
    "station_name_snapshot" "text",
    "station_code_snapshot" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "job_item_id" "uuid",
    "job_item_step_id" "uuid"
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."sessions"."job_id" IS 'Optional - job bound when entering production. SET NULL on job deletion to preserve session history.';



COMMENT ON COLUMN "public"."sessions"."job_item_id" IS 'References the job item being worked on (NULL for legacy sessions)';



COMMENT ON COLUMN "public"."sessions"."job_item_step_id" IS 'References the specific step within the job item (was job_item_station_id)';



CREATE TABLE IF NOT EXISTS "public"."wip_consumptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_item_id" "uuid" NOT NULL,
    "consuming_session_id" "uuid" NOT NULL,
    "from_job_item_step_id" "uuid" NOT NULL,
    "good_used" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_scrap" boolean DEFAULT false NOT NULL,
    CONSTRAINT "wip_consumptions_good_used_check" CHECK (("good_used" > 0))
);


ALTER TABLE "public"."wip_consumptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."wip_consumptions" IS 'Ledger of WIP pulls - enables LIFO reversal during corrections';



COMMENT ON COLUMN "public"."wip_consumptions"."from_job_item_step_id" IS 'The upstream step that provided the GOOD (was from_job_item_station_id)';



COMMENT ON COLUMN "public"."wip_consumptions"."good_used" IS 'Amount of GOOD pulled from upstream (must be > 0)';



CREATE OR REPLACE VIEW "public"."session_wip_accounting" AS
 SELECT "s"."id" AS "session_id",
    "s"."job_item_id",
    "s"."job_item_step_id",
    "s"."total_good",
    "s"."total_scrap",
    (COALESCE("sum"(
        CASE
            WHEN ("wc"."is_scrap" = false) THEN "wc"."good_used"
            ELSE 0
        END), (0)::bigint))::integer AS "pulled_good",
    (("s"."total_good" - COALESCE("sum"(
        CASE
            WHEN ("wc"."is_scrap" = false) THEN "wc"."good_used"
            ELSE 0
        END), (0)::bigint)))::integer AS "originated_good",
    (COALESCE("sum"(
        CASE
            WHEN ("wc"."is_scrap" = true) THEN "wc"."good_used"
            ELSE 0
        END), (0)::bigint))::integer AS "pulled_scrap",
    (("s"."total_scrap" - COALESCE("sum"(
        CASE
            WHEN ("wc"."is_scrap" = true) THEN "wc"."good_used"
            ELSE 0
        END), (0)::bigint)))::integer AS "originated_scrap"
   FROM ("public"."sessions" "s"
     LEFT JOIN "public"."wip_consumptions" "wc" ON (("wc"."consuming_session_id" = "s"."id")))
  WHERE ("s"."job_item_id" IS NOT NULL)
  GROUP BY "s"."id", "s"."job_item_id", "s"."job_item_step_id", "s"."total_good", "s"."total_scrap";


ALTER VIEW "public"."session_wip_accounting" OWNER TO "postgres";


COMMENT ON VIEW "public"."session_wip_accounting" IS 'Shows WIP accounting breakdown for each session';



CREATE TABLE IF NOT EXISTS "public"."stations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "station_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "start_checklist" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "end_checklist" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "station_reasons" "jsonb" DEFAULT '[{"id": "general-malfunction", "label_he": "תקלת כללית", "label_ru": "Общая неисправность", "is_active": true}]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "requires_first_product_qa" boolean DEFAULT false,
    CONSTRAINT "station_type_check" CHECK (("station_type" = ANY (ARRAY['prepress'::"text", 'digital_press'::"text", 'offset'::"text", 'folding'::"text", 'cutting'::"text", 'binding'::"text", 'shrink'::"text", 'lamination'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."stations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."stations"."requires_first_product_qa" IS 'DEPRECATED: Use job_item_steps.requires_first_product_approval instead';



CREATE TABLE IF NOT EXISTS "public"."status_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scope" "text" NOT NULL,
    "station_id" "uuid",
    "label_he" "text" NOT NULL,
    "label_ru" "text",
    "color_hex" "text" DEFAULT '#94a3b8'::"text" NOT NULL,
    "machine_state" "text" NOT NULL,
    "report_type" "text" DEFAULT 'none'::"text" NOT NULL,
    "is_protected" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "status_definitions_color_hex_allowed" CHECK (("color_hex" = ANY (ARRAY['#10b981'::"text", '#f59e0b'::"text", '#f97316'::"text", '#ef4444'::"text", '#3b82f6'::"text", '#8b5cf6'::"text", '#06b6d4'::"text", '#14b8a6'::"text", '#84cc16'::"text", '#eab308'::"text", '#ec4899'::"text", '#6366f1'::"text", '#0ea5e9'::"text", '#64748b'::"text", '#94a3b8'::"text"]))),
    CONSTRAINT "status_definitions_machine_state_check" CHECK (("machine_state" = ANY (ARRAY['production'::"text", 'setup'::"text", 'stoppage'::"text"]))),
    CONSTRAINT "status_definitions_report_type_check" CHECK (("report_type" = ANY (ARRAY['none'::"text", 'malfunction'::"text", 'general'::"text"]))),
    CONSTRAINT "status_definitions_scope_check" CHECK (("scope" = ANY (ARRAY['global'::"text", 'station'::"text"]))),
    CONSTRAINT "status_definitions_station_scope_check" CHECK (((("scope" = 'global'::"text") AND ("station_id" IS NULL)) OR (("scope" = 'station'::"text") AND ("station_id" IS NOT NULL))))
);


ALTER TABLE "public"."status_definitions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_session_current_job_item_totals" AS
 SELECT "s"."id" AS "session_id",
    "s"."job_item_id",
    (COALESCE("sum"("se"."quantity_good"), (0)::bigint))::integer AS "total_good",
    (COALESCE("sum"("se"."quantity_scrap"), (0)::bigint))::integer AS "total_scrap"
   FROM ("public"."sessions" "s"
     LEFT JOIN "public"."status_events" "se" ON ((("se"."session_id" = "s"."id") AND ("se"."job_item_id" = "s"."job_item_id"))))
  GROUP BY "s"."id", "s"."job_item_id";


ALTER VIEW "public"."v_session_current_job_item_totals" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_session_current_job_item_totals" IS 'Derives session totals from SUM(status_events.quantity_*) for the current job_item_id only.
   Use this for active session displays where you want quantities for the current job item,
   not historical totals from previous job items in the same session.';



CREATE OR REPLACE VIEW "public"."v_session_derived_totals" AS
 SELECT "s"."id" AS "session_id",
    (COALESCE("sum"("se"."quantity_good"), (0)::bigint))::integer AS "total_good",
    (COALESCE("sum"("se"."quantity_scrap"), (0)::bigint))::integer AS "total_scrap"
   FROM ("public"."sessions" "s"
     LEFT JOIN "public"."status_events" "se" ON (("se"."session_id" = "s"."id")))
  GROUP BY "s"."id";


ALTER VIEW "public"."v_session_derived_totals" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_session_derived_totals" IS 'Derives session totals from SUM(status_events.quantity_good/scrap). Use this instead of sessions.total_good/scrap columns.';



CREATE OR REPLACE VIEW "public"."v_session_wip_accounting" AS
 SELECT "s"."id" AS "session_id",
    "s"."job_item_id",
    "s"."job_item_step_id" AS "job_item_station_id",
    COALESCE("s"."total_good", 0) AS "total_good",
    (COALESCE("good_pulls"."pulled", (0)::bigint))::integer AS "pulled_good",
    ((COALESCE("s"."total_good", 0) - COALESCE("good_pulls"."pulled", (0)::bigint)))::integer AS "originated_good",
    COALESCE("s"."total_scrap", 0) AS "total_scrap",
    (COALESCE("scrap_pulls"."pulled", (0)::bigint))::integer AS "pulled_scrap",
    ((COALESCE("s"."total_scrap", 0) - COALESCE("scrap_pulls"."pulled", (0)::bigint)))::integer AS "originated_scrap"
   FROM (("public"."sessions" "s"
     LEFT JOIN ( SELECT "wip_consumptions"."consuming_session_id",
            "sum"("wip_consumptions"."good_used") AS "pulled"
           FROM "public"."wip_consumptions"
          WHERE ("wip_consumptions"."is_scrap" = false)
          GROUP BY "wip_consumptions"."consuming_session_id") "good_pulls" ON (("good_pulls"."consuming_session_id" = "s"."id")))
     LEFT JOIN ( SELECT "wip_consumptions"."consuming_session_id",
            "sum"("wip_consumptions"."good_used") AS "pulled"
           FROM "public"."wip_consumptions"
          WHERE ("wip_consumptions"."is_scrap" = true)
          GROUP BY "wip_consumptions"."consuming_session_id") "scrap_pulls" ON (("scrap_pulls"."consuming_session_id" = "s"."id")))
  WHERE ("s"."job_item_id" IS NOT NULL);


ALTER VIEW "public"."v_session_wip_accounting" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_session_wip_accounting" IS 'Shows how much each session originated vs pulled from upstream, separately for good and scrap';



COMMENT ON COLUMN "public"."v_session_wip_accounting"."pulled_good" IS 'Amount of GOOD consumed from upstream step balance';



COMMENT ON COLUMN "public"."v_session_wip_accounting"."originated_good" IS 'Amount of GOOD created at this step (not pulled from upstream)';



COMMENT ON COLUMN "public"."v_session_wip_accounting"."pulled_scrap" IS 'Amount consumed from upstream that became SCRAP';



COMMENT ON COLUMN "public"."v_session_wip_accounting"."originated_scrap" IS 'Amount of SCRAP created at this step (not from upstream)';



CREATE TABLE IF NOT EXISTS "public"."wip_balances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_item_id" "uuid" NOT NULL,
    "job_item_step_id" "uuid" NOT NULL,
    "good_available" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wip_balances_good_available_check" CHECK (("good_available" >= 0))
);


ALTER TABLE "public"."wip_balances" OWNER TO "postgres";


COMMENT ON TABLE "public"."wip_balances" IS 'GOOD-only WIP balance per step - tracks available inventory between stations';



COMMENT ON COLUMN "public"."wip_balances"."job_item_step_id" IS 'References the job item step (was job_item_station_id)';



COMMENT ON COLUMN "public"."wip_balances"."good_available" IS 'Number of GOOD units available for downstream consumption';



CREATE TABLE IF NOT EXISTS "public"."worker_stations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "station_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."worker_stations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_code" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "language" "text" DEFAULT 'auto'::"text",
    "role" "public"."worker_role" DEFAULT 'worker'::"public"."worker_role" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "department" "text",
    CONSTRAINT "workers_language_check" CHECK (("language" = ANY (ARRAY['he'::"text", 'ru'::"text", 'auto'::"text"])))
);


ALTER TABLE "public"."workers" OWNER TO "postgres";


ALTER TABLE ONLY "public"."job_item_progress"
    ADD CONSTRAINT "job_item_progress_pkey" PRIMARY KEY ("job_item_id");



ALTER TABLE ONLY "public"."job_item_steps"
    ADD CONSTRAINT "job_item_stations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_items"
    ADD CONSTRAINT "job_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_job_number_key" UNIQUE ("job_number");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipeline_preset_steps"
    ADD CONSTRAINT "pipeline_preset_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipeline_presets"
    ADD CONSTRAINT "pipeline_presets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_reasons"
    ADD CONSTRAINT "report_reasons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stations"
    ADD CONSTRAINT "stations_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."stations"
    ADD CONSTRAINT "stations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."status_definitions"
    ADD CONSTRAINT "status_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."status_events"
    ADD CONSTRAINT "status_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_item_steps"
    ADD CONSTRAINT "uq_job_item_step_position" UNIQUE ("job_item_id", "position");



ALTER TABLE ONLY "public"."job_item_steps"
    ADD CONSTRAINT "uq_job_item_step_station" UNIQUE ("job_item_id", "station_id");



ALTER TABLE ONLY "public"."pipeline_preset_steps"
    ADD CONSTRAINT "uq_preset_position" UNIQUE ("pipeline_preset_id", "position");



ALTER TABLE ONLY "public"."pipeline_preset_steps"
    ADD CONSTRAINT "uq_preset_station" UNIQUE ("pipeline_preset_id", "station_id");



ALTER TABLE ONLY "public"."wip_balances"
    ADD CONSTRAINT "uq_wip_step" UNIQUE ("job_item_id", "job_item_step_id");



ALTER TABLE ONLY "public"."wip_balances"
    ADD CONSTRAINT "wip_balances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wip_consumptions"
    ADD CONSTRAINT "wip_consumptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_stations"
    ADD CONSTRAINT "worker_stations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_stations"
    ADD CONSTRAINT "worker_stations_worker_id_station_id_key" UNIQUE ("worker_id", "station_id");



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_worker_code_key" UNIQUE ("worker_code");



CREATE INDEX "idx_job_item_steps_job_item" ON "public"."job_item_steps" USING "btree" ("job_item_id");



CREATE INDEX "idx_job_item_steps_station" ON "public"."job_item_steps" USING "btree" ("station_id");



CREATE INDEX "idx_job_item_steps_terminal" ON "public"."job_item_steps" USING "btree" ("job_item_id") WHERE ("is_terminal" = true);



CREATE INDEX "idx_job_items_active" ON "public"."job_items" USING "btree" ("is_active");



CREATE INDEX "idx_job_items_job" ON "public"."job_items" USING "btree" ("job_id");



CREATE INDEX "idx_job_items_name" ON "public"."job_items" USING "btree" ("name");



CREATE INDEX "idx_job_items_preset" ON "public"."job_items" USING "btree" ("pipeline_preset_id") WHERE ("pipeline_preset_id" IS NOT NULL);



CREATE INDEX "idx_job_items_unlocked" ON "public"."job_items" USING "btree" ("is_pipeline_locked") WHERE ("is_pipeline_locked" = false);



CREATE INDEX "idx_jobs_due_date" ON "public"."jobs" USING "btree" ("due_date");



CREATE INDEX "idx_pipeline_preset_steps_preset" ON "public"."pipeline_preset_steps" USING "btree" ("pipeline_preset_id");



CREATE INDEX "idx_pipeline_preset_steps_station" ON "public"."pipeline_preset_steps" USING "btree" ("station_id");



CREATE INDEX "idx_pipeline_presets_active" ON "public"."pipeline_presets" USING "btree" ("is_active");



CREATE INDEX "idx_pipeline_presets_name" ON "public"."pipeline_presets" USING "btree" ("name");



CREATE INDEX "idx_reports_first_product_qa" ON "public"."reports" USING "btree" ("job_item_id", "station_id") WHERE ("is_first_product_qa" = true);



CREATE INDEX "idx_reports_first_product_session" ON "public"."reports" USING "btree" ("session_id") WHERE ("is_first_product_qa" = true);



CREATE INDEX "idx_sessions_active_job_item_step" ON "public"."sessions" USING "btree" ("job_item_step_id", "status") WHERE (("job_item_step_id" IS NOT NULL) AND ("status" = 'active'::"public"."session_status"));



CREATE INDEX "idx_sessions_job_item" ON "public"."sessions" USING "btree" ("job_item_id") WHERE ("job_item_id" IS NOT NULL);



CREATE INDEX "idx_sessions_job_item_step" ON "public"."sessions" USING "btree" ("job_item_step_id") WHERE ("job_item_step_id" IS NOT NULL);



CREATE INDEX "idx_status_events_job_item" ON "public"."status_events" USING "btree" ("job_item_id") WHERE ("job_item_id" IS NOT NULL);



CREATE INDEX "idx_status_events_job_item_step" ON "public"."status_events" USING "btree" ("job_item_step_id") WHERE ("job_item_step_id" IS NOT NULL);



CREATE INDEX "idx_wip_balances_high_wip" ON "public"."wip_balances" USING "btree" ("good_available" DESC) WHERE ("good_available" > 0);



CREATE INDEX "idx_wip_balances_job_item" ON "public"."wip_balances" USING "btree" ("job_item_id");



CREATE INDEX "idx_wip_balances_job_item_step" ON "public"."wip_balances" USING "btree" ("job_item_step_id");



CREATE INDEX "idx_wip_consumptions_from_step" ON "public"."wip_consumptions" USING "btree" ("job_item_id", "from_job_item_step_id");



CREATE INDEX "idx_wip_consumptions_is_scrap" ON "public"."wip_consumptions" USING "btree" ("consuming_session_id", "is_scrap");



CREATE INDEX "idx_wip_consumptions_session" ON "public"."wip_consumptions" USING "btree" ("consuming_session_id");



CREATE INDEX "idx_wip_consumptions_session_lifo" ON "public"."wip_consumptions" USING "btree" ("consuming_session_id", "created_at" DESC);



CREATE INDEX "reports_created_at_idx" ON "public"."reports" USING "btree" ("created_at" DESC);



CREATE INDEX "reports_session_id_idx" ON "public"."reports" USING "btree" ("session_id");



CREATE INDEX "reports_station_id_idx" ON "public"."reports" USING "btree" ("station_id");



CREATE INDEX "reports_status_event_id_idx" ON "public"."reports" USING "btree" ("status_event_id");



CREATE INDEX "reports_status_idx" ON "public"."reports" USING "btree" ("status");



CREATE INDEX "reports_type_idx" ON "public"."reports" USING "btree" ("type");



CREATE INDEX "reports_type_status_idx" ON "public"."reports" USING "btree" ("type", "status");



CREATE INDEX "sessions_current_status_idx" ON "public"."sessions" USING "btree" ("current_status_id");



CREATE INDEX "sessions_instance_validation_idx" ON "public"."sessions" USING "btree" ("id", "active_instance_id") WHERE ("status" = 'active'::"public"."session_status");



CREATE INDEX "sessions_job_idx" ON "public"."sessions" USING "btree" ("job_id");



CREATE INDEX "sessions_started_at_idx" ON "public"."sessions" USING "btree" ("started_at");



CREATE INDEX "sessions_station_idx" ON "public"."sessions" USING "btree" ("station_id");



CREATE INDEX "sessions_station_occupancy_idx" ON "public"."sessions" USING "btree" ("station_id", "status", "last_seen_at") WHERE (("status" = 'active'::"public"."session_status") AND ("ended_at" IS NULL) AND ("forced_closed_at" IS NULL));



CREATE INDEX "sessions_status_idx" ON "public"."sessions" USING "btree" ("status");



CREATE INDEX "sessions_worker_idx" ON "public"."sessions" USING "btree" ("worker_id");



CREATE INDEX "status_definitions_created_idx" ON "public"."status_definitions" USING "btree" ("created_at");



CREATE INDEX "status_definitions_machine_state_idx" ON "public"."status_definitions" USING "btree" ("machine_state");



CREATE INDEX "status_definitions_protected_idx" ON "public"."status_definitions" USING "btree" ("is_protected") WHERE ("is_protected" = true);



CREATE INDEX "status_definitions_scope_idx" ON "public"."status_definitions" USING "btree" ("scope");



CREATE INDEX "status_definitions_station_idx" ON "public"."status_definitions" USING "btree" ("station_id");



CREATE INDEX "status_events_malfunction_id_idx" ON "public"."status_events" USING "btree" ("report_id");



CREATE INDEX "status_events_session_idx" ON "public"."status_events" USING "btree" ("session_id");



CREATE UNIQUE INDEX "unique_active_session_per_worker" ON "public"."sessions" USING "btree" ("worker_id") WHERE (("status" = 'active'::"public"."session_status") AND ("ended_at" IS NULL));



CREATE INDEX "workers_department_idx" ON "public"."workers" USING "btree" ("department");



CREATE OR REPLACE TRIGGER "job_item_progress_set_updated_at" BEFORE UPDATE ON "public"."job_item_progress" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "job_items_set_updated_at" BEFORE UPDATE ON "public"."job_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "pipeline_presets_set_updated_at" BEFORE UPDATE ON "public"."pipeline_presets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "report_set_default_status" BEFORE INSERT ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."set_report_default_status"();



CREATE OR REPLACE TRIGGER "report_state_transition_check" BEFORE UPDATE OF "status" ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."validate_report_transition"();



CREATE OR REPLACE TRIGGER "status_definitions_set_updated_at" BEFORE UPDATE ON "public"."status_definitions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_lock_pipeline_on_production" AFTER INSERT ON "public"."status_events" FOR EACH ROW EXECUTE FUNCTION "public"."lock_job_item_pipeline_on_production"();



CREATE OR REPLACE TRIGGER "wip_balances_set_updated_at" BEFORE UPDATE ON "public"."wip_balances" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."job_item_progress"
    ADD CONSTRAINT "job_item_progress_job_item_id_fkey" FOREIGN KEY ("job_item_id") REFERENCES "public"."job_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_item_steps"
    ADD CONSTRAINT "job_item_stations_job_item_id_fkey" FOREIGN KEY ("job_item_id") REFERENCES "public"."job_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_item_steps"
    ADD CONSTRAINT "job_item_stations_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id");



ALTER TABLE ONLY "public"."job_items"
    ADD CONSTRAINT "job_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_items"
    ADD CONSTRAINT "job_items_pipeline_preset_id_fkey" FOREIGN KEY ("pipeline_preset_id") REFERENCES "public"."pipeline_presets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pipeline_preset_steps"
    ADD CONSTRAINT "pipeline_preset_steps_pipeline_preset_id_fkey" FOREIGN KEY ("pipeline_preset_id") REFERENCES "public"."pipeline_presets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pipeline_preset_steps"
    ADD CONSTRAINT "pipeline_preset_steps_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_job_item_id_fkey" FOREIGN KEY ("job_item_id") REFERENCES "public"."job_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_report_reason_id_fkey" FOREIGN KEY ("report_reason_id") REFERENCES "public"."report_reasons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_by_worker_id_fkey" FOREIGN KEY ("reported_by_worker_id") REFERENCES "public"."workers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_status_event_id_fkey" FOREIGN KEY ("status_event_id") REFERENCES "public"."status_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_current_status_id_fkey" FOREIGN KEY ("current_status_id") REFERENCES "public"."status_definitions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_job_item_id_fkey" FOREIGN KEY ("job_item_id") REFERENCES "public"."job_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_job_item_station_id_fkey" FOREIGN KEY ("job_item_step_id") REFERENCES "public"."job_item_steps"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."status_definitions"
    ADD CONSTRAINT "status_definitions_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."status_events"
    ADD CONSTRAINT "status_events_job_item_id_fkey" FOREIGN KEY ("job_item_id") REFERENCES "public"."job_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."status_events"
    ADD CONSTRAINT "status_events_job_item_step_id_fkey" FOREIGN KEY ("job_item_step_id") REFERENCES "public"."job_item_steps"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."status_events"
    ADD CONSTRAINT "status_events_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."status_events"
    ADD CONSTRAINT "status_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."status_events"
    ADD CONSTRAINT "status_events_status_definition_id_fkey" FOREIGN KEY ("status_definition_id") REFERENCES "public"."status_definitions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."wip_balances"
    ADD CONSTRAINT "wip_balances_job_item_id_fkey" FOREIGN KEY ("job_item_id") REFERENCES "public"."job_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wip_balances"
    ADD CONSTRAINT "wip_balances_job_item_station_id_fkey" FOREIGN KEY ("job_item_step_id") REFERENCES "public"."job_item_steps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wip_consumptions"
    ADD CONSTRAINT "wip_consumptions_consuming_session_id_fkey" FOREIGN KEY ("consuming_session_id") REFERENCES "public"."sessions"("id") ON DELETE RESTRICT;



COMMENT ON CONSTRAINT "wip_consumptions_consuming_session_id_fkey" ON "public"."wip_consumptions" IS 'RESTRICT delete: Sessions with WIP consumptions cannot be deleted directly. This prevents orphaned WIP balance changes. Complete the session properly to handle WIP cleanup.';



ALTER TABLE ONLY "public"."wip_consumptions"
    ADD CONSTRAINT "wip_consumptions_from_job_item_station_id_fkey" FOREIGN KEY ("from_job_item_step_id") REFERENCES "public"."job_item_steps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wip_consumptions"
    ADD CONSTRAINT "wip_consumptions_job_item_id_fkey" FOREIGN KEY ("job_item_id") REFERENCES "public"."job_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_stations"
    ADD CONSTRAINT "worker_stations_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_stations"
    ADD CONSTRAINT "worker_stations_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can create jobs" ON "public"."jobs" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can read and create jobs" ON "public"."jobs" FOR SELECT USING (true);



CREATE POLICY "Anyone can read status definitions" ON "public"."status_definitions" FOR SELECT USING (true);



CREATE POLICY "Anyone can view active stations" ON "public"."stations" FOR SELECT USING ((((("current_setting"('request.jwt.claims'::"text", true))::json ->> 'role'::"text") = 'service_role'::"text") OR ("is_active" = true)));



CREATE POLICY "Anyone can view job item progress" ON "public"."job_item_progress" FOR SELECT USING (true);



CREATE POLICY "Anyone can view job item stations" ON "public"."job_item_steps" FOR SELECT USING (true);



CREATE POLICY "Anyone can view job items" ON "public"."job_items" FOR SELECT USING (true);



CREATE POLICY "Anyone can view wip balances" ON "public"."wip_balances" FOR SELECT USING (true);



CREATE POLICY "Anyone can view wip consumptions" ON "public"."wip_consumptions" FOR SELECT USING (true);



CREATE POLICY "Service role can manage job item progress" ON "public"."job_item_progress" USING (((("current_setting"('request.jwt.claims'::"text", true))::json ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage job item stations" ON "public"."job_item_steps" USING (((("current_setting"('request.jwt.claims'::"text", true))::json ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage job items" ON "public"."job_items" USING (((("current_setting"('request.jwt.claims'::"text", true))::json ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage jobs" ON "public"."jobs" USING (((("current_setting"('request.jwt.claims'::"text", true))::json ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage sessions" ON "public"."sessions" USING (((("current_setting"('request.jwt.claims'::"text", true))::json ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage stations" ON "public"."stations" USING (((("current_setting"('request.jwt.claims'::"text", true))::json ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage status definitions" ON "public"."status_definitions" USING (((("current_setting"('request.jwt.claims'::"text", true))::json ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage status events" ON "public"."status_events" USING (((("current_setting"('request.jwt.claims'::"text", true))::json ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage wip balances" ON "public"."wip_balances" USING (((("current_setting"('request.jwt.claims'::"text", true))::json ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage wip consumptions" ON "public"."wip_consumptions" USING (((("current_setting"('request.jwt.claims'::"text", true))::json ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage worker stations" ON "public"."worker_stations" USING (((("current_setting"('request.jwt.claims'::"text", true))::json ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage workers" ON "public"."workers" USING (((("current_setting"('request.jwt.claims'::"text", true))::json ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role has full access to pipeline_preset_steps" ON "public"."pipeline_preset_steps" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to pipeline_presets" ON "public"."pipeline_presets" USING (true) WITH CHECK (true);



ALTER TABLE "public"."job_item_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_item_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pipeline_preset_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pipeline_presets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_reasons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."status_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."status_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wip_balances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wip_consumptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."worker_stations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workers" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."reports";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."sessions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."status_events";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wip_consumptions";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."create_session_atomic"("p_worker_id" "uuid", "p_station_id" "uuid", "p_job_id" "uuid", "p_instance_id" "text", "p_job_item_id" "uuid", "p_job_item_step_id" "uuid", "p_initial_status_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_session_atomic"("p_worker_id" "uuid", "p_station_id" "uuid", "p_job_id" "uuid", "p_instance_id" "text", "p_job_item_id" "uuid", "p_job_item_step_id" "uuid", "p_initial_status_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_session_atomic"("p_worker_id" "uuid", "p_station_id" "uuid", "p_job_id" "uuid", "p_instance_id" "text", "p_job_item_id" "uuid", "p_job_item_step_id" "uuid", "p_initial_status_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."status_events" TO "anon";
GRANT ALL ON TABLE "public"."status_events" TO "authenticated";
GRANT ALL ON TABLE "public"."status_events" TO "service_role";



GRANT ALL ON FUNCTION "public"."create_status_event_atomic"("p_session_id" "uuid", "p_status_definition_id" "uuid", "p_station_reason_id" "text", "p_note" "text", "p_image_url" "text", "p_report_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_status_event_atomic"("p_session_id" "uuid", "p_status_definition_id" "uuid", "p_station_reason_id" "text", "p_note" "text", "p_image_url" "text", "p_report_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_status_event_atomic"("p_session_id" "uuid", "p_status_definition_id" "uuid", "p_station_reason_id" "text", "p_note" "text", "p_image_url" "text", "p_report_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."end_production_status_atomic"("p_session_id" "uuid", "p_status_event_id" "uuid", "p_quantity_good" integer, "p_quantity_scrap" integer, "p_next_status_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."end_production_status_atomic"("p_session_id" "uuid", "p_status_event_id" "uuid", "p_quantity_good" integer, "p_quantity_scrap" integer, "p_next_status_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."end_production_status_atomic"("p_session_id" "uuid", "p_status_event_id" "uuid", "p_quantity_good" integer, "p_quantity_scrap" integer, "p_next_status_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_jobs_with_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_jobs_with_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_jobs_with_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lock_job_item_pipeline_on_production"() TO "anon";
GRANT ALL ON FUNCTION "public"."lock_job_item_pipeline_on_production"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lock_job_item_pipeline_on_production"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rebuild_job_item_steps"("p_job_item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rebuild_job_item_steps"("p_job_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rebuild_job_item_steps"("p_job_item_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_report_default_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_report_default_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_report_default_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."setup_job_item_pipeline"("p_job_item_id" "uuid", "p_station_ids" "uuid"[], "p_preset_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."setup_job_item_pipeline"("p_job_item_id" "uuid", "p_station_ids" "uuid"[], "p_preset_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."setup_job_item_pipeline"("p_job_item_id" "uuid", "p_station_ids" "uuid"[], "p_preset_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_session_quantities_atomic_v3"("p_session_id" "uuid", "p_total_good" integer, "p_total_scrap" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_session_quantities_atomic_v3"("p_session_id" "uuid", "p_total_good" integer, "p_total_scrap" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_session_quantities_atomic_v3"("p_session_id" "uuid", "p_total_good" integer, "p_total_scrap" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_session_quantities_atomic_v4"("p_session_id" "uuid", "p_delta_good" integer, "p_delta_scrap" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_session_quantities_atomic_v4"("p_session_id" "uuid", "p_delta_good" integer, "p_delta_scrap" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_session_quantities_atomic_v4"("p_session_id" "uuid", "p_delta_good" integer, "p_delta_scrap" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_checklist_jsonb"("data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_checklist_jsonb"("data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_checklist_jsonb"("data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_report_transition"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_report_transition"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_report_transition"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_station_reasons_jsonb"("data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_station_reasons_jsonb"("data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_station_reasons_jsonb"("data" "jsonb") TO "service_role";


















GRANT ALL ON TABLE "public"."job_item_progress" TO "anon";
GRANT ALL ON TABLE "public"."job_item_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."job_item_progress" TO "service_role";



GRANT ALL ON TABLE "public"."job_item_steps" TO "anon";
GRANT ALL ON TABLE "public"."job_item_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."job_item_steps" TO "service_role";



GRANT ALL ON TABLE "public"."job_items" TO "anon";
GRANT ALL ON TABLE "public"."job_items" TO "authenticated";
GRANT ALL ON TABLE "public"."job_items" TO "service_role";



GRANT ALL ON TABLE "public"."jobs" TO "anon";
GRANT ALL ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";



GRANT ALL ON TABLE "public"."pipeline_preset_steps" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_preset_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_preset_steps" TO "service_role";



GRANT ALL ON TABLE "public"."pipeline_presets" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_presets" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_presets" TO "service_role";



GRANT ALL ON TABLE "public"."report_reasons" TO "anon";
GRANT ALL ON TABLE "public"."report_reasons" TO "authenticated";
GRANT ALL ON TABLE "public"."report_reasons" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "anon";
GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";



GRANT ALL ON TABLE "public"."wip_consumptions" TO "anon";
GRANT ALL ON TABLE "public"."wip_consumptions" TO "authenticated";
GRANT ALL ON TABLE "public"."wip_consumptions" TO "service_role";



GRANT ALL ON TABLE "public"."session_wip_accounting" TO "anon";
GRANT ALL ON TABLE "public"."session_wip_accounting" TO "authenticated";
GRANT ALL ON TABLE "public"."session_wip_accounting" TO "service_role";



GRANT ALL ON TABLE "public"."stations" TO "anon";
GRANT ALL ON TABLE "public"."stations" TO "authenticated";
GRANT ALL ON TABLE "public"."stations" TO "service_role";



GRANT ALL ON TABLE "public"."status_definitions" TO "anon";
GRANT ALL ON TABLE "public"."status_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."status_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."v_session_current_job_item_totals" TO "anon";
GRANT ALL ON TABLE "public"."v_session_current_job_item_totals" TO "authenticated";
GRANT ALL ON TABLE "public"."v_session_current_job_item_totals" TO "service_role";



GRANT ALL ON TABLE "public"."v_session_derived_totals" TO "anon";
GRANT ALL ON TABLE "public"."v_session_derived_totals" TO "authenticated";
GRANT ALL ON TABLE "public"."v_session_derived_totals" TO "service_role";



GRANT ALL ON TABLE "public"."v_session_wip_accounting" TO "anon";
GRANT ALL ON TABLE "public"."v_session_wip_accounting" TO "authenticated";
GRANT ALL ON TABLE "public"."v_session_wip_accounting" TO "service_role";



GRANT ALL ON TABLE "public"."wip_balances" TO "anon";
GRANT ALL ON TABLE "public"."wip_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."wip_balances" TO "service_role";



GRANT ALL ON TABLE "public"."worker_stations" TO "anon";
GRANT ALL ON TABLE "public"."worker_stations" TO "authenticated";
GRANT ALL ON TABLE "public"."worker_stations" TO "service_role";



GRANT ALL ON TABLE "public"."workers" TO "anon";
GRANT ALL ON TABLE "public"."workers" TO "authenticated";
GRANT ALL ON TABLE "public"."workers" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































