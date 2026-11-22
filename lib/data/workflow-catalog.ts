import { createServiceSupabase } from "@/lib/supabase/client";
import type { Station } from "@/lib/types";

export const fetchWorkflowCatalog = async (): Promise<Station[]> => {
  const { data, error } = await createServiceSupabase()
    .from("stations")
    .select("id,name,code,station_type,is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error("WORKFLOW_CATALOG_UNAVAILABLE");
  return data ?? [];
};
