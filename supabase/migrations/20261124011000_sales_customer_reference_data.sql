BEGIN;
CREATE OR REPLACE VIEW public.sales_customer_groups AS
 SELECT DISTINCT trim(customer_group) AS customer_group FROM public.mart_sales_client_directory
 WHERE nullif(trim(customer_group),'') IS NOT NULL AND customer_group NOT LIKE 'QA%';
REVOKE ALL ON public.sales_customer_groups FROM anon,authenticated;
GRANT SELECT ON public.sales_customer_groups TO service_role;
-- A newly imported master customer gets a canonical assignment only when its
-- owner matches an approved alias; manual or existing ownership is never overwritten.
CREATE OR REPLACE FUNCTION public.assign_imported_sales_customer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.sales_account_assignments(client_ref,customer_code,sales_user_id,account_manager_name,ownership_source,ownership_confidence,reason)
 SELECT 'bina:'||NEW.customer_code,NEW.customer_code,u.id,NEW.salesperson,'bina_index','exact','Approved owner alias on master import'
 FROM public.sales_owner_aliases a JOIN public.sales_users u ON u.id=a.sales_user_id AND u.is_active
 WHERE a.source_name=trim(NEW.salesperson)
 ON CONFLICT (client_ref) WHERE valid_to IS NULL DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER assign_imported_sales_customer AFTER INSERT OR UPDATE ON public.bina_client_index FOR EACH ROW EXECUTE FUNCTION public.assign_imported_sales_customer();
COMMIT;
NOTIFY pgrst,'reload schema';
