import type { StationChecklist } from "@/lib/types";

export function canCompleteChecklist(
  state: { loading: boolean; failed: boolean; checklist: StationChecklist | null },
  responses: Record<string, boolean>,
): boolean {
  if (state.loading || state.failed) return false;
  return state.checklist?.items.every((item) => !item.is_required || responses[item.id] === true) ?? true;
}
