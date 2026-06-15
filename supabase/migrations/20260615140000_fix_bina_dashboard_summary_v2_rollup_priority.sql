-- A single empty/skipped source should not make the whole cockpit look empty
-- when other source domains have populated partial data. Keep empty_sources in
-- the trust object and warning list, but roll up as partial_sample first.

CREATE OR REPLACE FUNCTION public.rpc_bina_dashboard_summary_v2(filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH trust AS (
  SELECT
    COUNT(*)::integer AS source_count,
    COUNT(*) FILTER (WHERE coverage_status = 'complete')::integer AS complete_sources,
    COUNT(*) FILTER (WHERE coverage_status LIKE '%partial%')::integer AS partial_sources,
    COUNT(*) FILTER (WHERE freshness_status = 'stale')::integer AS stale_sources,
    COUNT(*) FILTER (WHERE freshness_status = 'blocked')::integer AS blocked_sources,
    COUNT(*) FILTER (WHERE freshness_status = 'empty')::integer AS empty_sources,
    MAX(last_table_sync_at) AS last_synced_at,
    COALESCE(bool_and(is_executive_truth), false) AS executive_ready
  FROM public.mart_bina_metric_trust
),
domains AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY domain), '[]'::jsonb) AS rows
  FROM (
    SELECT
      domain,
      COUNT(*)::integer AS source_count,
      COUNT(*) FILTER (WHERE coverage_status = 'complete')::integer AS complete_sources,
      COUNT(*) FILTER (WHERE coverage_status LIKE '%partial%')::integer AS partial_sources,
      COUNT(*) FILTER (WHERE freshness_status IN ('stale','blocked','empty'))::integer AS unhealthy_sources,
      MAX(last_table_sync_at) AS last_synced_at
    FROM public.mart_bina_metric_trust
    GROUP BY domain
  ) row
),
warnings AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY severity DESC, source_table), '[]'::jsonb) AS rows
  FROM (
    SELECT
      source_table,
      domain,
      CASE
        WHEN freshness_status = 'blocked' THEN 'high'
        WHEN freshness_status IN ('stale','empty') THEN 'medium'
        ELSE 'low'
      END AS severity,
      coverage_status,
      freshness_status,
      trust_note,
      last_table_sync_at
    FROM public.mart_bina_metric_trust
    WHERE coverage_status <> 'complete'
       OR freshness_status <> 'ok'
       OR known_gap IS NOT NULL
    LIMIT 30
  ) row
)
SELECT jsonb_build_object(
  'trust', to_jsonb(trust),
  'coverageStatus', CASE
    WHEN trust.blocked_sources > 0 THEN 'blocked_partial_sample'
    WHEN trust.partial_sources > 0 THEN 'partial_sample'
    WHEN trust.empty_sources > 0 THEN 'empty'
    WHEN trust.stale_sources > 0 THEN 'stale'
    ELSE 'complete'
  END,
  'domains', domains.rows,
  'warnings', warnings.rows,
  'metricTrust', (
    SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY domain, source_table), '[]'::jsonb)
    FROM (
      SELECT *
      FROM public.mart_bina_metric_trust
      ORDER BY domain, source_table
      LIMIT 100
    ) row
  )
)
FROM trust, domains, warnings;
$$;
