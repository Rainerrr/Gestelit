-- Create storage bucket for report images (first product approval, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reports',
  'reports',
  true,  -- Public bucket so images can be viewed
  5242880,  -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Allow service role uploads to reports" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to reports" ON storage.objects;

-- Allow service role to upload to reports bucket
CREATE POLICY "Allow service role uploads to reports"
ON storage.objects
FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'reports');

-- Allow public read access to reports bucket
CREATE POLICY "Allow public read access to reports"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'reports');
