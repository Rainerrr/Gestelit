-- Close security and reporting gaps found during the production-readiness audit.

CREATE TABLE IF NOT EXISTS public.sales_login_rate_limits (
  key_hash text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_login_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages sales login rate limits"
  ON public.sales_login_rate_limits;
CREATE POLICY "Service role manages sales login rate limits"
  ON public.sales_login_rate_limits
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.consume_sales_login_rate_limit(
  p_key_hash text,
  p_action text,
  p_limit integer DEFAULT 8,
  p_window_seconds integer DEFAULT 900,
  p_block_seconds integer DEFAULT 900
)
RETURNS TABLE (allowed boolean, remaining integer, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.sales_login_rate_limits%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 8), 100));
  v_window interval := make_interval(secs => GREATEST(30, COALESCE(p_window_seconds, 900)));
  v_block interval := make_interval(secs => GREATEST(30, COALESCE(p_block_seconds, 900)));
BEGIN
  IF p_key_hash IS NULL OR length(p_key_hash) < 32 OR p_action NOT IN ('check', 'failure', 'success') THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_INPUT';
  END IF;

  IF p_action = 'success' THEN
    DELETE FROM public.sales_login_rate_limits WHERE key_hash = p_key_hash;
    RETURN QUERY SELECT true, v_limit, 0;
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.sales_login_rate_limits
  WHERE key_hash = p_key_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_action = 'failure' THEN
      INSERT INTO public.sales_login_rate_limits (key_hash, attempt_count)
      VALUES (p_key_hash, 1);
      RETURN QUERY SELECT true, GREATEST(0, v_limit - 1), 0;
    ELSE
      RETURN QUERY SELECT true, v_limit, 0;
    END IF;
    RETURN;
  END IF;

  IF v_row.blocked_until IS NOT NULL AND v_row.blocked_until > v_now THEN
    RETURN QUERY SELECT false, 0, GREATEST(1, CEIL(EXTRACT(EPOCH FROM v_row.blocked_until - v_now))::integer);
    RETURN;
  END IF;

  IF v_row.window_started_at + v_window <= v_now THEN
    v_row.window_started_at := v_now;
    v_row.attempt_count := 0;
    v_row.blocked_until := NULL;
  END IF;

  IF p_action = 'failure' THEN
    v_row.attempt_count := v_row.attempt_count + 1;
    IF v_row.attempt_count >= v_limit THEN
      v_row.blocked_until := v_now + v_block;
    END IF;
    UPDATE public.sales_login_rate_limits
    SET window_started_at = v_row.window_started_at,
        attempt_count = v_row.attempt_count,
        blocked_until = v_row.blocked_until,
        updated_at = v_now
    WHERE key_hash = p_key_hash;
  END IF;

  IF v_row.blocked_until IS NOT NULL AND v_row.blocked_until > v_now THEN
    RETURN QUERY SELECT false, 0, GREATEST(1, CEIL(EXTRACT(EPOCH FROM v_row.blocked_until - v_now))::integer);
  ELSE
    RETURN QUERY SELECT true, GREATEST(0, v_limit - v_row.attempt_count), 0;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_sales_login_rate_limit(text, text, integer, integer, integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_sales_login_rate_limit(text, text, integer, integer, integer)
TO service_role;

CREATE OR REPLACE FUNCTION public.get_filtered_bina_sales_total(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_salesperson text DEFAULT NULL,
  p_client_search text DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(s.total_amount), 0)::numeric
  FROM public.mart_bina_sales_status s
  WHERE s.invoice_at >= COALESCE(p_from, '-infinity'::timestamptz)
    AND s.invoice_at <= COALESCE(p_to, 'infinity'::timestamptz)
    AND (NULLIF(trim(p_salesperson), '') IS NULL OR s.salesperson ILIKE '%' || trim(p_salesperson) || '%')
    AND (
      NULLIF(trim(p_client_search), '') IS NULL
      OR s.customer_name ILIKE '%' || trim(p_client_search) || '%'
      OR s.customer_code::text = trim(p_client_search)
    );
$$;

REVOKE ALL ON FUNCTION public.get_filtered_bina_sales_total(timestamptz, timestamptz, text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_filtered_bina_sales_total(timestamptz, timestamptz, text, text)
TO service_role;

CREATE OR REPLACE FUNCTION public.get_sales_dashboard_filter_options()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'salespeople', COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT salesperson AS value FROM public.sales_activity_logs WHERE NULLIF(trim(salesperson), '') IS NOT NULL) v), '[]'::jsonb),
    'accountManagers', COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT account_manager AS value FROM public.mart_sales_client_profile WHERE NULLIF(trim(account_manager), '') IS NOT NULL) v), '[]'::jsonb),
    'customerGroups', COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT customer_group AS value FROM public.mart_sales_client_profile WHERE NULLIF(trim(customer_group), '') IS NOT NULL) v), '[]'::jsonb),
    'areas', COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT area AS value FROM public.mart_sales_client_profile WHERE NULLIF(trim(area), '') IS NOT NULL) v), '[]'::jsonb),
    'gestelitCoverageStartAt', (SELECT MIN(event_at) FROM public.sales_activity_logs)
  );
$$;

REVOKE ALL ON FUNCTION public.get_sales_dashboard_filter_options()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_dashboard_filter_options()
TO service_role;

CREATE OR REPLACE VIEW public.mart_sales_ambiguous_client_names AS
SELECT
  lower(trim(customer_name)) AS normalized_name,
  COUNT(*)::bigint AS matching_clients,
  ARRAY_AGG(client_ref ORDER BY client_ref) AS client_refs,
  ARRAY_AGG(customer_name ORDER BY customer_name) AS customer_names
FROM public.mart_sales_client_directory
WHERE NULLIF(trim(customer_name), '') IS NOT NULL
GROUP BY lower(trim(customer_name))
HAVING COUNT(*) > 1;

REVOKE ALL ON public.sales_login_rate_limits, public.mart_sales_ambiguous_client_names
FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sales_login_rate_limits TO service_role;
GRANT SELECT ON public.mart_sales_ambiguous_client_names TO service_role;
