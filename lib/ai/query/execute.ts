import { createServiceSupabase } from "@/lib/supabase/client";
import { analyticsDatasets, validateAnalyticsPlan, workOrderQuantityMeanings } from "./plan";
import { sanitizeToolText } from "@/lib/ai/safety";
import type { AiToolResult } from "@/lib/ai/tools/bina-tools";
export async function runAnalyticsQuery(value: unknown): Promise<AiToolResult> {
  const plan = validateAnalyticsPlan(value, "admin");
  const { data, error } = await createServiceSupabase().rpc("ai_query_analytics", { plan });
  if (error) throw new Error("AI_ANALYTICS_QUERY_UNAVAILABLE");
  const result = data as { rows?: unknown[]; freshness?: string; sourceTruncated?: boolean; outputTruncated?: boolean; scannedRows?: number } | null;
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const source = analyticsDatasets[plan.dataset].view;
  const measureDefinitions = (plan.measures ?? []).map((measure, index) => ({
    output: `m${index}`,
    operation: measure.op,
    column: measure.column ?? null,
    meaning: measure.op === "count" ? "Number of matching cached records" :
      plan.dataset === "work_orders" ? workOrderQuantityMeanings[measure.column as keyof typeof workOrderQuantityMeanings] : measure.column,
  }));
  return {
    name: "query_analytics", data: sanitizeToolText({ ...result, plan, measureDefinitions, coverageWarning: "Synced cache only; BINA source may be partial. Counts and totals cover the filtered cached sample, not company-wide data. Null currency remains unknown. Source sampling is unranked; when sourceTruncated is true, requested top/latest/ranking applies only within the sample and cannot establish a global top or latest. sourceTruncated and outputTruncated describe separate limits." }),
    rowCount: rows.length, sources: [source], freshness: result?.freshness ?? null,
    citations: [{ source_view: source, grain: plan.measures ? "filtered_cache_aggregate" : "filtered_cache_rows", key: "query_plan", label: `שאילתה מותאמת: ${result?.scannedRows ?? 0} רשומות מטמון${result?.sourceTruncated ? " (מדגם מוגבל)" : ""}`, synced_at: result?.freshness ?? null, confidence: result?.sourceTruncated ? "inferred" : "exact", fields_used: [...(plan.columns ?? []), ...(plan.groupBy ?? []), ...(plan.measures ?? []).flatMap((m) => m.column ? [m.column] : [])] }],
  };
}
