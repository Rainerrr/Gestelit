-- Sales-only portal support.
-- Keeps the existing sales_activity_logs table as the source of truth while
-- adding authenticated salesperson identities and attachment metadata.

CREATE TABLE IF NOT EXISTS public.sales_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_users_active_email
  ON public.sales_users (is_active, lower(email));

ALTER TABLE public.sales_activity_logs
  ADD COLUMN IF NOT EXISTS sales_user_id uuid REFERENCES public.sales_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portal_submitted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sales_activity_logs_sales_user_event_at
  ON public.sales_activity_logs (sales_user_id, event_at DESC);

CREATE TABLE IF NOT EXISTS public.sales_activity_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_activity_id uuid NOT NULL REFERENCES public.sales_activity_logs(id) ON DELETE CASCADE,
  sales_user_id uuid REFERENCES public.sales_users(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL CHECK (file_size > 0),
  storage_bucket text NOT NULL DEFAULT 'sales-activity-attachments',
  storage_path text NOT NULL,
  public_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_activity_attachments_activity
  ON public.sales_activity_attachments (sales_activity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_activity_attachments_user
  ON public.sales_activity_attachments (sales_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.sales_users_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.email = lower(trim(NEW.email));
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_users_set_updated_at ON public.sales_users;
CREATE TRIGGER sales_users_set_updated_at
  BEFORE INSERT OR UPDATE ON public.sales_users
  FOR EACH ROW EXECUTE FUNCTION public.sales_users_set_updated_at();

ALTER TABLE public.sales_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_activity_attachments ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sales-activity-attachments',
  'sales-activity-attachments',
  true,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow service role uploads to sales activity attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to sales activity attachments" ON storage.objects;

CREATE POLICY "Allow service role uploads to sales activity attachments"
ON storage.objects
FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'sales-activity-attachments');

CREATE POLICY "Allow public read access to sales activity attachments"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'sales-activity-attachments');

COMMENT ON TABLE public.sales_users IS 'Sales portal users who can submit sales activity logs.';
COMMENT ON TABLE public.sales_activity_attachments IS 'Files uploaded by salespeople for sales activity evidence.';
