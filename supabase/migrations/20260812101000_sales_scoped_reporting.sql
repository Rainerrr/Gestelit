-- Backward-compatible enriched activity view with canonical ownership and
-- current-data coverage fields for UI filters and exports.
ALTER TABLE public.sales_activity_logs
  ADD COLUMN IF NOT EXISTS last_edited_by_sales_user_id uuid
    REFERENCES public.sales_users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.audit_sales_activity_log_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_source text := 'unavailable';
  v_changed_fields text[];
BEGIN
  SELECT COALESCE(array_agg(new_values.key ORDER BY new_values.key), '{}'::text[])
  INTO v_changed_fields
  FROM jsonb_each(to_jsonb(NEW)) new_values
  WHERE new_values.key NOT IN ('updated_at', 'last_edited_by_sales_user_id')
    AND new_values.value IS DISTINCT FROM (to_jsonb(OLD) -> new_values.key);

  IF cardinality(v_changed_fields) = 0 THEN
    RETURN NEW;
  END IF;

  v_actor_id := NEW.last_edited_by_sales_user_id;
  IF v_actor_id IS NOT NULL THEN
    v_actor_source := 'row.last_edited_by_sales_user_id';
  END IF;

  INSERT INTO public.sales_activity_log_audit (
    sales_activity_id,
    activity_owner_sales_user_id,
    actor_sales_user_id,
    actor_source,
    database_role,
    changed_fields,
    old_record,
    new_record
  ) VALUES (
    NEW.id,
    NEW.sales_user_id,
    v_actor_id,
    v_actor_source,
    current_user,
    v_changed_fields,
    to_jsonb(OLD),
    to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE VIEW public.mart_sales_activity_scoped AS
SELECT
  h.activity_id AS id,
  h.activity_sales_user_id AS sales_user_id,
  h.event_type,
  h.event_at,
  h.activity_salesperson AS salesperson,
  h.customer_name,
  h.customer_code,
  h.local_client_id,
  h.contact_person,
  h.raw_note,
  h.ai_summary,
  h.ai_next_action,
  h.next_action_date,
  h.estimated_revenue,
  h.actual_revenue,
  h.currency,
  h.status,
  h.source,
  h.contact_occurred,
  h.is_human_touch,
  h.touch_confidence,
  l.portal_submitted_at,
  l.linked_bina_invoice_no,
  l.linked_bina_order_no,
  l.linked_bina_delivery_no,
  l.ai_confidence,
  l.metadata,
  p.customer_group,
  p.area,
  h.client_ref AS client_key,
  h.client_ref,
  h.account_manager_sales_user_id,
  h.account_manager,
  h.ownership_source,
  h.ownership_confidence,
  p.dormancy_bucket,
  h.coverage_scope,
  h.is_complete_contact_history,
  h.created_at,
  h.updated_at
FROM public.mart_sales_client_touch_history h
JOIN public.sales_activity_logs l ON l.id = h.activity_id
LEFT JOIN public.mart_sales_client_profile p ON p.client_ref = h.client_ref;

-- Preserve the legacy suggestion contract while correcting the meaning of
-- `salesperson`: it is now the canonical account manager, never the last actor.
CREATE OR REPLACE VIEW public.mart_sales_client_activity_scoped AS
WITH activity_money AS (
  SELECT
    client_ref,
    COALESCE(SUM(estimated_revenue) FILTER (WHERE status IN ('new', 'open', 'follow_up')), 0)::numeric AS estimated_pipeline,
    COALESCE(SUM(actual_revenue) FILTER (WHERE status = 'won'), 0)::numeric AS won_revenue
  FROM public.mart_sales_client_touch_history
  GROUP BY client_ref
),
invoice_money AS (
  SELECT
    p.client_ref,
    COALESCE(SUM(s.total_amount), 0)::numeric AS invoice_revenue
  FROM public.mart_sales_client_profile p
  JOIN public.mart_bina_sales_status s
    ON (p.customer_code IS NOT NULL AND s.customer_code = p.customer_code)
    OR (
      p.customer_code IS NULL
      AND s.customer_code IS NULL
      AND lower(trim(s.customer_name)) = lower(trim(p.customer_name))
    )
  GROUP BY p.client_ref
)
SELECT
  p.customer_code,
  p.customer_name,
  p.current_invoice_row_count::integer AS invoice_count,
  COALESCE(i.invoice_revenue, 0)::numeric AS invoice_revenue,
  p.last_invoice_at,
  p.activity_count::integer AS activity_count,
  COALESCE(a.estimated_pipeline, 0)::numeric AS estimated_pipeline,
  p.last_activity_at,
  p.account_manager AS salesperson,
  p.customer_group,
  p.customer_status,
  p.bookkeeping_no,
  p.opened_at,
  COALESCE(p.directory_source, CASE WHEN p.activity_count > 0 THEN 'manual_activity' ELSE 'bina' END) AS name_source,
  (
    COALESCE(i.invoice_revenue, 0)
    + COALESCE(a.estimated_pipeline, 0)
    + COALESCE(a.won_revenue, 0)
    + (p.activity_count::numeric * 1000)
    + (p.current_invoice_row_count::numeric * 250)
  ) AS combined_score,
  p.local_client_id,
  p.contact_person
FROM public.mart_sales_client_profile p
LEFT JOIN activity_money a ON a.client_ref = p.client_ref
LEFT JOIN invoice_money i ON i.client_ref = p.client_ref;

CREATE OR REPLACE FUNCTION public.get_sales_dashboard_summary(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_activity_sales_user_id uuid DEFAULT NULL,
  p_activity_salesperson text DEFAULT NULL,
  p_account_manager text DEFAULT NULL,
  p_client_search text DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_customer_group text DEFAULT NULL,
  p_area text DEFAULT NULL,
  p_dormancy_bucket text DEFAULT NULL,
  p_coverage text DEFAULT NULL
)
RETURNS TABLE (
  currency_code text,
  activity_count bigint,
  unique_client_count bigint,
  open_count bigint,
  won_count bigint,
  lost_count bigint,
  meeting_count bigint,
  call_count bigint,
  lead_count bigint,
  sale_count bigint,
  follow_up_count bigint,
  open_follow_up_count bigint,
  overdue_follow_up_count bigint,
  estimated_pipeline numeric,
  won_revenue numeric,
  coverage_scope text,
  is_complete_contact_history boolean,
  freshness_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(a.currency, ''), 'ILS') AS currency_code,
    COUNT(*)::bigint,
    COUNT(DISTINCT a.client_ref)::bigint,
    COUNT(*) FILTER (WHERE a.status IN ('new', 'open', 'follow_up'))::bigint,
    COUNT(*) FILTER (WHERE a.status = 'won')::bigint,
    COUNT(*) FILTER (WHERE a.status = 'lost')::bigint,
    COUNT(*) FILTER (WHERE a.event_type = 'meeting')::bigint,
    COUNT(*) FILTER (WHERE a.event_type = 'call')::bigint,
    COUNT(*) FILTER (WHERE a.event_type = 'lead')::bigint,
    COUNT(*) FILTER (WHERE a.event_type = 'sale')::bigint,
    COUNT(*) FILTER (WHERE a.event_type = 'follow_up')::bigint,
    COUNT(*) FILTER (WHERE a.status = 'follow_up')::bigint,
    COUNT(*) FILTER (
      WHERE a.status = 'follow_up'
        AND a.next_action_date < (now() AT TIME ZONE 'Asia/Jerusalem')::date
    )::bigint,
    COALESCE(SUM(a.estimated_revenue) FILTER (
      WHERE a.status IN ('new', 'open', 'follow_up')
    ), 0)::numeric,
    COALESCE(SUM(a.actual_revenue) FILTER (WHERE a.status = 'won'), 0)::numeric,
    'gestelit_only'::text,
    false,
    MAX(a.updated_at)
  FROM public.mart_sales_activity_scoped a
  WHERE a.event_at >= COALESCE(p_from, '-infinity'::timestamptz)
    AND a.event_at <= COALESCE(p_to, 'infinity'::timestamptz)
    AND (p_activity_sales_user_id IS NULL OR a.sales_user_id = p_activity_sales_user_id)
    AND (p_activity_salesperson IS NULL OR a.salesperson ILIKE '%' || p_activity_salesperson || '%')
    AND (p_account_manager IS NULL OR a.account_manager ILIKE '%' || p_account_manager || '%')
    AND (
      p_client_search IS NULL
      OR a.customer_name ILIKE '%' || p_client_search || '%'
      OR a.customer_code::text = trim(p_client_search)
    )
    AND (p_event_type IS NULL OR a.event_type = p_event_type)
    AND (p_status IS NULL OR a.status = p_status)
    AND (p_customer_group IS NULL OR a.customer_group = p_customer_group)
    AND (p_area IS NULL OR a.area = p_area)
    AND (p_dormancy_bucket IS NULL OR a.dormancy_bucket = p_dormancy_bucket)
    AND (p_coverage IS NULL OR a.coverage_scope = p_coverage)
  GROUP BY COALESCE(NULLIF(a.currency, ''), 'ILS')
  ORDER BY currency_code;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_user_clients(
  p_sales_user_id uuid,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 12
)
RETURNS TABLE (
  local_client_id uuid,
  customer_code integer,
  customer_name text,
  contact_person text,
  activity_count bigint,
  estimated_pipeline numeric,
  actual_revenue numeric,
  last_activity_at timestamptz,
  owner_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (ARRAY_AGG(h.local_client_id ORDER BY h.event_at DESC)
      FILTER (WHERE h.local_client_id IS NOT NULL))[1],
    MAX(h.customer_code) FILTER (WHERE h.customer_code IS NOT NULL),
    (ARRAY_AGG(h.customer_name ORDER BY h.event_at DESC))[1],
    (ARRAY_AGG(h.contact_person ORDER BY h.event_at DESC)
      FILTER (WHERE NULLIF(trim(h.contact_person), '') IS NOT NULL))[1],
    COUNT(*)::bigint,
    COALESCE(SUM(h.estimated_revenue) FILTER (WHERE h.status IN ('new', 'open', 'follow_up')), 0)::numeric,
    COALESCE(SUM(h.actual_revenue) FILTER (WHERE h.status = 'won'), 0)::numeric,
    MAX(h.event_at),
    MAX(h.account_manager)
  FROM public.mart_sales_client_touch_history h
  WHERE h.activity_sales_user_id = p_sales_user_id
    AND (
      NULLIF(trim(p_search), '') IS NULL
      OR h.customer_name ILIKE '%' || trim(p_search) || '%'
      OR h.customer_code::text = trim(p_search)
    )
  GROUP BY h.client_ref
  ORDER BY MAX(h.event_at) DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 12), 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.search_sales_client_activity_scoped(
  p_search text,
  p_limit integer DEFAULT 12
)
RETURNS SETOF public.mart_sales_client_activity_scoped
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT activity.*
  FROM public.mart_sales_client_activity_scoped activity
  WHERE
    activity.customer_name NOT LIKE '%??%'
    AND (
      NULLIF(trim(p_search), '') IS NULL
      OR activity.customer_name ILIKE ('%' || trim(p_search) || '%')
      OR extensions.similarity(lower(activity.customer_name), lower(trim(p_search))) >= 0.18
    )
  ORDER BY
    CASE
      WHEN lower(activity.customer_name) = lower(trim(p_search)) THEN 0
      WHEN activity.customer_name ILIKE (trim(p_search) || '%') THEN 1
      WHEN activity.customer_name ILIKE ('%' || trim(p_search) || '%') THEN 2
      ELSE 3
    END,
    extensions.similarity(lower(activity.customer_name), lower(trim(p_search))) DESC,
    activity.combined_score DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 12), 1), 30);
$$;

REVOKE ALL ON FUNCTION public.get_sales_dashboard_summary(
  timestamptz, timestamptz, uuid, text, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_sales_user_clients(uuid, text, integer)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_sales_client_activity_scoped(text, integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_dashboard_summary(
  timestamptz, timestamptz, uuid, text, text, text, text, text, text, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_sales_user_clients(uuid, text, integer)
TO service_role;
GRANT EXECUTE ON FUNCTION public.search_sales_client_activity_scoped(text, integer)
TO service_role;

GRANT SELECT ON public.mart_sales_activity_scoped TO service_role;
GRANT SELECT ON public.mart_sales_client_activity_scoped TO service_role;

COMMENT ON FUNCTION public.get_sales_dashboard_summary(
  timestamptz, timestamptz, uuid, text, text, text, text, text, text, text, text, text
) IS 'Exact, currency-separated Gestelit sales activity KPIs with server-side operational filters.';

COMMENT ON VIEW public.mart_sales_activity_scoped IS
  'Activity-grain reporting view with canonical ownership and explicit Gestelit-only coverage metadata.';
COMMENT ON VIEW public.mart_sales_client_activity_scoped IS
  'Client suggestion view whose salesperson field is the canonical account manager rather than the last activity actor.';
