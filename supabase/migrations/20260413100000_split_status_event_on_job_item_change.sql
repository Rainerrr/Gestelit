-- Migration: Split open status events on job item bind/unbind so that
-- status_events.job_item_id is constant over the entire [started_at, ended_at]
-- range. This is the single source of truth used by:
--   - lib/data/sessions.ts::getJobItemAccumulatedTime (worker per-job-item timer)
--   - lib/data/admin-dashboard.ts::computeJobItemDistribution (admin timeline)
--   - app/api/admin/dashboard/session/[id]/route.ts production period aggregation
--
-- Before this migration, bind_job_item_atomic / unbind_job_item_atomic only
-- mutated the sessions row. Any currently-open status_event kept its stale
-- job_item_id stamp, so its eventual close would credit the wrong job item
-- (or NULL) for the entire event duration, even though the worker had swapped
-- items mid-event.
--
-- Fix: when a bind/unbind changes the effective job_item_id while a status
-- event is open, close that event at NOW() and insert a continuation event
-- with identical status context (status_definition_id, station_reason_id,
-- note, image_url) but the new job_item_id. Both RPCs now return
--   { session, newStatusEvent }
-- so callers can point `currentStatusEventId` at the continuation event.

DO $migration$
BEGIN
  -- Return type changes from sessions row to JSONB, so drop the existing
  -- functions first — CREATE OR REPLACE cannot change a return type.
  DROP FUNCTION IF EXISTS public.bind_job_item_atomic(UUID, UUID, UUID, UUID);
  DROP FUNCTION IF EXISTS public.unbind_job_item_atomic(UUID);

  -- bind_job_item_atomic: split open event if job item changes
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.bind_job_item_atomic(
      p_session_id UUID,
      p_job_id UUID,
      p_job_item_id UUID,
      p_job_item_step_id UUID
    ) RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $BODY$
    DECLARE
      v_session public.sessions;
      v_job_item RECORD;
      v_step RECORD;
      v_open_event public.status_events;
      v_new_event public.status_events;
      v_now TIMESTAMPTZ := now();
      v_new_event_json JSONB := NULL;
    BEGIN
      SELECT * INTO v_session FROM public.sessions
      WHERE id = p_session_id AND status = 'active'
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_INACTIVE';
      END IF;

      SELECT id, job_id, is_active INTO v_job_item
      FROM public.job_items
      WHERE id = p_job_item_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'JOB_ITEM_NOT_FOUND';
      END IF;

      IF v_job_item.job_id != p_job_id THEN
        RAISE EXCEPTION 'JOB_ITEM_JOB_MISMATCH';
      END IF;

      IF NOT v_job_item.is_active THEN
        RAISE EXCEPTION 'JOB_ITEM_INACTIVE';
      END IF;

      SELECT id, job_item_id INTO v_step
      FROM public.job_item_steps
      WHERE id = p_job_item_step_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'JOB_ITEM_STEP_NOT_FOUND';
      END IF;

      IF v_step.job_item_id != p_job_item_id THEN
        RAISE EXCEPTION 'JOB_ITEM_STEP_MISMATCH';
      END IF;

      -- Find currently open status event, lock it
      SELECT * INTO v_open_event
      FROM public.status_events
      WHERE session_id = p_session_id AND ended_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
      FOR UPDATE;

      -- If the open event's job_item_id differs from the incoming one,
      -- split the event at v_now.
      IF FOUND AND v_open_event.job_item_id IS DISTINCT FROM p_job_item_id THEN
        UPDATE public.status_events
        SET ended_at = v_now
        WHERE id = v_open_event.id;

        INSERT INTO public.status_events (
          session_id,
          status_definition_id,
          station_reason_id,
          note,
          image_url,
          started_at,
          job_item_id,
          job_item_step_id
        ) VALUES (
          p_session_id,
          v_open_event.status_definition_id,
          v_open_event.station_reason_id,
          v_open_event.note,
          v_open_event.image_url,
          v_now,
          p_job_item_id,
          p_job_item_step_id
        ) RETURNING * INTO v_new_event;

        v_new_event_json := jsonb_build_object(
          'id', v_new_event.id,
          'session_id', v_new_event.session_id,
          'status_definition_id', v_new_event.status_definition_id,
          'started_at', v_new_event.started_at
        );
      END IF;

      UPDATE public.sessions
      SET job_id = p_job_id,
          job_item_id = p_job_item_id,
          job_item_step_id = p_job_item_step_id,
          current_job_item_started_at = v_now
      WHERE id = p_session_id
      RETURNING * INTO v_session;

      RETURN jsonb_build_object(
        'session', to_jsonb(v_session),
        'newStatusEvent', v_new_event_json
      );
    END;
    $BODY$
  $fn$;

  -- unbind_job_item_atomic: split open event if it still has a job item
  EXECUTE $fn2$
    CREATE OR REPLACE FUNCTION public.unbind_job_item_atomic(
      p_session_id UUID
    ) RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $BODY$
    DECLARE
      v_session public.sessions;
      v_open_event public.status_events;
      v_new_event public.status_events;
      v_now TIMESTAMPTZ := now();
      v_new_event_json JSONB := NULL;
    BEGIN
      SELECT * INTO v_session FROM public.sessions
      WHERE id = p_session_id AND status = 'active'
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_INACTIVE';
      END IF;

      SELECT * INTO v_open_event
      FROM public.status_events
      WHERE session_id = p_session_id AND ended_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
      FOR UPDATE;

      IF FOUND AND v_open_event.job_item_id IS NOT NULL THEN
        UPDATE public.status_events
        SET ended_at = v_now
        WHERE id = v_open_event.id;

        INSERT INTO public.status_events (
          session_id,
          status_definition_id,
          station_reason_id,
          note,
          image_url,
          started_at,
          job_item_id,
          job_item_step_id
        ) VALUES (
          p_session_id,
          v_open_event.status_definition_id,
          v_open_event.station_reason_id,
          v_open_event.note,
          v_open_event.image_url,
          v_now,
          NULL,
          NULL
        ) RETURNING * INTO v_new_event;

        v_new_event_json := jsonb_build_object(
          'id', v_new_event.id,
          'session_id', v_new_event.session_id,
          'status_definition_id', v_new_event.status_definition_id,
          'started_at', v_new_event.started_at
        );
      END IF;

      UPDATE public.sessions
      SET job_id = NULL,
          job_item_id = NULL,
          job_item_step_id = NULL,
          current_job_item_started_at = NULL
      WHERE id = p_session_id
      RETURNING * INTO v_session;

      RETURN jsonb_build_object(
        'session', to_jsonb(v_session),
        'newStatusEvent', v_new_event_json
      );
    END;
    $BODY$
  $fn2$;

  GRANT EXECUTE ON FUNCTION public.bind_job_item_atomic(UUID, UUID, UUID, UUID) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.bind_job_item_atomic(UUID, UUID, UUID, UUID) TO service_role;
  GRANT EXECUTE ON FUNCTION public.unbind_job_item_atomic(UUID) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.unbind_job_item_atomic(UUID) TO service_role;

  COMMENT ON FUNCTION public.bind_job_item_atomic IS
  'Atomically binds a job item to a session. If a status event is already open and its job_item_id differs from the new one, closes it at NOW() and inserts a continuation event (same status context) with the new job_item_id, so status_events.job_item_id is constant over each event''s full duration. Returns { session, newStatusEvent }.';

  COMMENT ON FUNCTION public.unbind_job_item_atomic IS
  'Atomically clears a session''s job item binding. If a status event is already open with a non-null job_item_id, closes it at NOW() and inserts a continuation event with job_item_id=NULL. Returns { session, newStatusEvent }.';
END $migration$;
