import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createServiceSupabase: () => ({ rpc: m.rpc }) }));
import { runAnalyticsQuery } from "@/lib/ai/query/execute";
beforeEach(() => {
  m.rpc.mockResolvedValue({ data: { rows: [{ m0: 1, m1: 800 }], scannedRows: 1 }, error: null });
});
describe("work-order quantity evidence", () => {
  it("labels aggregate output as the exact source field used", async () => {
    const result = await runAnalyticsQuery({ dataset: "work_orders", measures: [{ op: "count" }, { op: "sum", column: "bina_quantity" }] });
    expect(result.data).toMatchObject({ measureDefinitions: [
      { output: "m0", operation: "count", column: null },
      { output: "m1", column: "bina_quantity", meaning: expect.stringContaining("BINA ERP planned/order quantity") },
    ] });
    expect(result.citations?.[0].fields_used).toContain("bina_quantity");
  });
  it("does not relabel linked Gestelit quantities as BINA quantities", async () => {
    const result = await runAnalyticsQuery({ dataset: "work_orders", measures: [{ op: "sum", column: "gestelit_planned_quantity" }] });
    expect(result.data).toMatchObject({ measureDefinitions: [{ column: "gestelit_planned_quantity", meaning: expect.stringContaining("NOT the BINA planned quantity") }] });
  });
});
