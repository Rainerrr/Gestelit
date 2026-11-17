-- Sales evidence must only be served through the authenticated signed-download API.
UPDATE storage.buckets
SET public = false
WHERE id = 'sales-activity-attachments';

DROP POLICY IF EXISTS "Allow public read access to sales activity attachments" ON storage.objects;

-- Service-role access is used by the server-side upload and signed URL flow.
DROP POLICY IF EXISTS "Allow service role uploads to sales activity attachments" ON storage.objects;
CREATE POLICY "Allow service role uploads to sales activity attachments"
ON storage.objects
FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'sales-activity-attachments');

COMMENT ON COLUMN public.sales_activity_attachments.public_url IS
  'Legacy field retained for compatibility. Application responses replace it with an authenticated download route.';
