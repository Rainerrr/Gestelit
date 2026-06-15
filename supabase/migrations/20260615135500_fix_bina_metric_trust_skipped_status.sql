-- Treat skipped/zero-row source tables as empty even when the observability
-- record itself is fresh.

CREATE OR REPLACE VIEW public.mart_bina_metric_trust AS
SELECT
  c.source_table,
  c.storage_table,
  c.domain,
  c.grain,
  c.key_columns,
  c.date_columns,
  c.supports_full_snapshot,
  c.known_gap,
  r.status AS latest_status,
  r.sent_count,
  r.upserted_count,
  r.failed_count,
  r.source_min_key,
  r.source_max_key,
  r.source_min_date,
  r.source_max_date,
  r.last_table_sync_at,
  EXTRACT(EPOCH FROM (now() - r.last_table_sync_at))::integer AS age_seconds,
  CASE
    WHEN r.last_table_sync_at IS NULL THEN 'empty'
    WHEN r.status = 'error' THEN 'blocked'
    WHEN r.status = 'skipped' AND COALESCE(r.sent_count, 0) = 0 THEN 'empty'
    WHEN r.last_table_sync_at < now() - interval '6 hours' THEN 'stale'
    ELSE 'ok'
  END AS freshness_status,
  CASE
    WHEN c.supports_full_snapshot THEN 'complete'
    WHEN r.last_table_sync_at IS NULL THEN 'empty'
    WHEN r.status = 'error' THEN 'blocked_partial_sample'
    WHEN r.status = 'skipped' AND COALESCE(r.sent_count, 0) = 0 THEN 'empty'
    ELSE 'partial_sample'
  END AS coverage_status,
  CASE
    WHEN c.supports_full_snapshot THEN 'full_snapshot'
    ELSE 'recent_window'
  END AS sync_scope,
  false AS is_executive_truth,
  CASE
    WHEN c.known_gap IS NOT NULL THEN c.known_gap
    WHEN c.supports_full_snapshot THEN 'Full snapshot supported by source contract.'
    ELSE 'Recent-window sync only; use as operational signal, not executive total.'
  END AS trust_note
FROM public.bina_source_contracts c
LEFT JOIN public.mart_bina_latest_table_runs r ON r.source_table = c.source_table
WHERE c.is_enabled = true;
