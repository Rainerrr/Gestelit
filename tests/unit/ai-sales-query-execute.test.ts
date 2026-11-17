import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createServiceSupabase: () => ({ rpc: mocks.rpc }) }));
import { runSalesAnalyticsQuery } from "@/lib/ai/query/sales-execute";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockReturnValue({ abortSignal: mocks.abortSignal });
  mocks.abortSignal.mockResolvedValue({ data: { rows: [{ m0: 236 }], scannedRows: 236, source: "mart_sales_activity_scoped", freshness: "2026-07-20T10:00:00Z", latestSync: "2026-09-14T10:00:00Z", sourceTruncated: false, outputTruncated: false }, error: null });
});
describe("sales activity timestamp evidence", () => {
  it("labels row update dates explicitly and never exposes them as sync freshness", async () => {
    const result = await runSalesAnalyticsQuery({ dataset: "sales_activity", measures: [{ op: "count" }] }, { id: "server-viewer", scope: "personal" });
    expect(result.freshness).toBeNull();
    expect(result).not.toHaveProperty("latestSync");
    expect(result.oldestRecordUpdate).toBe("2026-07-20T10:00:00Z");
    expect(result.latestRecordUpdate).toBe("2026-09-14T10:00:00Z");
    expect(result.timestampSemantics).toBe("record_update_times_only_not_sync_or_ingestion_cutoff");
  });
  it("retains server scope and canonicalizes the captured grouped model plan", async () => {
    await runSalesAnalyticsQuery({ dataset: "sales_activity", columns: ["salesperson"], groupBy: ["salesperson"], measures: [{ op: "count" }] }, { id: "server-viewer", scope: "personal" });
    expect(mocks.rpc).toHaveBeenCalledWith("ai_query_sales_analytics", { plan: { dataset: "sales_activity", groupBy: ["salesperson"], measures: [{ op: "count" }] }, viewer_id: "server-viewer", requested_scope: "personal" });
  });
});
