-- Preserve profile columns and ownership semantics; remove per-invoice directory scans.
CREATE OR REPLACE VIEW public.mart_sales_client_profile AS
WITH directory_rows AS (
  SELECT
    COALESCE(
      CASE WHEN d.customer_code IS NOT NULL THEN 'bina:' || d.customer_code::text END,
      CASE WHEN d.local_client_id IS NOT NULL THEN 'local:' || d.local_client_id::text END,
      d.client_ref
    ) AS canonical_client_ref,
    d.*,
    lower(trim(d.customer_name)) AS normalized_name,
    CASE WHEN d.source = 'bina_index' THEN 0 ELSE 1 END AS source_priority
  FROM public.mart_sales_client_directory d
),
directory AS (
  SELECT DISTINCT ON (canonical_client_ref)
    canonical_client_ref AS client_ref,
    local_client_id,
    customer_code,
    customer_name,
    customer_group,
    status AS customer_status,
    area,
    bookkeeping_no,
    tax_id,
    contact_person,
    phone,
    mobile,
    email,
    salesperson AS directory_salesperson,
    opened_at,
    source AS directory_source,
    updated_at AS directory_updated_at,
    normalized_name
  FROM directory_rows
  ORDER BY canonical_client_ref, source_priority, updated_at DESC NULLS LAST
),
activity_resolved AS (
  SELECT
    l.*,
    COALESCE(
      matched.client_ref,
      CASE WHEN l.customer_code IS NOT NULL THEN 'bina:' || l.customer_code::text END,
      CASE WHEN l.local_client_id IS NOT NULL THEN 'local:' || l.local_client_id::text END,
      'name:' || lower(trim(l.customer_name))
    ) AS client_ref
  FROM public.sales_activity_logs l
  LEFT JOIN LATERAL (
    SELECT d.client_ref
    FROM directory d
    WHERE (l.customer_code IS NOT NULL AND d.customer_code = l.customer_code)
       OR (l.local_client_id IS NOT NULL AND d.local_client_id = l.local_client_id)
       OR (
         l.customer_code IS NULL
         AND l.local_client_id IS NULL
         AND d.normalized_name = lower(trim(l.customer_name))
         AND 1 = (
           SELECT COUNT(*)
           FROM directory candidates
           WHERE candidates.normalized_name = lower(trim(l.customer_name))
         )
       )
    ORDER BY
      (d.customer_code = l.customer_code) DESC NULLS LAST,
      (d.local_client_id = l.local_client_id) DESC NULLS LAST,
      d.directory_updated_at DESC NULLS LAST
    LIMIT 1
  ) matched ON TRUE
),
activity_rollup AS (
  SELECT
    client_ref,
    COUNT(*)::bigint AS activity_count,
    MAX(event_at) AS last_activity_at,
    (ARRAY_AGG(id ORDER BY event_at DESC, created_at DESC))[1] AS last_activity_id,
    (ARRAY_AGG(sales_user_id ORDER BY event_at DESC, created_at DESC)
      FILTER (WHERE sales_user_id IS NOT NULL))[1] AS last_activity_sales_user_id,
    (ARRAY_AGG(salesperson ORDER BY event_at DESC, created_at DESC)
      FILTER (WHERE NULLIF(trim(salesperson), '') IS NOT NULL))[1] AS last_activity_salesperson,
    (ARRAY_AGG(event_type ORDER BY event_at DESC, created_at DESC))[1] AS last_activity_type,
    (ARRAY_AGG(status ORDER BY event_at DESC, created_at DESC))[1] AS last_activity_status,
    MIN(next_action_date) FILTER (
      WHERE status IN ('new', 'open', 'follow_up')
        AND next_action_date IS NOT NULL
    ) AS next_action_date,
    MAX(event_at) FILTER (
      WHERE contact_occurred IS TRUE
         OR (
           contact_occurred IS NULL
           AND event_type IN ('meeting', 'call', 'sale', 'follow_up')
         )
    ) AS last_human_contact_at,
    (ARRAY_AGG(
      CASE WHEN contact_occurred IS TRUE THEN 'exact' ELSE 'inferred' END
      ORDER BY event_at DESC, created_at DESC
    ) FILTER (
      WHERE contact_occurred IS TRUE
         OR (
           contact_occurred IS NULL
           AND event_type IN ('meeting', 'call', 'sale', 'follow_up')
         )
    ))[1] AS last_human_contact_confidence,
    MAX(updated_at) AS activity_freshness_at
  FROM activity_resolved
  GROUP BY client_ref
),
-- Canonical BINA codes already determine client_ref. Resolve names once instead
-- of rescanning the full directory for each imported invoice.
unique_invoice_names AS (
  SELECT normalized_name, MIN(client_ref) AS client_ref
  FROM directory
  GROUP BY normalized_name
  HAVING COUNT(*) = 1
),
invoice_resolved AS (
  SELECT
    COALESCE(
      CASE WHEN s.customer_code IS NOT NULL THEN 'bina:' || s.customer_code::text END,
      matched.client_ref,
      'name:' || lower(trim(s.customer_name))
    ) AS client_ref,
    s.invoice_at,
    s.synced_at
  FROM public.mart_bina_sales_status s
  LEFT JOIN unique_invoice_names matched
    ON s.customer_code IS NULL
   AND matched.normalized_name = lower(trim(s.customer_name))
  WHERE s.customer_code IS NOT NULL OR NULLIF(trim(s.customer_name), '') IS NOT NULL
),
invoice_rollup AS (
  SELECT
    client_ref,
    COUNT(*)::bigint AS invoice_count,
    MAX(invoice_at) AS last_invoice_at,
    MAX(synced_at) AS invoice_freshness_at
  FROM invoice_resolved
  GROUP BY client_ref
),
client_universe AS (
  SELECT client_ref FROM directory
  UNION
  SELECT client_ref FROM activity_rollup
  UNION
  SELECT client_ref FROM invoice_rollup
)
SELECT
  u.client_ref,
  d.local_client_id,
  d.customer_code,
  COALESCE(
    d.customer_name,
    (SELECT ar.customer_name
     FROM activity_resolved ar
     WHERE ar.client_ref = u.client_ref
     ORDER BY ar.event_at DESC, ar.created_at DESC
     LIMIT 1),
    u.client_ref
  ) AS customer_name,
  d.customer_group,
  d.customer_status,
  d.area,
  d.bookkeeping_no,
  d.tax_id,
  d.contact_person,
  d.phone,
  d.mobile,
  d.email,
  d.opened_at,
  d.directory_source,
  a.sales_user_id AS account_manager_sales_user_id,
  COALESCE(a.account_manager_name, d.directory_salesperson) AS account_manager,
  COALESCE(a.ownership_source, d.directory_source, 'missing') AS ownership_source,
  CASE
    WHEN a.id IS NOT NULL THEN a.ownership_confidence
    WHEN NULLIF(trim(d.directory_salesperson), '') IS NOT NULL THEN 'inferred'
    ELSE 'missing_data'
  END AS ownership_confidence,
  r.last_activity_id,
  r.last_activity_at,
  r.last_activity_sales_user_id,
  r.last_activity_salesperson,
  r.last_activity_type,
  r.last_activity_status,
  r.next_action_date,
  COALESCE(r.activity_count, 0)::bigint AS activity_count,
  r.last_human_contact_at,
  CASE
    WHEN r.last_human_contact_at IS NOT NULL THEN 'contacted'
    ELSE 'unknown_before_crm_rollout'
  END AS contact_state,
  CASE
    WHEN r.last_human_contact_at IS NULL THEN 'unknown'
    WHEN r.last_human_contact_at >= now() - INTERVAL '90 days' THEN 'active'
    WHEN r.last_human_contact_at >= now() - INTERVAL '180 days' THEN 'attention'
    ELSE 'dormant'
  END AS dormancy_bucket,
  CASE
    WHEN r.last_human_contact_at IS NULL THEN NULL
    ELSE GREATEST(0, (now()::date - r.last_human_contact_at::date))::integer
  END AS days_since_last_human_contact,
  COALESCE(i.invoice_count, 0)::bigint AS current_invoice_row_count,
  i.last_invoice_at,
  GREATEST(r.last_activity_at, i.last_invoice_at) AS last_commercial_activity_at,
  'gestelit_only'::text AS contact_coverage_scope,
  false AS is_complete_contact_history,
  COALESCE(r.last_human_contact_confidence, 'missing_data') AS contact_confidence,
  'היסטוריית הפניות מבוססת על דיווחי גסטליט בלבד; טרם סונכרנה היסטוריית CRM מלאה מ-BINA'::text AS coverage_note,
  GREATEST(d.directory_updated_at, r.activity_freshness_at, i.invoice_freshness_at) AS data_freshness_at
FROM client_universe u
LEFT JOIN directory d ON d.client_ref = u.client_ref
LEFT JOIN public.sales_account_assignments a
  ON a.client_ref = u.client_ref
 AND a.valid_to IS NULL
LEFT JOIN activity_rollup r ON r.client_ref = u.client_ref
LEFT JOIN invoice_rollup i ON i.client_ref = u.client_ref;


NOTIFY pgrst, 'reload schema';
