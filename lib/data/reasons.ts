import { createServiceSupabase } from "@/lib/supabase/client";
import type { Reason, ReasonType } from "@/lib/types";

export async function fetchReasonsByType(
  type: ReasonType,
): Promise<Reason[]> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("reasons")
    .select("*")
    .eq("type", type)
    .eq("is_active", true)
    .order("label_he", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch reasons: ${error.message}`);
  }

  return (data as Reason[]) ?? [];
}

