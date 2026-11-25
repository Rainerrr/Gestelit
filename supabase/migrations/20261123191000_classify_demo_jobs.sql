ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
-- Only explicit QA/demo identities. Do not guess from short numeric job numbers.
UPDATE public.jobs SET is_test = true
WHERE job_number ~ '^(DEMO_FLOW_|PROD_DEMO_|QA-|test_)'
   OR customer_name IN ('לקוח בדיקה','בדיקה');
COMMENT ON COLUMN public.jobs.is_test IS 'Explicit demo/test classification; retained records excluded from operational overview by default.';
NOTIFY pgrst, 'reload schema';
