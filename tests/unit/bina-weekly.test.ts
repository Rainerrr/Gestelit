import { describe, expect, it, vi } from "vitest";
import { previousWeek, weeklyRange } from "@/lib/bina/weekly";
const source = vi.hoisted(() => ({ fail: false, calls: [] as unknown[][] }));
vi.mock("@/lib/supabase/client", () => ({ createServiceSupabase: () => ({ from: (table: string) => {
  let head = false;
  const query = {
    select: (_: string, opts?: { head?: boolean }) => { head = Boolean(opts?.head); return query; },
    gte: (...args: unknown[]) => { source.calls.push(args); return query; },
    lt: (...args: unknown[]) => { source.calls.push(args); return query; },
    in: () => query, order: () => query,
    is: () => Promise.resolve({ count: 3, error: null }),
    range: (from: number) => {
      if (source.fail) return Promise.resolve({ data: null, error: new Error("offline") });
      const data = table === "bina_dfhazmrashi" ? [{ bina_id: "1", synced_at: "2026-11-22T07:00:00Z", data: { MisparDFHazmana: 1, TarikRishum: null, TarikKabala: "2026-11-15T00:00:00", ShemLako: "לקוח", Kamut: 100 } }] : table === "bina_dfshelita" ? [
        { data: { MisparRashi: 1, Mekona: " CD5 ", Status: 2, TarikEnd: "2026-11-17T00:00:00" } },
        { data: { MisparRashi: 1, Mekona: "CD5", Status: 2, TarikEnd: "2026-11-22T00:00:00" } },
      ] : from === 0 ? Array.from({ length: 500 }, (_, i) => ({ bina_id: String(i), flow_type: "goods_receipt", document_no: String(i), document_at: "2026-11-16T00:00:00Z", supplier_code: 1, supplier_name: "ספק" })) : [{ bina_id: "500", flow_type: "goods_receipt", document_no: "500", document_at: "2026-11-16T00:00:00Z", supplier_code: 1, supplier_name: "ספק" }];
      return Promise.resolve({ data: head ? [] : data, error: null });
    },
  };
  return query;
} }) }));
import { fetchBinaWeekly } from "@/lib/data/bina-weekly";

describe("weekly BINA evidence", () => {
  it("uses previous complete Israel Sunday-Saturday, including at UTC Saturday night", () => {
    expect(previousWeek(new Date("2026-11-21T22:30:00Z"))).toEqual({ start: "2026-11-15", end: "2026-11-22" });
    expect(previousWeek(new Date("2026-11-21T12:00:00Z"))).toEqual({ start: "2026-11-08", end: "2026-11-15" });
  });
  it("rejects invalid dates and handles year boundaries", () => {
    expect(() => weeklyRange("2026-02-30")).toThrow("INVALID_WEEK_START");
    expect(() => weeklyRange("2026-11-15 or true")).toThrow();
    expect(weeklyRange("2026-12-27").end).toBe("2027-01-03");
  });
  it("reads subsequent pages, uses receipt dates, and does not double count station jobs", async () => {
    const result = await fetchBinaWeekly("2026-11-15");
    expect(result.orderCount).toBe(1);
    expect(result.orders[0].received).toBe("2026-11-15");
    expect(result.purchaseCount).toBe(501);
    expect(result.stations[0]).toMatchObject({ name: "CD5", rows: 2, orderIds: [1], reportedCompleteRows: 2, datedCompleteRows: 1 });
    expect(result.missingReceivedDateCount).toBe(3);
    expect(source.calls).toContainEqual(["data->>TarikKabala", "2026-11-15"]);
    expect(source.calls).toContainEqual(["document_at", "2026-11-22T00:00:00Z"]);
  });
  it("fails on unavailable domains instead of reporting false zero", async () => {
    source.fail = true;
    await expect(fetchBinaWeekly("2026-11-15")).rejects.toThrow("WEEKLY_SOURCE_UNAVAILABLE");
    source.fail = false;
  });
});
