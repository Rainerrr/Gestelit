import { createServiceSupabase } from "@/lib/supabase/client";

/** Resolve identities on the server; free text never creates an implicit account. */
export async function resolveSalesActivityCustomer(salesUserId: string, input: {
  customer_code?: number | null; local_client_id?: string | null; customer_name?: string;
}) {
  if (input.customer_code != null && input.local_client_id) throw new Error("SALES_CLIENT_IDENTITY_INVALID");
  const ref = input.customer_code != null ? `bina:${input.customer_code}` : input.local_client_id ? `local:${input.local_client_id}` : null;
  if (!ref) throw new Error("SALES_CLIENT_SELECTION_REQUIRED");
  const { data, error } = await createServiceSupabase().from("sales_customer_directory")
    .select("customer_code,local_client_id,customer_name,account_manager_sales_user_id")
    .eq("client_ref", ref).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.account_manager_sales_user_id !== salesUserId) throw new Error("SALES_CLIENT_FORBIDDEN");
  return { customer_code: data.customer_code, local_client_id: data.local_client_id, customer_name: data.customer_name };
}
