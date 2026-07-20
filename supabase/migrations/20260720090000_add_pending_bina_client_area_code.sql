-- Preserve BINA's geographic area identifier separately from its Hebrew label.
-- Existing staged clients remain valid because the new field is nullable.

ALTER TABLE public.pending_bina_clients
  ADD COLUMN IF NOT EXISTS area_code text;

ALTER TABLE public.pending_bina_clients
  DROP CONSTRAINT IF EXISTS pending_bina_clients_area_code_check;

ALTER TABLE public.pending_bina_clients
  ADD CONSTRAINT pending_bina_clients_area_code_check
  CHECK (area_code IS NULL OR area_code IN ('02', '03', '04', '08'));

CREATE INDEX IF NOT EXISTS idx_pending_bina_clients_area_code
  ON public.pending_bina_clients (area_code)
  WHERE area_code IS NOT NULL;

CREATE OR REPLACE VIEW public.mart_bina_client_writeback_queue AS
SELECT
  p.id,
  p.sync_status,
  p.created_at,
  p.updated_at,
  p.created_by_sales_user,
  jsonb_build_object(
    'schema_version', 1,
    'customer_code', p.bina_customer_code,
    'name', p.customer_name,
    'legal_name', p.legal_name,
    'group', p.customer_group,
    'area_code', p.area_code,
    'area', p.area,
    'status', p.status,
    'customer_warehouse', p.customer_warehouse,
    'address', p.address_line,
    'neighborhood', p.neighborhood,
    'city', p.city,
    'po_box', p.po_box,
    'postal_code', p.postal_code,
    'bookkeeping_no', p.bookkeeping_no,
    'tax_id', p.tax_id,
    'contact_person', p.contact_person,
    'phone', p.phone,
    'mobile', p.mobile,
    'email', p.email,
    'salesperson', p.salesperson,
    'notes', p.notes
  ) AS writeback_payload
FROM public.pending_bina_clients p
WHERE p.sync_status IN ('pending', 'ready', 'failed');

COMMENT ON COLUMN public.pending_bina_clients.area_code IS
  'BINA geographic area code: 02 Jerusalem, 03 Tel Aviv/center, 04 Haifa/north, 08 lowlands/south.';
