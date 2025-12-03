import { createServiceSupabase } from "@/lib/supabase/client";
import type {
  ChecklistKind,
  StationChecklist,
  StationChecklistItem,
} from "@/lib/types";

export async function fetchChecklist(
  stationId: string,
  kind: ChecklistKind,
): Promise<StationChecklist | null> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("stations")
    .select("id, start_checklist, end_checklist")
    .eq("id", stationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch checklist: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const checklistItems =
    (kind === "start" ? data.start_checklist : data.end_checklist) ?? [];

  const items = [...(checklistItems as StationChecklistItem[])].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
  );

  if (!items.length) {
    return null;
  }

  return {
    kind,
    items,
  };
}