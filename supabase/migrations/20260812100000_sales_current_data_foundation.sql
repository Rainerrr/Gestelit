-- Current-data foundation for the Gestelit sales workspace.
--
-- This migration deliberately does not infer complete CRM history from BINA.
-- Human-contact and dormancy outputs are limited to Gestelit activity logs and
-- carry explicit coverage metadata until retrospective BINA sources exist.

ALTER TABLE public.sales_activity_logs
  ADD COLUMN IF NOT EXISTS contact_occurred boolean;

-- ---------------------------------------------------------------------------
-- Scoped sales roles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sales_roles (
  role_key text PRIMARY KEY,
  display_name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_roles_role_key_check
    CHECK (role_key IN ('sales_rep', 'sales_manager', 'sales_admin'))
);

CREATE TABLE IF NOT EXISTS public.sales_role_scopes (
  role_key text NOT NULL REFERENCES public.sales_roles(role_key) ON DELETE CASCADE,
  scope_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_key, scope_key),
  CONSTRAINT sales_role_scopes_scope_key_check
    CHECK (scope_key IN (
      'sales_activity_write',
      'sales_personal_view',
      'sales_team_view',
      'sales_export',
      'sales_ai_query',
      'sales_client_manage'
    ))
);

CREATE TABLE IF NOT EXISTS public.sales_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_user_id uuid NOT NULL REFERENCES public.sales_users(id) ON DELETE CASCADE,
  role_key text NOT NULL REFERENCES public.sales_roles(role_key) ON DELETE RESTRICT,
  assigned_by_sales_user_id uuid REFERENCES public.sales_users(id) ON DELETE SET NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_user_roles_validity_check
    CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_user_roles_one_active_role
  ON public.sales_user_roles (sales_user_id, role_key)
  WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_user_roles_active_user
  ON public.sales_user_roles (sales_user_id, valid_from DESC)
  WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_user_roles_active_role
  ON public.sales_user_roles (role_key, sales_user_id)
  WHERE valid_to IS NULL;

INSERT INTO public.sales_roles (role_key, display_name, description)
VALUES
  ('sales_rep', 'איש/אשת מכירות', 'גישה לדיווח ולנתונים האישיים בלבד'),
  ('sales_manager', 'מנהל/ת מכירות', 'גישה לצוות המכירות ללא הרשאות ניהול MES'),
  ('sales_admin', 'מנהל/ת מערכת מכירות', 'ניהול מלא של מודול המכירות')
ON CONFLICT (role_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    updated_at = now();

INSERT INTO public.sales_role_scopes (role_key, scope_key)
VALUES
  ('sales_rep', 'sales_activity_write'),
  ('sales_rep', 'sales_personal_view'),
  ('sales_rep', 'sales_export'),
  ('sales_rep', 'sales_ai_query'),
  ('sales_manager', 'sales_activity_write'),
  ('sales_manager', 'sales_personal_view'),
  ('sales_manager', 'sales_team_view'),
  ('sales_manager', 'sales_export'),
  ('sales_manager', 'sales_ai_query'),
  ('sales_manager', 'sales_client_manage'),
  ('sales_admin', 'sales_activity_write'),
  ('sales_admin', 'sales_personal_view'),
  ('sales_admin', 'sales_team_view'),
  ('sales_admin', 'sales_export'),
  ('sales_admin', 'sales_ai_query'),
  ('sales_admin', 'sales_client_manage')
ON CONFLICT (role_key, scope_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sales_foundation_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_roles_set_updated_at ON public.sales_roles;
CREATE TRIGGER sales_roles_set_updated_at
  BEFORE UPDATE ON public.sales_roles
  FOR EACH ROW EXECUTE FUNCTION public.sales_foundation_set_updated_at();

DROP TRIGGER IF EXISTS sales_user_roles_set_updated_at ON public.sales_user_roles;
CREATE TRIGGER sales_user_roles_set_updated_at
  BEFORE UPDATE ON public.sales_user_roles
  FOR EACH ROW EXECUTE FUNCTION public.sales_foundation_set_updated_at();

CREATE OR REPLACE FUNCTION public.assign_default_sales_rep_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.sales_user_roles (sales_user_id, role_key, reason)
  VALUES (NEW.id, 'sales_rep', 'default_role')
  ON CONFLICT (sales_user_id, role_key) WHERE valid_to IS NULL DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_default_sales_rep_role ON public.sales_users;
CREATE TRIGGER assign_default_sales_rep_role
  AFTER INSERT ON public.sales_users
  FOR EACH ROW EXECUTE FUNCTION public.assign_default_sales_rep_role();

-- Existing and future users retain their current login behavior. Roles are an
-- additive authorization contract for server routes to adopt incrementally.
INSERT INTO public.sales_user_roles (sales_user_id, role_key, reason)
SELECT u.id, 'sales_rep', 'foundation_backfill'
FROM public.sales_users u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sales_user_roles ur
  WHERE ur.sales_user_id = u.id
    AND ur.role_key = 'sales_rep'
    AND ur.valid_to IS NULL
);

-- Preserve Maty's requested team-report access without using this migration to
-- grant a generic Gestelit/MES administrator role.
INSERT INTO public.sales_user_roles (sales_user_id, role_key, reason)
SELECT u.id, 'sales_manager', 'existing_team_dashboard_access'
FROM public.sales_users u
WHERE lower(trim(u.email)) = 'maty@gestelit.co.il'
  AND NOT EXISTS (
    SELECT 1
    FROM public.sales_user_roles ur
    WHERE ur.sales_user_id = u.id
      AND ur.role_key = 'sales_manager'
      AND ur.valid_to IS NULL
  );

CREATE OR REPLACE FUNCTION public.sales_user_has_scope(
  p_sales_user_id uuid,
  p_scope_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sales_user_roles ur
    JOIN public.sales_role_scopes rs ON rs.role_key = ur.role_key
    JOIN public.sales_users u ON u.id = ur.sales_user_id
    WHERE ur.sales_user_id = p_sales_user_id
      AND rs.scope_key = p_scope_key
      AND ur.valid_from <= now()
      AND (ur.valid_to IS NULL OR ur.valid_to > now())
      AND u.is_active
  );
$$;

-- ---------------------------------------------------------------------------
-- Canonical account ownership and assignment audit
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sales_account_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_ref text NOT NULL,
  customer_code integer,
  local_client_id uuid REFERENCES public.pending_bina_clients(id) ON DELETE SET NULL,
  sales_user_id uuid REFERENCES public.sales_users(id) ON DELETE SET NULL,
  account_manager_name text NOT NULL,
  ownership_source text NOT NULL,
  ownership_confidence text NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  reason text,
  created_by_sales_user_id uuid REFERENCES public.sales_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_account_assignments_client_ref_check
    CHECK (length(trim(client_ref)) >= 3),
  CONSTRAINT sales_account_assignments_manager_name_check
    CHECK (length(trim(account_manager_name)) >= 2),
  CONSTRAINT sales_account_assignments_source_check
    CHECK (ownership_source IN ('bina_index', 'approved_local', 'manual', 'reconciliation')),
  CONSTRAINT sales_account_assignments_confidence_check
    CHECK (ownership_confidence IN ('exact', 'inferred', 'missing_data')),
  CONSTRAINT sales_account_assignments_validity_check
    CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_account_assignments_one_active
  ON public.sales_account_assignments (client_ref)
  WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_account_assignments_customer_code
  ON public.sales_account_assignments (customer_code, valid_from DESC)
  WHERE customer_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_account_assignments_local_client
  ON public.sales_account_assignments (local_client_id, valid_from DESC)
  WHERE local_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_account_assignments_manager
  ON public.sales_account_assignments (sales_user_id, valid_from DESC)
  WHERE valid_to IS NULL;

CREATE TABLE IF NOT EXISTS public.sales_account_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid,
  client_ref text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by_sales_user_id uuid REFERENCES public.sales_users(id) ON DELETE SET NULL,
  actor_source text NOT NULL DEFAULT 'unavailable',
  database_role text NOT NULL DEFAULT current_user,
  old_record jsonb,
  new_record jsonb
);

CREATE INDEX IF NOT EXISTS idx_sales_account_assignment_history_client
  ON public.sales_account_assignment_history (client_ref, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_account_assignment_history_assignment
  ON public.sales_account_assignment_history (assignment_id, changed_at DESC);

DROP TRIGGER IF EXISTS sales_account_assignments_set_updated_at ON public.sales_account_assignments;
CREATE TRIGGER sales_account_assignments_set_updated_at
  BEFORE UPDATE ON public.sales_account_assignments
  FOR EACH ROW EXECUTE FUNCTION public.sales_foundation_set_updated_at();

CREATE OR REPLACE FUNCTION public.audit_sales_account_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_source text := 'unavailable';
  v_client_ref text;
  v_assignment_id uuid;
BEGIN
  BEGIN
    v_actor_id := NULLIF(current_setting('app.sales_user_id', true), '')::uuid;
    IF v_actor_id IS NOT NULL THEN
      v_actor_source := 'app.sales_user_id';
    END IF;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_actor_id := NULL;
  END;

  v_client_ref := CASE WHEN TG_OP = 'DELETE' THEN OLD.client_ref ELSE NEW.client_ref END;
  v_assignment_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

  INSERT INTO public.sales_account_assignment_history (
    assignment_id,
    client_ref,
    operation,
    changed_by_sales_user_id,
    actor_source,
    database_role,
    old_record,
    new_record
  )
  VALUES (
    v_assignment_id,
    v_client_ref,
    TG_OP,
    v_actor_id,
    v_actor_source,
    current_user,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS audit_sales_account_assignment ON public.sales_account_assignments;
CREATE TRIGGER audit_sales_account_assignment
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_account_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_sales_account_assignment();

-- Seed canonical ownership from the current client directory. A later activity
-- never modifies this table. The matching sales user is optional because BINA
-- names may not exactly match a portal identity yet.
WITH directory_owner AS (
  SELECT DISTINCT ON (canonical_client_ref)
    canonical_client_ref AS client_ref,
    customer_code,
    local_client_id,
    trim(salesperson) AS account_manager_name,
    CASE WHEN source = 'bina_index' THEN 'bina_index' ELSE 'approved_local' END AS ownership_source,
    CASE WHEN source = 'bina_index' THEN 0 ELSE 1 END AS source_priority,
    updated_at
  FROM (
    SELECT
      COALESCE(
        CASE WHEN d.customer_code IS NOT NULL THEN 'bina:' || d.customer_code::text END,
        CASE WHEN d.local_client_id IS NOT NULL THEN 'local:' || d.local_client_id::text END,
        d.client_ref
      ) AS canonical_client_ref,
      d.*
    FROM public.mart_sales_client_directory d
    WHERE NULLIF(trim(d.salesperson), '') IS NOT NULL
  ) source_rows
  ORDER BY canonical_client_ref, source_priority, updated_at DESC NULLS LAST
)
INSERT INTO public.sales_account_assignments (
  client_ref,
  customer_code,
  local_client_id,
  sales_user_id,
  account_manager_name,
  ownership_source,
  ownership_confidence,
  reason
)
SELECT
  d.client_ref,
  d.customer_code,
  d.local_client_id,
  (
    SELECT u.id
    FROM public.sales_users u
    WHERE u.is_active
      AND regexp_replace(lower(trim(u.full_name)), '\s+', ' ', 'g') =
          regexp_replace(lower(d.account_manager_name), '\s+', ' ', 'g')
    ORDER BY u.created_at
    LIMIT 1
  ),
  d.account_manager_name,
  d.ownership_source,
  'exact',
  'current_directory_backfill'
FROM directory_owner d
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sales_account_assignments a
  WHERE a.client_ref = d.client_ref
    AND a.valid_to IS NULL
);

-- ---------------------------------------------------------------------------
-- Sales activity edit audit
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sales_activity_log_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_activity_id uuid NOT NULL,
  activity_owner_sales_user_id uuid REFERENCES public.sales_users(id) ON DELETE SET NULL,
  actor_sales_user_id uuid REFERENCES public.sales_users(id) ON DELETE SET NULL,
  actor_source text NOT NULL DEFAULT 'unavailable',
  database_role text NOT NULL DEFAULT current_user,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_fields text[] NOT NULL DEFAULT '{}'::text[],
  old_record jsonb NOT NULL,
  new_record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_activity_log_audit_activity
  ON public.sales_activity_log_audit (sales_activity_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_activity_log_audit_actor
  ON public.sales_activity_log_audit (actor_sales_user_id, changed_at DESC)
  WHERE actor_sales_user_id IS NOT NULL;

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
  WHERE new_values.key <> 'updated_at'
    AND new_values.value IS DISTINCT FROM (to_jsonb(OLD) -> new_values.key);

  IF cardinality(v_changed_fields) = 0 THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_actor_id := NULLIF(current_setting('app.sales_user_id', true), '')::uuid;
    IF v_actor_id IS NOT NULL THEN
      v_actor_source := 'app.sales_user_id';
    END IF;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_actor_id := NULL;
  END;

  INSERT INTO public.sales_activity_log_audit (
    sales_activity_id,
    activity_owner_sales_user_id,
    actor_sales_user_id,
    actor_source,
    database_role,
    changed_fields,
    old_record,
    new_record
  )
  VALUES (
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

DROP TRIGGER IF EXISTS audit_sales_activity_log_update ON public.sales_activity_logs;
CREATE TRIGGER audit_sales_activity_log_update
  AFTER UPDATE ON public.sales_activity_logs
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION public.audit_sales_activity_log_update();

-- ---------------------------------------------------------------------------
-- Current-data client, touch, dormancy, portfolio and coverage marts
-- ---------------------------------------------------------------------------

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
invoice_resolved AS (
  SELECT
    COALESCE(
      matched.client_ref,
      CASE WHEN s.customer_code IS NOT NULL THEN 'bina:' || s.customer_code::text END,
      'name:' || lower(trim(s.customer_name))
    ) AS client_ref,
    s.invoice_at,
    s.synced_at
  FROM public.mart_bina_sales_status s
  LEFT JOIN LATERAL (
    SELECT d.client_ref
    FROM directory d
    WHERE (s.customer_code IS NOT NULL AND d.customer_code = s.customer_code)
       OR (
         s.customer_code IS NULL
         AND d.normalized_name = lower(trim(s.customer_name))
       )
    ORDER BY (d.customer_code = s.customer_code) DESC NULLS LAST,
      d.directory_updated_at DESC NULLS LAST
    LIMIT 1
  ) matched ON TRUE
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

CREATE OR REPLACE VIEW public.mart_sales_client_touch_history AS
WITH directory AS (
  SELECT DISTINCT ON (canonical_client_ref)
    canonical_client_ref AS client_ref,
    local_client_id,
    customer_code,
    lower(trim(customer_name)) AS normalized_name,
    updated_at
  FROM (
    SELECT
      COALESCE(
        CASE WHEN d.customer_code IS NOT NULL THEN 'bina:' || d.customer_code::text END,
        CASE WHEN d.local_client_id IS NOT NULL THEN 'local:' || d.local_client_id::text END,
        d.client_ref
      ) AS canonical_client_ref,
      d.*
    FROM public.mart_sales_client_directory d
  ) rows
  ORDER BY canonical_client_ref, updated_at DESC NULLS LAST
),
resolved AS (
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
       )
    ORDER BY
      (d.customer_code = l.customer_code) DESC NULLS LAST,
      (d.local_client_id = l.local_client_id) DESC NULLS LAST,
      d.updated_at DESC NULLS LAST
    LIMIT 1
  ) matched ON TRUE
)
SELECT
  r.id AS activity_id,
  r.client_ref,
  r.customer_code,
  r.local_client_id,
  r.customer_name,
  p.account_manager_sales_user_id,
  p.account_manager,
  p.ownership_source,
  p.ownership_confidence,
  r.sales_user_id AS activity_sales_user_id,
  r.salesperson AS activity_salesperson,
  r.event_type,
  r.event_at,
  r.status,
  r.contact_person,
  r.raw_note,
  r.ai_summary,
  r.ai_next_action,
  r.next_action_date,
  r.estimated_revenue,
  r.actual_revenue,
  r.currency,
  r.source,
  r.contact_occurred,
  (
    r.contact_occurred IS TRUE
    OR (
      r.contact_occurred IS NULL
      AND r.event_type IN ('meeting', 'call', 'sale', 'follow_up')
    )
  ) AS is_human_touch,
  CASE
    WHEN r.contact_occurred IS TRUE THEN 'exact'
    WHEN r.contact_occurred IS NULL
      AND r.event_type IN ('meeting', 'call', 'sale', 'follow_up') THEN 'inferred'
    ELSE 'missing_data'
  END AS touch_confidence,
  'gestelit_only'::text AS coverage_scope,
  false AS is_complete_contact_history,
  r.created_at,
  r.updated_at
FROM resolved r
LEFT JOIN public.mart_sales_client_profile p ON p.client_ref = r.client_ref;

CREATE OR REPLACE VIEW public.mart_sales_client_dormancy AS
SELECT
  p.*,
  CASE p.dormancy_bucket
    WHEN 'active' THEN 'תועדה פנייה בגסטליט ב-90 הימים האחרונים'
    WHEN 'attention' THEN 'לא תועדה פנייה בגסטליט ב-3 החודשים האחרונים'
    WHEN 'dormant' THEN 'לא תועדה פנייה בגסטליט ב-6 החודשים האחרונים'
    ELSE 'אין היסטוריית פניות מלאה לפני תחילת התיעוד בגסטליט'
  END AS dormancy_label
FROM public.mart_sales_client_profile p;

CREATE OR REPLACE VIEW public.mart_sales_personal_portfolio AS
SELECT
  p.*
FROM public.mart_sales_client_dormancy p
WHERE p.account_manager_sales_user_id IS NOT NULL
   OR NULLIF(trim(p.account_manager), '') IS NOT NULL;

CREATE OR REPLACE VIEW public.mart_sales_data_coverage AS
SELECT
  'gestelit_activity'::text AS source_domain,
  'sales_activity_logs'::text AS source_relation,
  'gestelit_complete_since_rollout'::text AS coverage_scope,
  COUNT(*)::bigint AS source_row_count,
  MIN(event_at) AS source_min_at,
  MAX(event_at) AS source_max_at,
  true AS is_complete_snapshot,
  'exact'::text AS confidence,
  'אין כיסוי לפניות שהתרחשו לפני תחילת הדיווח בגסטליט'::text AS missing_requirement,
  MAX(updated_at) AS freshness_at
FROM public.sales_activity_logs
UNION ALL
SELECT
  'client_directory',
  'mart_sales_client_directory',
  'current_import_snapshot',
  COUNT(*)::bigint,
  MIN(opened_at)::timestamptz,
  MAX(updated_at),
  false,
  'inferred',
  'נדרשת השוואת ספירה מול מאסטר הלקוחות ב-BINA',
  MAX(updated_at)
FROM public.mart_sales_client_directory
UNION ALL
SELECT
  'bina_customer_invoices',
  'mart_bina_sales_status',
  'bina_recent_window',
  COUNT(*)::bigint,
  MIN(invoice_at),
  MAX(invoice_at),
  false,
  'inferred',
  'הסנכרון הקיים הוא חלון חלקי ואינו מוכיח היסטוריה מלאה',
  MAX(synced_at)
FROM public.mart_bina_sales_status
UNION ALL
SELECT
  'bina_crm_touch_history',
  'not_available',
  'missing_retro_source',
  0::bigint,
  NULL::timestamptz,
  NULL::timestamptz,
  false,
  'missing_data',
  'נדרשים מקור CRM היסטורי, מפתח לקוח, תאריך, מבצע ותוצאה',
  NULL::timestamptz
UNION ALL
SELECT
  'bina_quotes',
  'DFHatsRashi_and_details_not_synced',
  'missing_retro_source',
  0::bigint,
  NULL::timestamptz,
  NULL::timestamptz,
  false,
  'missing_data',
  'נדרש סנכרון DFHats עם מילון סטטוסים וקישור להזמנה',
  NULL::timestamptz
UNION ALL
SELECT
  'bina_commercial_orders',
  'commercial_order_source_unconfirmed',
  'missing_business_mapping',
  0::bigint,
  NULL::timestamptz,
  NULL::timestamptz,
  false,
  'missing_data',
  'יש לאשר אם DFHazmRashi הוא הזמנה מסחרית או פקודת ייצור לפני הצגת הכנסות',
  NULL::timestamptz;

-- ---------------------------------------------------------------------------
-- Database-side report contracts (no application-memory population cap)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_sales_activity_report_summary(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_activity_sales_user_id uuid DEFAULT NULL,
  p_account_manager_sales_user_id uuid DEFAULT NULL,
  p_client_ref text DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS TABLE (
  currency_code text,
  activity_count bigint,
  unique_client_count bigint,
  human_touch_count bigint,
  meeting_count bigint,
  call_count bigint,
  sale_count bigint,
  follow_up_count bigint,
  open_follow_up_count bigint,
  overdue_follow_up_count bigint,
  estimated_pipeline numeric,
  won_revenue numeric,
  coverage_scope text,
  is_complete_contact_history boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(h.currency, ''), 'ILS') AS currency_code,
    COUNT(*)::bigint AS activity_count,
    COUNT(DISTINCT h.client_ref)::bigint AS unique_client_count,
    COUNT(*) FILTER (WHERE h.is_human_touch)::bigint AS human_touch_count,
    COUNT(*) FILTER (WHERE h.event_type = 'meeting')::bigint AS meeting_count,
    COUNT(*) FILTER (WHERE h.event_type = 'call')::bigint AS call_count,
    COUNT(*) FILTER (WHERE h.event_type = 'sale')::bigint AS sale_count,
    COUNT(*) FILTER (WHERE h.event_type = 'follow_up')::bigint AS follow_up_count,
    COUNT(*) FILTER (WHERE h.status = 'follow_up')::bigint AS open_follow_up_count,
    COUNT(*) FILTER (
      WHERE h.status = 'follow_up'
        AND h.next_action_date < (now() AT TIME ZONE 'Asia/Jerusalem')::date
    )::bigint AS overdue_follow_up_count,
    COALESCE(SUM(h.estimated_revenue) FILTER (
      WHERE h.status IN ('new', 'open', 'follow_up')
    ), 0)::numeric AS estimated_pipeline,
    COALESCE(SUM(h.actual_revenue) FILTER (WHERE h.status = 'won'), 0)::numeric AS won_revenue,
    'gestelit_only'::text AS coverage_scope,
    false AS is_complete_contact_history
  FROM public.mart_sales_client_touch_history h
  WHERE h.event_at >= COALESCE(p_from, '-infinity'::timestamptz)
    AND h.event_at < COALESCE(p_to, 'infinity'::timestamptz)
    AND (p_activity_sales_user_id IS NULL OR h.activity_sales_user_id = p_activity_sales_user_id)
    AND (p_account_manager_sales_user_id IS NULL OR h.account_manager_sales_user_id = p_account_manager_sales_user_id)
    AND (p_client_ref IS NULL OR h.client_ref = p_client_ref)
    AND (p_event_type IS NULL OR h.event_type = p_event_type)
    AND (p_status IS NULL OR h.status = p_status)
  GROUP BY COALESCE(NULLIF(h.currency, ''), 'ILS')
  ORDER BY currency_code;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_activity_report_rows(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_activity_sales_user_id uuid DEFAULT NULL,
  p_account_manager_sales_user_id uuid DEFAULT NULL,
  p_client_ref text DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  activity_id uuid,
  client_ref text,
  customer_code integer,
  customer_name text,
  account_manager_sales_user_id uuid,
  account_manager text,
  activity_sales_user_id uuid,
  activity_salesperson text,
  event_type text,
  event_at timestamptz,
  status text,
  raw_note text,
  ai_summary text,
  next_action_date date,
  estimated_revenue numeric,
  actual_revenue numeric,
  currency text,
  coverage_scope text,
  total_rows bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    h.activity_id,
    h.client_ref,
    h.customer_code,
    h.customer_name,
    h.account_manager_sales_user_id,
    h.account_manager,
    h.activity_sales_user_id,
    h.activity_salesperson,
    h.event_type,
    h.event_at,
    h.status,
    h.raw_note,
    h.ai_summary,
    h.next_action_date,
    h.estimated_revenue,
    h.actual_revenue,
    h.currency,
    h.coverage_scope,
    COUNT(*) OVER ()::bigint AS total_rows
  FROM public.mart_sales_client_touch_history h
  WHERE h.event_at >= COALESCE(p_from, '-infinity'::timestamptz)
    AND h.event_at < COALESCE(p_to, 'infinity'::timestamptz)
    AND (p_activity_sales_user_id IS NULL OR h.activity_sales_user_id = p_activity_sales_user_id)
    AND (p_account_manager_sales_user_id IS NULL OR h.account_manager_sales_user_id = p_account_manager_sales_user_id)
    AND (p_client_ref IS NULL OR h.client_ref = p_client_ref)
    AND (p_event_type IS NULL OR h.event_type = p_event_type)
    AND (p_status IS NULL OR h.status = p_status)
  ORDER BY h.event_at DESC, h.activity_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.get_sales_dormant_accounts(
  p_account_manager_sales_user_id uuid DEFAULT NULL,
  p_dormancy_bucket text DEFAULT NULL,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.mart_sales_client_dormancy
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.*
  FROM public.mart_sales_client_dormancy d
  WHERE (p_account_manager_sales_user_id IS NULL OR d.account_manager_sales_user_id = p_account_manager_sales_user_id)
    AND (p_dormancy_bucket IS NULL OR d.dormancy_bucket = p_dormancy_bucket)
  ORDER BY
    CASE d.dormancy_bucket
      WHEN 'dormant' THEN 0
      WHEN 'attention' THEN 1
      WHEN 'unknown' THEN 2
      ELSE 3
    END,
    d.days_since_last_human_contact DESC NULLS LAST,
    d.customer_name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- Supporting indexes for ownership, touch, dormancy and report filters.
CREATE INDEX IF NOT EXISTS idx_sales_activity_logs_customer_code_event
  ON public.sales_activity_logs (customer_code, event_at DESC)
  WHERE customer_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_activity_logs_local_client_event
  ON public.sales_activity_logs (local_client_id, event_at DESC)
  WHERE local_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_activity_logs_normalized_customer_event
  ON public.sales_activity_logs (lower(trim(customer_name)), event_at DESC)
  WHERE customer_code IS NULL AND local_client_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_activity_logs_user_type_status_event
  ON public.sales_activity_logs (sales_user_id, event_type, status, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_activity_logs_open_next_action
  ON public.sales_activity_logs (next_action_date, sales_user_id)
  WHERE status IN ('new', 'open', 'follow_up') AND next_action_date IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS and service-role-only contracts
-- ---------------------------------------------------------------------------

ALTER TABLE public.sales_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_role_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_account_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_account_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_activity_log_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages sales roles" ON public.sales_roles;
CREATE POLICY "Service role manages sales roles"
  ON public.sales_roles FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages sales role scopes" ON public.sales_role_scopes;
CREATE POLICY "Service role manages sales role scopes"
  ON public.sales_role_scopes FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages sales user roles" ON public.sales_user_roles;
CREATE POLICY "Service role manages sales user roles"
  ON public.sales_user_roles FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages sales account assignments" ON public.sales_account_assignments;
CREATE POLICY "Service role manages sales account assignments"
  ON public.sales_account_assignments FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role reads sales assignment history" ON public.sales_account_assignment_history;
CREATE POLICY "Service role reads sales assignment history"
  ON public.sales_account_assignment_history FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS "Service role reads sales activity audit" ON public.sales_activity_log_audit;
CREATE POLICY "Service role reads sales activity audit"
  ON public.sales_activity_log_audit FOR SELECT TO service_role USING (true);

REVOKE ALL ON TABLE
  public.sales_roles,
  public.sales_role_scopes,
  public.sales_user_roles,
  public.sales_account_assignments,
  public.sales_account_assignment_history,
  public.sales_activity_log_audit
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.sales_roles,
  public.sales_role_scopes,
  public.sales_user_roles,
  public.sales_account_assignments
TO service_role;

GRANT SELECT ON TABLE
  public.sales_account_assignment_history,
  public.sales_activity_log_audit
TO service_role;

REVOKE ALL ON TABLE
  public.mart_sales_client_profile,
  public.mart_sales_client_touch_history,
  public.mart_sales_client_dormancy,
  public.mart_sales_personal_portfolio,
  public.mart_sales_data_coverage
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.mart_sales_client_profile,
  public.mart_sales_client_touch_history,
  public.mart_sales_client_dormancy,
  public.mart_sales_personal_portfolio,
  public.mart_sales_data_coverage
TO service_role;

REVOKE ALL ON FUNCTION public.sales_user_has_scope(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_sales_activity_report_summary(timestamptz, timestamptz, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_sales_activity_report_rows(timestamptz, timestamptz, uuid, uuid, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_sales_dormant_accounts(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sales_user_has_scope(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_sales_activity_report_summary(timestamptz, timestamptz, uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_sales_activity_report_rows(timestamptz, timestamptz, uuid, uuid, text, text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_sales_dormant_accounts(uuid, text, integer, integer) TO service_role;

COMMENT ON TABLE public.sales_roles IS
  'Sales-only application roles. These roles do not imply Gestelit MES administrator access.';
COMMENT ON TABLE public.sales_user_roles IS
  'Time-bounded assignments of sales users to scoped sales roles.';
COMMENT ON TABLE public.sales_account_assignments IS
  'Canonical, time-bounded account ownership. Logging an activity never changes account ownership.';
COMMENT ON TABLE public.sales_account_assignment_history IS
  'Immutable audit trail for canonical account assignment changes.';
COMMENT ON TABLE public.sales_activity_log_audit IS
  'Immutable before/after audit trail for edits to submitted sales activities.';
COMMENT ON VIEW public.mart_sales_client_profile IS
  'Current client profile keeping canonical account_manager separate from last_activity_salesperson; contact history is Gestelit-only.';
COMMENT ON VIEW public.mart_sales_client_touch_history IS
  'Activity-grain touch history with separate canonical owner and activity actor fields.';
COMMENT ON VIEW public.mart_sales_client_dormancy IS
  'Current-data dormancy classification. Unknown means retrospective CRM coverage is unavailable.';
COMMENT ON VIEW public.mart_sales_personal_portfolio IS
  'Ownership-based client portfolio for salesperson and manager views.';
COMMENT ON VIEW public.mart_sales_data_coverage IS
  'Machine-readable coverage contract distinguishing current Gestelit data from missing retrospective BINA sources.';
COMMENT ON FUNCTION public.get_sales_activity_report_summary(timestamptz, timestamptz, uuid, uuid, text, text, text) IS
  'Uncapped database aggregate grouped by currency. Authorization scope must be supplied by the trusted server session.';
COMMENT ON FUNCTION public.get_sales_activity_report_rows(timestamptz, timestamptz, uuid, uuid, text, text, text, integer, integer) IS
  'Server-filtered, paginated activity report with total row count and ownership context.';
COMMENT ON FUNCTION public.get_sales_dormant_accounts(uuid, text, integer, integer) IS
  'Paginated current-data account dormancy report with explicit Gestelit-only coverage.';
