-- BINA sync observability, source contracts, metric trust, and relationship scaffolding.
-- Additive: existing raw bina_* JSONB tables and old bina_sync_log stay intact.

CREATE TABLE IF NOT EXISTS public.bina_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_synced_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial_error', 'error')),
  sync_mode text NOT NULL DEFAULT 'recent_window',
  extractor_version text,
  max_recent_orders integer,
  start_at_table text,
  table_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  upserted_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bina_sync_table_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.bina_sync_runs(id) ON DELETE CASCADE,
  source_table text NOT NULL,
  storage_table text NOT NULL,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'skipped', 'error')),
  sent_count integer NOT NULL DEFAULT 0,
  upserted_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  source_min_key text,
  source_max_key text,
  source_min_date timestamptz,
  source_max_date timestamptz,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bina_sync_runs_received_at ON public.bina_sync_runs(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_bina_sync_runs_status ON public.bina_sync_runs(status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_bina_sync_table_runs_source ON public.bina_sync_table_runs(source_table, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bina_sync_table_runs_run ON public.bina_sync_table_runs(run_id);

CREATE TABLE IF NOT EXISTS public.bina_source_contracts (
  source_table text PRIMARY KEY,
  storage_table text NOT NULL,
  domain text NOT NULL,
  grain text NOT NULL,
  key_columns text[] NOT NULL DEFAULT ARRAY['bina_id'],
  date_columns text[] NOT NULL DEFAULT ARRAY[]::text[],
  supports_full_snapshot boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  known_gap text,
  owner_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.bina_source_contracts (
  source_table,
  storage_table,
  domain,
  grain,
  key_columns,
  date_columns,
  supports_full_snapshot,
  known_gap,
  owner_note
) VALUES
  ('DFHazmRashi', 'bina_dfhazmrashi', 'production', 'work_order_header', ARRAY['MisparDFHazmana'], ARRAY['TarikRishum','ShatAspaka'], false, 'recent-window sync until full source counts are captured', 'BINA work order headers'),
  ('DFHazmMontage', 'bina_dfhazmmontage', 'production', 'work_order_operation', ARRAY['MisparRashi','MisparAvoda'], ARRAY[]::text[], false, 'no declared PK in BINA metadata; natural composite key inferred', 'Montage/imposition operation rows'),
  ('DFHazmNigrar', 'bina_dfhazmnigrar', 'production', 'work_order_operation', ARRAY['RecordId'], ARRAY[]::text[], false, null, 'Nigrar operation rows'),
  ('DFHazmGimur', 'bina_dfhazmgimur', 'production', 'work_order_operation', ARRAY['MisparRashi','MisparAvoda'], ARRAY[]::text[], false, 'no declared PK in BINA metadata; natural composite key inferred', 'Finishing operation rows'),
  ('DFHazmGrafika', 'bina_dfhazmgrafika', 'production', 'work_order_operation', ARRAY['MisparRashi','MisparAvoda'], ARRAY[]::text[], false, 'no declared PK in BINA metadata; natural composite key inferred', 'Graphics operation rows'),
  ('DFHazmKirkia', 'bina_dfhazmkirkia', 'production', 'work_order_operation', ARRAY['MisparRashi','MisparAvoda'], ARRAY[]::text[], false, 'name transliteration can appear as Ktiva/Kirkia in user exports', 'Prepress/writing operation rows'),
  ('DFHazmKedam', 'bina_dfhazmkedam', 'production', 'work_order_operation', ARRAY['MisparRashi','MisparAvoda'], ARRAY[]::text[], false, 'no declared PK in BINA metadata; natural composite key inferred', 'Pre-stage operation rows'),
  ('DFHazmGlyonot', 'bina_dfhazmglyonot', 'production', 'work_order_sheet', ARRAY['MisparRashi','MisparAvoda'], ARRAY[]::text[], false, 'large table; should be resumed carefully on old BINA PC', 'Sheet rows'),
  ('DFShelita', 'bina_dfshelita', 'production', 'production_control_row', ARRAY['RecordId'], ARRAY['TarikStart','TarikEnd','TarikAspaka'], false, null, 'Production control/scheduling rows'),
  ('BakashaNigrar', 'bina_bakashanigrar', 'purchasing', 'purchase_request_line', ARRAY['RecordID'], ARRAY[]::text[], false, null, 'Purchase request lines'),
  ('TovinRashi', 'bina_tovinrashi', 'purchasing', 'goods_receipt_header', ARRAY['MisparTovin'], ARRAY['TarikTovin','TarikAspaka'], false, null, 'Goods receipt headers'),
  ('TovinNigrar', 'bina_tovinnigrar', 'purchasing', 'goods_receipt_line', ARRAY['RecordID'], ARRAY[]::text[], false, null, 'Goods receipt lines'),
  ('DFMlay', 'bina_dfmlay', 'inventory', 'inventory_item', ARRAY['bina_id'], ARRAY[]::text[], false, null, 'Inventory master/current stock data'),
  ('TnuotMlay', 'bina_tnuotmlay', 'inventory', 'inventory_movement', ARRAY['MisparTnua'], ARRAY[]::text[], false, 'currently skipped by script because key column is missing/incompatible', 'Do not use for material truth until key is fixed'),
  ('HeshSapakRashi', 'bina_heshsapakrashi', 'finance', 'supplier_invoice_header', ARRAY['MisparHeshSapak','ShnatAvoda'], ARRAY['Tarik','TarikPiraon'], false, null, 'Supplier invoice headers'),
  ('HeshSapakNigrar', 'bina_heshsapaknigrar', 'finance', 'supplier_invoice_line', ARRAY['RecordID'], ARRAY[]::text[], false, null, 'Supplier invoice lines'),
  ('TMSapakNigrar', 'bina_tmsapaknigrar', 'suppliers', 'supplier_commitment_line', ARRAY['RecordID'], ARRAY[]::text[], false, null, 'Supplier/subcontractor rows'),
  ('Hovot', 'bina_hovot', 'finance', 'debt_row', ARRAY['bina_id'], ARRAY['TarikRishum','TarikPiraon'], false, null, 'Open debts/balances'),
  ('HeshbonitRashi', 'bina_heshbonitrashi', 'sales_finance', 'customer_invoice_header', ARRAY['MisparHeshbonit','ShnatAvoda'], ARRAY['TarikHeshbonit','TarikPiraon'], false, 'customer open balance is inferred unless exact payment state exists', 'Customer invoice headers'),
  ('HeshbonitNigrar', 'bina_heshbonitnigrar', 'sales_finance', 'customer_invoice_line', ARRAY['RecordID'], ARRAY[]::text[], false, null, 'Customer invoice lines'),
  ('MishloahRashi', 'bina_mishloahrashi', 'deliveries', 'delivery_header', ARRAY['MisparMishloah','ShnatAvoda'], ARRAY['TarikMishloah','ShatMishloah','NishlahBeTarik'], false, null, 'Delivery headers'),
  ('MishloahNigrar', 'bina_mishloahnigrar', 'deliveries', 'delivery_line', ARRAY['RecordID'], ARRAY[]::text[], false, null, 'Delivery lines'),
  ('Mismahim', 'bina_mismahim', 'documents', 'document', ARRAY['RecordId'], ARRAY['Tarik'], false, null, 'BINA document index'),
  ('SqlLogins', 'bina_sqllogins', 'ops', 'login_event', ARRAY['recordid'], ARRAY['SLoginTime'], false, 'not currently exposed to AI except sync/diagnostics', 'SQL login audit data')
ON CONFLICT (source_table) DO UPDATE SET
  storage_table = EXCLUDED.storage_table,
  domain = EXCLUDED.domain,
  grain = EXCLUDED.grain,
  key_columns = EXCLUDED.key_columns,
  date_columns = EXCLUDED.date_columns,
  supports_full_snapshot = EXCLUDED.supports_full_snapshot,
  known_gap = EXCLUDED.known_gap,
  owner_note = EXCLUDED.owner_note,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.bina_entity_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_type text NOT NULL,
  source_entity_id text NOT NULL,
  target_entity_type text NOT NULL,
  target_entity_id text NOT NULL,
  relationship_type text NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('exact', 'inferred', 'missing_data')),
  join_keys jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_bina_entity_relationships_source
  ON public.bina_entity_relationships(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_bina_entity_relationships_target
  ON public.bina_entity_relationships(target_entity_type, target_entity_id);

CREATE OR REPLACE VIEW public.mart_bina_latest_table_runs AS
SELECT DISTINCT ON (source_table)
  source_table,
  storage_table,
  status,
  sent_count,
  upserted_count,
  failed_count,
  source_min_key,
  source_max_key,
  source_min_date,
  source_max_date,
  error,
  metadata,
  created_at AS last_table_sync_at,
  run_id
FROM public.bina_sync_table_runs
ORDER BY source_table, created_at DESC;

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
    WHEN r.last_table_sync_at < now() - interval '6 hours' THEN 'stale'
    ELSE 'ok'
  END AS freshness_status,
  CASE
    WHEN c.supports_full_snapshot THEN 'complete'
    WHEN r.last_table_sync_at IS NULL THEN 'empty'
    WHEN r.status = 'error' THEN 'blocked_partial_sample'
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

CREATE OR REPLACE VIEW public.mart_bina_entity_relationship_candidates AS
SELECT
  ('work_order:' || wo.work_order_id)::text AS relationship_id,
  'bina_work_order'::text AS source_entity_type,
  wo.work_order_id::text AS source_entity_id,
  'gestelit_job'::text AS target_entity_type,
  wo.gestelit_job_id::text AS target_entity_id,
  'work_order_to_job'::text AS relationship_type,
  CASE WHEN wo.gestelit_job_id IS NULL THEN 'missing_data' ELSE 'exact' END AS confidence,
  jsonb_build_object('work_order_id', wo.work_order_id, 'job_number', wo.gestelit_job_number) AS join_keys,
  jsonb_build_object('source_view', 'mart_bina_work_order_status', 'link_status', wo.link_status, 'synced_at', wo.synced_at) AS evidence,
  wo.synced_at AS last_verified_at
FROM public.mart_bina_work_order_status wo
WHERE wo.work_order_id IS NOT NULL
UNION ALL
SELECT
  ('work_order_purchase:' || p.work_order_id || ':' || p.bina_id)::text,
  'bina_work_order',
  p.work_order_id::text,
  'bina_purchase_flow',
  p.bina_id,
  'work_order_to_purchase',
  'inferred',
  jsonb_build_object('work_order_id', p.work_order_id, 'document_no', p.document_no),
  jsonb_build_object('source_view', 'mart_bina_purchase_flow', 'flow_type', p.flow_type, 'synced_at', p.synced_at),
  p.synced_at
FROM public.mart_bina_purchase_flow p
WHERE p.work_order_id IS NOT NULL
UNION ALL
SELECT
  ('work_order_delivery:' || d.work_order_id || ':' || d.bina_id)::text,
  'bina_work_order',
  d.work_order_id::text,
  'bina_delivery',
  d.bina_id,
  'work_order_to_delivery',
  'inferred',
  jsonb_build_object('work_order_id', d.work_order_id, 'delivery_no', d.delivery_no),
  jsonb_build_object('source_view', 'mart_bina_delivery_status', 'delivery_state', d.delivery_state, 'synced_at', d.synced_at),
  d.synced_at
FROM public.mart_bina_delivery_status d
WHERE d.work_order_id IS NOT NULL;

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
    bool_and(is_executive_truth) AS executive_ready
  FROM public.mart_bina_metric_trust
),
domains AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY domain), '[]'::jsonb) AS rows
  FROM (
    SELECT
      domain,
      COUNT(*)::integer AS source_count,
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

ALTER TABLE public.bina_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bina_sync_table_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bina_source_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bina_entity_relationships ENABLE ROW LEVEL SECURITY;
