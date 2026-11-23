import { createServiceSupabase } from "@/lib/supabase/client";
import { sanitizeToolText } from "@/lib/ai/safety";
import { validateSalesAnalyticsPlan, validateSalesBusinessPlan } from "./plan";
export type SalesQueryResult = {
  rows: unknown[];
  freshness: string | null;
  scannedRows: number;
  sourceTruncated: boolean;
  outputTruncated: boolean;
  source: string;
  oldestRecordUpdate?: string | null;
  latestRecordUpdate?: string | null;
  timestampSemantics?: string;
};
export async function runSalesAnalyticsQuery(
  value: unknown,
  viewer: { id: string; scope: "personal" | "team" },
  signal?: AbortSignal,
): Promise<SalesQueryResult> {
  const plan = validateSalesAnalyticsPlan(value);
  const query = createServiceSupabase().rpc("ai_query_sales_analytics", {
    plan,
    viewer_id: viewer.id,
    requested_scope: viewer.scope,
  });
  const { data, error } = await query.abortSignal(
    signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  );
  if (error) {
    if (error.code === "57014") throw new Error("SALES_AI_QUERY_TIMEOUT");
    if (error.code === "42501" || error.message === "AI_QUERY_SCOPE_FORBIDDEN")
      throw new Error("SALES_AI_QUERY_FORBIDDEN");
    throw new Error("SALES_AI_QUERY_UNAVAILABLE");
  }
  if (!data || !Array.isArray(data.rows))
    throw new Error("SALES_AI_QUERY_UNAVAILABLE");
  // This mart contains manually recorded activity, not a synchronized ERP feed.
  // Legacy RPC names refer to row updated_at values and are not sync evidence.
  const { freshness: oldest, latestSync: latest, ...result } = data;
  return sanitizeToolText({
    ...result,
    freshness: null,
    oldestRecordUpdate: typeof oldest === "string" ? oldest : null,
    latestRecordUpdate: typeof latest === "string" ? latest : null,
    timestampSemantics: "record_update_times_only_not_sync_or_ingestion_cutoff",
  }) as SalesQueryResult;
}

export async function runSalesBusinessQuery(
  value: unknown,
  viewer: { id: string; scope: "personal" | "team" },
  signal?: AbortSignal,
): Promise<SalesQueryResult> {
  const plan = validateSalesBusinessPlan(value);
  const { data, error } = await createServiceSupabase()
    .rpc("ai_query_sales_business", {
      plan,
      viewer_id: viewer.id,
      requested_scope: viewer.scope,
    })
    .abortSignal(
      signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    );
  if (error || !data || !Array.isArray(data.rows))
    throw new Error("SALES_AI_QUERY_UNAVAILABLE");
  return sanitizeToolText(data) as SalesQueryResult;
}
