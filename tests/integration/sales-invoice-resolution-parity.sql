-- Self-contained parity regression. No application tables read or changed.
DO $test$
DECLARE differences integer;
BEGIN
WITH directory(client_ref,customer_code,normalized_name,directory_updated_at) AS (
 VALUES ('bina:1',1,'unique','2026-01-01'::timestamptz),('bina:2',2,'duplicate','2026-01-01'::timestamptz),('local:3',NULL,'duplicate','2026-02-01'::timestamptz),('local:4',NULL,'local only','2026-01-01'::timestamptz)
), invoices(id,customer_code,customer_name) AS (
 VALUES (1,1,'Unrelated name'),(2,99,'Unique'),(3,NULL,' UNIQUE '),(4,NULL,'duplicate'),(5,NULL,'Local Only'),(6,NULL,'Missing'),(7,NULL,NULL),(8,NULL,'  '),(9,0,NULL)
), old_result AS (
 SELECT s.id,COALESCE(matched.client_ref,CASE WHEN s.customer_code IS NOT NULL THEN 'bina:'||s.customer_code::text END,'name:'||lower(trim(s.customer_name))) AS ref
 FROM invoices s LEFT JOIN LATERAL (
 SELECT d.client_ref FROM directory d WHERE (s.customer_code IS NOT NULL AND d.customer_code=s.customer_code) OR (s.customer_code IS NULL AND d.normalized_name=lower(trim(s.customer_name)) AND 1=(SELECT COUNT(*) FROM directory candidates WHERE candidates.normalized_name=lower(trim(s.customer_name))))
 ORDER BY (d.customer_code=s.customer_code) DESC NULLS LAST,d.directory_updated_at DESC NULLS LAST LIMIT 1
 ) matched ON TRUE WHERE s.customer_code IS NOT NULL OR NULLIF(trim(s.customer_name),'') IS NOT NULL
), names AS (
 SELECT normalized_name,MIN(client_ref) client_ref FROM directory GROUP BY normalized_name HAVING COUNT(*)=1
), new_result AS (
 SELECT s.id,COALESCE(CASE WHEN s.customer_code IS NOT NULL THEN 'bina:'||s.customer_code::text END,matched.client_ref,'name:'||lower(trim(s.customer_name))) AS ref
 FROM invoices s LEFT JOIN names matched ON s.customer_code IS NULL AND matched.normalized_name=lower(trim(s.customer_name))
 WHERE s.customer_code IS NOT NULL OR NULLIF(trim(s.customer_name),'') IS NOT NULL
)
SELECT COUNT(*) INTO differences FROM ((SELECT * FROM old_result EXCEPT ALL SELECT * FROM new_result) UNION ALL (SELECT * FROM new_result EXCEPT ALL SELECT * FROM old_result)) diff;
IF differences <> 0 THEN RAISE EXCEPTION 'Invoice resolution parity failed: %',differences; END IF;
RAISE NOTICE 'PASS invoice canonical-code/name/duplicate/null parity';
END $test$;
