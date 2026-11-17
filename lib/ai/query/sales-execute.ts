import { createServiceSupabase } from "@/lib/supabase/client";
import { sanitizeToolText } from "@/lib/ai/safety";
import { validateSalesAnalyticsPlan } from "./plan";
export type SalesQueryResult = { rows: unknown[]; freshness: string | null; scannedRows: number; sourceTruncated: boolean; outputTruncated: boolean; source: string };
export async function runSalesAnalyticsQuery(value: unknown, viewer: { id: string; scope: "personal" | "team" }, signal?: AbortSignal): Promise<SalesQueryResult> {
  const plan = validateSalesAnalyticsPlan(value);
  const query = createServiceSupabase().rpc("ai_query_sales_analytics", { plan, viewer_id: viewer.id, requested_scope: viewer.scope });
  const { data, error } = await query.abortSignal(signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000));
  if (error) {
    if (error.code === "57014") throw new Error("SALES_AI_QUERY_TIMEOUT");
    if (error.code === "42501" || error.message === "AI_QUERY_SCOPE_FORBIDDEN") throw new Error("SALES_AI_QUERY_FORBIDDEN");
    throw new Error("SALES_AI_QUERY_UNAVAILABLE");
  }
  if (!data || !Array.isArray(data.rows)) throw new Error("SALES_AI_QUERY_UNAVAILABLE");
  return sanitizeToolText(data) as SalesQueryResult;
}
